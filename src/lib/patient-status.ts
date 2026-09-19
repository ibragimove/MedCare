import type { MatchStatus, Severity, TaskStatus } from "@/types/db";

export interface StatusBadge {
  label: string;
  pct: number | null;
  level: "pending" | "good" | "watch" | "risk";
  dot: string;
  card: string;
  badge: string;
  bar: string;
}

// Traffic-light status from the latest check-in match percentage.
export function statusBadge(p: { last_status: MatchStatus | null; last_match_percent: number | null }): StatusBadge {
  if (p.last_status === null || p.last_match_percent === null) {
    return {
      label: "Kutilmoqda",
      pct: null,
      level: "pending",
      dot: "bg-slate-400",
      card: "border-gray-200",
      badge: "bg-slate-100 text-slate-600",
      bar: "bg-slate-300",
    };
  }
  const pct = p.last_match_percent;
  if (pct >= 90) {
    return {
      label: "Yaxshi",
      pct,
      level: "good",
      dot: "bg-emerald-500",
      card: "border-emerald-200 bg-emerald-50/30",
      badge: "bg-emerald-100 text-emerald-700",
      bar: "bg-emerald-500",
    };
  }
  if (pct >= 70) {
    return {
      label: "Kuzatuvda",
      pct,
      level: "watch",
      dot: "bg-amber-500",
      card: "border-amber-200 bg-amber-50/30",
      badge: "bg-amber-100 text-amber-700",
      bar: "bg-amber-500",
    };
  }
  return {
    label: "Xavfli",
    pct,
    level: "risk",
    dot: "bg-red-500 animate-pulse",
    card: "border-red-200 bg-red-50/30",
    badge: "bg-red-100 text-red-700",
    bar: "bg-red-500",
  };
}

// Sort weight: highest attention first (risk → watch → pending → good).
export const LEVEL_RANK: Record<StatusBadge["level"], number> = { risk: 0, watch: 1, pending: 2, good: 3 };

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  new: "Yangi",
  accepted: "Qabul qilindi",
  confirmed: "Tasdiqlandi",
  overdue: "Kechikkan",
  escalated: "Yuqoriga oshirilgan",
  reassigned: "Qayta biriktirilgan",
  reopened: "Qayta ochilgan",
};

export const TASK_STATUS_STYLE: Record<TaskStatus, string> = {
  new: "bg-blue-100 text-blue-700",
  accepted: "bg-teal-100 text-teal-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  overdue: "bg-red-100 text-red-700",
  escalated: "bg-purple-100 text-purple-700",
  reassigned: "bg-amber-100 text-amber-700",
  reopened: "bg-orange-100 text-orange-700",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  routine: "Oddiy",
  urgent: "Shoshilinch",
  critical: "Kritik",
};

export const SEVERITY_STYLE: Record<Severity, string> = {
  routine: "bg-slate-100 text-slate-700",
  urgent: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const pad = (n: number) => String(n).padStart(2, "0");

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${fmtDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Hozirgina";
  if (mins < 60) return `${mins} daq. oldin`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} soat oldin`;
  return `${Math.floor(hours / 24)} kun oldin`;
}

// Treatment day counter: day 1 is the discharge day.
export function treatmentDay(dischargeDate: string, expectedDays: number) {
  const start = new Date(dischargeDate);
  const today = new Date();
  const msPerDay = 86_400_000;
  const startMid = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const day = Math.max(1, Math.floor((todayMid - startMid) / msPerDay) + 1);
  return { day, total: expectedDays, pct: Math.min(100, Math.round((day / Math.max(1, expectedDays)) * 100)) };
}
