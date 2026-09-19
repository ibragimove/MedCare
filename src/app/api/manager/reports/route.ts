import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAnyRole } from "@/lib/auth";
import type { ReportRow } from "@/types/reports";

interface Bucket {
  key: string;
  label: string;
  tasks: number;
  onTime: number;
  late: number;
  overdue: number;
  escalated: number;
  acceptMinutes: number[];
}

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
};

const toRow = (b: Bucket): ReportRow => ({
  key: b.key,
  label: b.label,
  tasks: b.tasks,
  slaPercent: b.onTime + b.late > 0 ? Math.round((b.onTime / (b.onTime + b.late)) * 100) : null,
  medianAcceptMinutes: median(b.acceptMinutes),
  overdue: b.overdue,
  escalated: b.escalated,
});

// GET /api/manager/reports?days=7|30 — SLA compliance and response times for the period.
// A task counts as on time when it was confirmed before its deadline, and as late when it was
// confirmed after it or is still open past it. Tasks still inside their window are not counted yet.
export async function GET(request: Request) {
  const { response: authError } = await requireAnyRole(["manager", "admin"]);
  if (authError) return authError;

  const daysParam = Number(new URL(request.url).searchParams.get("days"));
  const days = daysParam === 7 ? 7 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("care_tasks")
    .select("id, nurse_id, status, sla_deadline, created_at, accepted_at, confirmed_at, patients(tuman)")
    .gte("created_at", since)
    .limit(5000);
  if (error) return NextResponse.json({ error: "Hisobotni yuklab boʻlmadi" }, { status: 500 });

  const nurseIds = [...new Set((data ?? []).map((t) => t.nurse_id).filter((v): v is string => Boolean(v)))];
  const nurseNames = new Map<string, string>();
  if (nurseIds.length > 0) {
    const { data: nurses } = await supabase.from("nurses").select("id, full_name").in("id", nurseIds);
    for (const n of nurses ?? []) nurseNames.set(n.id, n.full_name);
  }

  const now = Date.now();
  const overall: Bucket = { key: "all", label: "Jami", tasks: 0, onTime: 0, late: 0, overdue: 0, escalated: 0, acceptMinutes: [] };
  const byNurse = new Map<string, Bucket>();
  const byTuman = new Map<string, Bucket>();

  const bucket = (map: Map<string, Bucket>, key: string, label: string) => {
    let b = map.get(key);
    if (!b) {
      b = { key, label, tasks: 0, onTime: 0, late: 0, overdue: 0, escalated: 0, acceptMinutes: [] };
      map.set(key, b);
    }
    return b;
  };

  for (const t of data ?? []) {
    const patient = (Array.isArray(t.patients) ? t.patients[0] : t.patients) as { tuman: string } | null;
    const targets = [
      overall,
      bucket(byNurse, t.nurse_id ?? "none", t.nurse_id ? (nurseNames.get(t.nurse_id) ?? "Nomaʼlum hamshira") : "Biriktirilmagan"),
      bucket(byTuman, patient?.tuman ?? "—", patient?.tuman ?? "—"),
    ];
    const deadline = new Date(t.sla_deadline).getTime();
    const confirmedAt = t.confirmed_at ? new Date(t.confirmed_at).getTime() : null;
    const acceptedAt = t.accepted_at ? new Date(t.accepted_at).getTime() : null;

    for (const b of targets) {
      b.tasks += 1;
      if (t.status === "overdue") b.overdue += 1;
      if (t.status === "escalated") b.escalated += 1;
      if (confirmedAt !== null) {
        if (confirmedAt <= deadline) b.onTime += 1;
        else b.late += 1;
      } else if (deadline < now) {
        b.late += 1;
      }
      if (acceptedAt !== null) b.acceptMinutes.push((acceptedAt - new Date(t.created_at).getTime()) / 60000);
    }
  }

  const sortRows = (rows: ReportRow[]) => rows.sort((a, b) => b.tasks - a.tasks || a.label.localeCompare(b.label, "uz"));

  return NextResponse.json({
    days,
    overall: toRow(overall),
    byNurse: sortRows([...byNurse.values()].map(toRow)),
    byTuman: sortRows([...byTuman.values()].map(toRow)),
  });
}
