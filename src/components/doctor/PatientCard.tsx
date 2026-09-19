"use client";

import Link from "next/link";
import { statusBadge } from "@/lib/patient-status";
import type { Patient } from "@/types/db";

interface Props {
  patient: Patient;
  href: string;
  onRemind?: (patientId: string) => void;
  reminding?: boolean;
}

// The whole card is one big link (stretched ::after); the reminder button sits above it.
export default function PatientCard({ patient, href, onRemind, reminding }: Props) {
  const s = statusBadge(patient);
  const done = Boolean(patient.completed_at);

  return (
    <div
      className={`relative rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md focus-within:ring-2 focus-within:ring-teal-300 sm:p-5 ${s.card} ${
        done ? "opacity-80" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <div className="relative mt-0.5 shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 text-base font-bold text-white shadow-sm">
              {patient.full_name.charAt(0)}
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${s.dot}`} />
          </div>
          <div className="min-w-0">
            <Link href={href} className="block truncate font-semibold text-gray-800 after:absolute after:inset-0 after:content-[''] focus:outline-none">
              {patient.full_name}
            </Link>
            <p className="truncate text-xs text-gray-500">
              {patient.tuman}, {patient.village} · {patient.diagnosis}
            </p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${done ? "bg-slate-100 text-slate-600" : s.badge}`}>
          {done ? "Yakunlangan" : s.label}
          {!done && s.pct !== null ? ` · ${s.pct}%` : ""}
        </span>
      </div>

      {s.pct !== null && !done && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${s.pct}%` }} />
        </div>
      )}

      <p className="mt-2 text-xs text-gray-500">
        {patient.nurses ? (
          <>👩‍⚕️ {patient.nurses.full_name}</>
        ) : (
          <span className="font-medium text-amber-600">⚠️ Hamshira biriktirilmagan</span>
        )}
      </p>

      {patient.expected_trajectory && <p className="mt-2 line-clamp-2 text-xs text-gray-600">{patient.expected_trajectory}</p>}

      <div className="mt-3 flex items-center justify-between gap-2">
        {onRemind && !done ? (
          <button
            type="button"
            onClick={() => onRemind(patient.id)}
            disabled={reminding}
            className="relative z-10 min-h-9 rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60"
          >
            {reminding ? "Yuborilmoqda..." : "📨 Eslatma"}
          </button>
        ) : (
          <span />
        )}
        <span className="text-xs font-semibold text-teal-700">Batafsil →</span>
      </div>
    </div>
  );
}
