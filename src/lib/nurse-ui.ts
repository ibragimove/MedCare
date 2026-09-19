import type { NurseTaskCard } from "@/types/nurse";

// Pure helpers for the nurse screens (no server-only imports, safe in client components).

export function isTaskOverdue(task: Pick<NurseTaskCard, "status" | "sla_deadline">, now: Date): boolean {
  if (task.status === "confirmed") return false;
  if (task.status === "overdue" || task.status === "escalated") return true;
  return new Date(task.sla_deadline).getTime() <= now.getTime();
}

// Only these states can be worked on by the nurse (visit, OTP, confirm).
export const WORKABLE = new Set(["accepted", "overdue", "escalated", "reassigned"]);
// States where the "Qabul qildim" button applies.
export const ACCEPTABLE = new Set(["new", "reassigned", "reopened"]);

// overdue → new → accepted → confirmed today
function rank(task: NurseTaskCard, now: Date): number {
  if (isTaskOverdue(task, now)) return 0;
  switch (task.status) {
    case "new":
    case "reassigned":
    case "reopened":
      return 1;
    case "accepted":
      return 2;
    default:
      return 3;
  }
}

export function sortTasks(tasks: NurseTaskCard[], now: Date): NurseTaskCard[] {
  return [...tasks].sort((a, b) => {
    const r = rank(a, now) - rank(b, now);
    if (r !== 0) return r;
    return new Date(a.sla_deadline).getTime() - new Date(b.sla_deadline).getTime();
  });
}

export function summarize(tasks: NurseTaskCard[], now: Date) {
  let fresh = 0;
  let inProgress = 0;
  let overdue = 0;
  for (const t of tasks) {
    if (t.status === "confirmed") continue;
    if (isTaskOverdue(t, now)) overdue++;
    else if (t.status === "accepted") inProgress++;
    else fresh++;
  }
  return { fresh, inProgress, overdue };
}

function span(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} kun ${hours % 24} soat`;
  }
  if (hours > 0) return minutes > 0 ? `${hours} soat ${minutes} daq` : `${hours} soat`;
  if (minutes > 0) return `${minutes} daq`;
  return "1 daqiqadan kam";
}

// "4 soat 12 daq qoldi" / "2 soat kechikdi"
export function formatCountdown(deadlineIso: string, now: Date): { text: string; late: boolean } {
  const diff = new Date(deadlineIso).getTime() - now.getTime();
  if (diff <= 0) return { text: `${span(-diff)} kechikdi`, late: true };
  return { text: `${span(diff)} qoldi`, late: false };
}

export function mapsHref(p: { tuman: string; village: string; address?: string | null }): string {
  const query = [p.address, p.village, p.tuman].filter(Boolean).join(", ");
  return `https://maps.google.com/?q=${encodeURIComponent(query)}`;
}

export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.length >= 7 ? `tel:${digits}` : null;
}
