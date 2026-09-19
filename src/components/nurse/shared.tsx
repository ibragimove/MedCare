"use client";

import { useEffect, useState, type ReactNode } from "react";
import { SEVERITY_LABEL, SEVERITY_STYLE, TASK_STATUS_LABEL, TASK_STATUS_STYLE } from "@/lib/patient-status";
import { formatCountdown, isTaskOverdue } from "@/lib/nurse-ui";
import type { NurseTaskCard, Severity, TaskStatus } from "@/types/nurse";

// "Now" that re-renders on an interval; skewMs corrects for a phone clock that is off.
export function useNow(intervalMs = 15_000, skewMs = 0): Date {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return new Date(tick + skewMs);
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-bold ${SEVERITY_STYLE[severity]}`}>
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

export function StatusPill({ status, late }: { status: TaskStatus; late?: boolean }) {
  const shown: TaskStatus = late && (status === "new" || status === "accepted") ? "overdue" : status;
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${TASK_STATUS_STYLE[shown]}`}>
      {TASK_STATUS_LABEL[shown]}
    </span>
  );
}

// Live SLA countdown: "4 soat 12 daq qoldi" or, in red, "2 soat kechikdi".
export function Countdown({ task, now }: { task: Pick<NurseTaskCard, "status" | "sla_deadline">; now: Date }) {
  if (task.status === "confirmed") return null;
  const { text, late } = formatCountdown(task.sla_deadline, now);
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm font-semibold ${
        late || isTaskOverdue(task, now) ? "text-red-600" : "text-gray-700"
      }`}
    >
      <span aria-hidden="true">{late ? "⏰" : "⏱"}</span>
      {text}
    </span>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700"
        >
          Qayta urinish
        </button>
      )}
    </div>
  );
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Yuklanmoqda">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-36 animate-pulse rounded-3xl bg-gray-100" />
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon: string; title: string; hint?: ReactNode }) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-gray-200 bg-white px-4 py-12 text-center">
      <p className="text-4xl" aria-hidden="true">{icon}</p>
      <p className="mt-2 text-base font-semibold text-gray-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-gray-500">{hint}</p>}
    </div>
  );
}

// Fetch helper: JSON body, Uzbek error message from the API when there is one.
export async function callApi<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new Error("Internetga ulanib boʻlmadi. Aloqani tekshirib, qayta urinib koʻring.");
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const err = new Error(json.error ?? "Xatolik yuz berdi. Qayta urinib koʻring.") as Error & { data?: unknown; status?: number };
    err.data = json;
    err.status = res.status;
    throw err;
  }
  return json;
}
