import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

// GET /api/manager/stats — dashboard KPIs for manager
export async function GET(): Promise<Response> {
  const { user, response: authErr } = await requireUser();
  if (authErr) return authErr;

  const role = user!.user_metadata?.role as string;
  if (role !== "manager" && role !== "admin") {
    return NextResponse.json({ error: "Ruxsat yoʻq" }, { status: 403 });
  }

  const supabase = await createClient();

  // Count tasks by status
  const { data: taskCounts } = await supabase
    .from("care_tasks")
    .select("status");

  const counts: Record<string, number> = {};
  for (const t of taskCounts ?? []) {
    counts[t.status] = (counts[t.status] ?? 0) + 1;
  }

  const total = taskCounts?.length ?? 0;
  const confirmed = counts["confirmed"] ?? 0;
  const overdue = counts["overdue"] ?? 0;
  const escalated = counts["escalated"] ?? 0;
  const slaPercent = total > 0 ? Math.round((confirmed / total) * 100) : 0;

  // Median completion time (confirmed tasks)
  const { data: completedTasks } = await supabase
    .from("care_tasks")
    .select("created_at, confirmed_at")
    .eq("status", "confirmed")
    .not("confirmed_at", "is", null)
    .limit(200);

  let medianMinutes = 0;
  if (completedTasks && completedTasks.length > 0) {
    const durations = completedTasks
      .map((t) => {
        const start = new Date(t.created_at).getTime();
        const end = new Date(t.confirmed_at!).getTime();
        return (end - start) / 60000;
      })
      .sort((a, b) => a - b);
    const mid = Math.floor(durations.length / 2);
    medianMinutes = durations.length % 2
      ? durations[mid]
      : (durations[mid - 1] + durations[mid]) / 2;
  }

  // Recent escalations
  const { data: recentEscalations } = await supabase
    .from("escalations")
    .select("*, care_tasks(patient_id, patients(full_name))")
    .order("created_at", { ascending: false })
    .limit(10);

  // Active tasks breakdown
  const { data: activeTasks } = await supabase
    .from("care_tasks")
    .select("*, patients(full_name, tuman)")
    .in("status", ["new", "accepted", "overdue", "escalated"])
    .order("sla_deadline", { ascending: true })
    .limit(20);

  return NextResponse.json({
    slaPercent,
    total,
    confirmed,
    overdue,
    escalated,
    active: counts["new"] ?? 0 + (counts["accepted"] ?? 0),
    medianMinutes: Math.round(medianMinutes),
    recentEscalations: recentEscalations ?? [],
    activeTasks: activeTasks ?? [],
    byStatus: counts,
  });
}
