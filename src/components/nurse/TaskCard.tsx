"use client";

import Link from "next/link";
import { ACCEPTABLE, isTaskOverdue, mapsHref, telHref } from "@/lib/nurse-ui";
import { fmtDateTime } from "@/lib/patient-status";
import { Countdown, SeverityBadge, StatusPill } from "@/components/nurse/shared";
import type { NurseTaskCard } from "@/types/nurse";

interface TaskCardProps {
  task: NurseTaskCard;
  now: Date;
  accepting: boolean;
  onAccept: (task: NurseTaskCard) => void;
}

// The whole card opens the task; the buttons sit above the stretched link so they keep working.
export default function TaskCard({ task, now, accepting, onAccept }: TaskCardProps) {
  const patient = task.patients;
  const late = isTaskOverdue(task, now);
  const tel = telHref(patient?.phone);
  const name = patient?.full_name ?? "Bemor";

  const tone =
    task.status === "confirmed"
      ? "border-emerald-200 bg-emerald-50/40"
      : late
        ? "border-red-300 bg-red-50/60"
        : "border-gray-200 bg-white";

  const actionBase =
    "relative z-10 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold transition active:scale-95";

  return (
    <article className={`relative rounded-3xl border p-4 shadow-sm transition hover:shadow-md ${tone}`}>
      <Link
        href={`/nurse/tasks/${task.id}`}
        aria-label={`Vazifani ochish: ${name}`}
        className="absolute inset-0 z-0 rounded-3xl outline-none focus-visible:ring-4 focus-visible:ring-teal-300"
      />

      <div className="pointer-events-none relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-gray-900">{name}</h3>
          <p className="truncate text-sm text-gray-600">
            {patient ? `${patient.village}, ${patient.tuman}` : "—"}
          </p>
        </div>
        <SeverityBadge severity={task.severity} />
      </div>

      <p className="pointer-events-none relative mt-1.5 line-clamp-2 text-sm text-gray-700">
        {patient?.diagnosis ?? "Tashxis koʻrsatilmagan"}
      </p>

      <div className="pointer-events-none relative mt-3 flex flex-wrap items-center justify-between gap-2">
        <StatusPill status={task.status} late={late} />
        {task.status === "confirmed" ? (
          <span className="text-sm font-semibold text-emerald-700">✅ {fmtDateTime(task.confirmed_at)}</span>
        ) : (
          <Countdown task={task} now={now} />
        )}
      </div>

      {task.status !== "confirmed" && (
        <div className="relative mt-3 flex flex-wrap gap-2">
          {ACCEPTABLE.has(task.status) && (
            <button
              type="button"
              onClick={() => onAccept(task)}
              disabled={accepting}
              aria-label={`${name} vazifasini qabul qildim`}
              className={`${actionBase} flex-1 bg-gradient-to-r from-teal-600 to-cyan-500 text-white shadow-sm hover:from-teal-700 hover:to-cyan-600 disabled:opacity-60`}
            >
              {accepting ? "Saqlanmoqda..." : "✔ Qabul qildim"}
            </button>
          )}
          {tel && (
            <a href={tel} aria-label={`${name} ga qoʻngʻiroq qilish`} className={`${actionBase} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}>
              📞 Qoʻngʻiroq
            </a>
          )}
          {patient && (
            <a
              href={mapsHref(patient)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${name} manzilini xaritada ochish`}
              className={`${actionBase} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}
            >
              📍 Xarita
            </a>
          )}
        </div>
      )}
    </article>
  );
}
