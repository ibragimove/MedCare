"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState, ErrorBanner, callApi } from "@/components/nurse/shared";
import { INPUT } from "@/components/patient-detail/ui";
import { statusBadge } from "@/lib/patient-status";
import type { NursePatientRow } from "@/types/nurse";

type Filter = "active" | "completed" | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "active", label: "Faol" },
  { id: "completed", label: "Yakunlangan" },
  { id: "all", label: "Barchasi" },
];

export default function PatientsTab() {
  const [patients, setPatients] = useState<NursePatientRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("active");

  const load = useCallback(async () => {
    try {
      const data = await callApi<{ patients: NursePatientRow[] }>("/api/patients");
      setPatients(data.patients);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("uz");
    return (patients ?? []).filter((p) => {
      if (filter === "active" && p.completed_at) return false;
      if (filter === "completed" && !p.completed_at) return false;
      if (!q) return true;
      return [p.full_name, p.diagnosis, p.village, p.tuman].some((v) => v?.toLocaleLowerCase("uz").includes(q));
    });
  }, [patients, query, filter]);

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ism, tashxis yoki mahalla boʻyicha qidirish"
        aria-label="Bemorlarni qidirish"
        className={`${INPUT} min-h-12`}
      />

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-gray-100 p-1" role="tablist" aria-label="Bemorlar filtri">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`min-h-11 rounded-xl text-sm font-semibold transition ${
              filter === f.id ? "bg-white text-teal-700 shadow-sm" : "text-gray-600"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      {patients === null && !error ? (
        <div className="space-y-3" aria-busy="true" aria-label="Yuklanmoqda">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        patients !== null && (
          <EmptyState
            icon="🧑‍⚕️"
            title={query ? "Hech narsa topilmadi" : "Bemorlar yoʻq"}
            hint={query ? "Boshqa soʻz bilan qidirib koʻring." : "Sizga biriktirilgan bemorlar shu yerda koʻrinadi."}
          />
        )
      ) : (
        <ul className="space-y-3">
          {visible.map((p) => {
            const badge = statusBadge(p);
            return (
              <li key={p.id} className={`flex items-stretch gap-2 rounded-2xl border bg-white shadow-sm ${badge.card}`}>
                <Link
                  href={`/nurse/patients/${p.id}`}
                  className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 py-3 outline-none focus-visible:ring-4 focus-visible:ring-teal-300"
                >
                  <span className={`h-3 w-3 shrink-0 rounded-full ${badge.dot}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold text-gray-900">{p.full_name}</span>
                    <span className="block truncate text-sm text-gray-600">
                      {p.village}, {p.tuman}
                    </span>
                    <span className="block truncate text-xs text-gray-500">{p.diagnosis}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${p.completed_at ? "bg-slate-100 text-slate-600" : badge.badge}`}>
                    {p.completed_at ? "Yakunlangan" : badge.label}
                    {!p.completed_at && badge.pct !== null ? ` ${badge.pct}%` : ""}
                  </span>
                </Link>
                {!p.completed_at && (
                  <Link
                    href={`/nurse/checkin/${p.id}`}
                    aria-label={`${p.full_name} uchun kunlik tekshiruv`}
                    className="m-2 flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-teal-600 px-3 text-xs font-bold text-white hover:bg-teal-700"
                  >
                    Tekshiruv
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
