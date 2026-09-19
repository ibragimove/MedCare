"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import TopBar from "@/components/TopBar";
import BackButton from "@/components/BackButton";
import type { Patient } from "@/types/db";

export default function CheckinForm({ patientId }: { patientId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    matchPercent: number;
    status: "on_track" | "deviation";
    recommendation: string;
  } | null>(null);

  useEffect(() => {
    supabase
      .from("patients")
      .select("*, nurses(full_name, tuman, village)")
      .eq("id", patientId)
      .single()
      .then(({ data }) => {
        setPatient(data as Patient);
        setLoading(false);
      });
  }, [supabase, patientId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!patient?.checkin_questions) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Xatolik yuz berdi");
      setResult(data.score);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const questions = patient?.checkin_questions ?? [];
  const allAnswered = questions.every((q) => q in answers);

  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:px-6">
        <div className="mb-4">
          <BackButton fallbackHref="/nurse" label="Orqaga" />
        </div>

        {loading ? (
          <div className="mt-4 space-y-3">
            <div className="h-7 w-2/3 animate-pulse rounded-lg bg-gray-100" />
            <div className="h-4 w-1/2 animate-pulse rounded-lg bg-gray-100" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : !patient ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">Bemor topilmadi.</div>
        ) : (
          <>
            <div className="mt-3 mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 text-lg font-bold text-white">
                {patient.full_name.charAt(0)}
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-gray-900">{patient.full_name}</h1>
                <p className="text-sm text-gray-500">
                  {patient.tuman}, {patient.village} · {patient.diagnosis} · {patient.drug_name} ({patient.dosage})
                </p>
              </div>
            </div>

            {result ? (
              <div
                className={`rounded-2xl border p-6 shadow-sm ${
                  result.status === "on_track"
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-red-200 bg-red-50"
                }`}
              >
                <p className="text-lg font-bold">
                  Moslik: {result.matchPercent}% —{" "}
                  {result.status === "on_track" ? "Yaxshi holat" : "Chetlanish aniqlandi"}
                </p>
                <p className="mt-2 text-sm text-gray-700">{result.recommendation}</p>
                {result.status === "deviation" && (
                  <p className="mt-3 text-sm font-medium text-red-700">
                    Shifokorga avtomatik xabarnoma yuborildi.
                  </p>
                )}
                <Link
                  href="/nurse"
                  className="mt-4 inline-block rounded-xl bg-gradient-to-r from-teal-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-md hover:from-teal-700 hover:to-cyan-600"
                >
                  Bemorlar roʻyxatiga qaytish
                </Link>
              </div>
            ) : questions.length === 0 ? (
              <p className="rounded-2xl border-2 border-dashed border-gray-200 p-6 text-center text-gray-500">
                Bu bemor uchun nazorat savollari topilmadi.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <h2 className="text-base font-bold text-gray-800">Bugungi nazorat soʻrovnomasi</h2>
                {questions.map((q) => (
                  <div key={q} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <p className="mb-3 font-medium text-gray-800">{q}</p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setAnswers({ ...answers, [q]: true })}
                        className={`flex-1 rounded-xl border px-4 py-2 font-semibold transition ${
                          answers[q] === true
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        Ha
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnswers({ ...answers, [q]: false })}
                        className={`flex-1 rounded-xl border px-4 py-2 font-semibold transition ${
                          answers[q] === false
                            ? "border-red-500 bg-red-50 text-red-700"
                            : "border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        Yoʻq
                      </button>
                    </div>
                  </div>
                ))}

                {error && <p className="text-sm text-red-600">{error}</p>}

                <button
                  type="submit"
                  disabled={!allAnswered || submitting}
                  className="w-full rounded-xl bg-gradient-to-r from-teal-600 to-cyan-500 px-5 py-3 font-semibold text-white shadow-md transition hover:from-teal-700 hover:to-cyan-600 disabled:opacity-50"
                >
                  {submitting ? "⏳ AI baholamoqda..." : "Yuborish"}
                </button>
              </form>
            )}
          </>
        )}
      </main>
    </>
  );
}
