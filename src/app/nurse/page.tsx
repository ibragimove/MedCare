"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import TopBar from "@/components/TopBar";
import type { Patient } from "@/types/db";

function statusDot(patient: Patient) {
  const pct = patient.last_match_percent;
  if (pct === null) return { color: "bg-slate-300", label: "Kutilmoqda", text: "text-slate-600" };
  if (pct >= 90) return { color: "bg-emerald-500", label: `${pct}% Yaxshi`, text: "text-emerald-700" };
  if (pct >= 70) return { color: "bg-amber-500", label: `${pct}% Kuzatuvda`, text: "text-amber-700" };
  return { color: "bg-red-500 animate-pulse", label: `${pct}% Xavfli`, text: "text-red-700" };
}

export default function NursePage() {
  const supabase = useMemo(() => createClient(), []);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("nurse_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.nurse_id) {
        setError("Sizning hamshira profilingiz hech qaysi hududga biriktirilmagan.");
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("patients")
        .select("*, nurses(full_name, village)")
        .eq("assigned_nurse_id", profile.nurse_id)
        .order("created_at", { ascending: false });

      setPatients((data as Patient[]) ?? []);
      setLoading(false);
    }
    load();
  }, [supabase]);

  const activePatients = patients.filter((p) => !p.completed_at);
  const donePatients = patients.filter((p) => p.completed_at);

  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Menga biriktirilgan bemorlar</h1>
          <p className="text-sm text-gray-500">Kunlik nazorat va check-in</p>
        </div>

        {/* Stats */}
        {!loading && !error && (
          <div className="mb-6 grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100 text-center">
              <p className="text-2xl font-bold text-gray-800">{patients.length}</p>
              <p className="text-xs text-gray-500">Jami</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100 text-center">
              <p className="text-2xl font-bold text-teal-600">{activePatients.length}</p>
              <p className="text-xs text-gray-500">Faol</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100 text-center">
              <p className="text-2xl font-bold text-emerald-600">{donePatients.length}</p>
              <p className="text-xs text-gray-500">Yakunlangan</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />)}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
            <p className="font-semibold">Xatolik</p>
            <p className="text-sm">{error}</p>
          </div>
        ) : activePatients.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 p-10 text-center">
            <p className="text-4xl">💊</p>
            <p className="mt-2 font-medium text-gray-600">Hozircha biriktirilgan bemorlar yoʻq</p>
          </div>
        ) : (
          <>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Faol bemorlar</h2>
            <ul className="space-y-3">
              {activePatients.map((patient) => {
                const s = statusDot(patient);
                return (
                  <li key={patient.id}>
                    <Link
                      href={`/nurse/${patient.id}`}
                      className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-teal-300 hover:shadow-md"
                    >
                      <div className="relative shrink-0">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 text-lg font-bold text-white">
                          {patient.full_name.charAt(0)}
                        </div>
                        <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${s.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800">{patient.full_name}</p>
                        <p className="text-sm text-gray-500 truncate">{patient.village} · {patient.diagnosis}</p>
                        <p className={`mt-0.5 text-xs font-medium ${s.text}`}>{s.label}</p>
                      </div>
                      <span className="shrink-0 rounded-lg bg-teal-50 px-3 py-1.5 text-sm font-semibold text-teal-700">
                        Nazorat →
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {donePatients.length > 0 && (
              <div className="mt-6">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Yakunlangan</h2>
                <ul className="space-y-2">
                  {donePatients.map((patient) => (
                    <li key={patient.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-500">
                        {patient.full_name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-600">{patient.full_name}</p>
                        <p className="text-xs text-gray-400">{patient.diagnosis}</p>
                      </div>
                      <span className="ml-auto text-xs text-emerald-600">✓ Tugallandi</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
