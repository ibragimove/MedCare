import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { TaskStatus } from "@/types/db";

// Valid status transitions
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  new:        ["accepted", "overdue"],
  accepted:   ["confirmed", "overdue"],
  overdue:    ["escalated"],
  escalated:  ["confirmed", "reassigned"],
  reassigned: ["confirmed"],
  confirmed:  ["reopened"],
  reopened:   ["accepted", "overdue"],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

interface TransitionResult {
  ok: boolean;
  error?: string;
}

export async function transitionTask(
  taskId: string,
  to: TaskStatus,
  actorId: string | null,
  meta?: Record<string, unknown>,
): Promise<TransitionResult> {
  const supabase = await createClient();

  const { data: task, error: fetchError } = await supabase
    .from("care_tasks")
    .select("id, status, nurse_id")
    .eq("id", taskId)
    .single();

  if (fetchError || !task) {
    return { ok: false, error: "Vazifa topilmadi" };
  }

  const from = task.status as TaskStatus;
  if (!canTransition(from, to)) {
    return { ok: false, error: `${from} → ${to} oʻtish mumkin emas` };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: to };

  if (to === "accepted") patch.accepted_at = now;
  if (to === "confirmed") patch.confirmed_at = now;
  if (to === "overdue") patch.overdue_at = now;
  if (to === "escalated") patch.escalated_at = now;

  const { error: updateError } = await supabase
    .from("care_tasks")
    .update(patch)
    .eq("id", taskId);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  // Write audit log
  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action: `task.${to}`,
    entity_type: "care_tasks",
    entity_id: taskId,
    meta: { from, to, ...meta },
  });

  return { ok: true };
}

// Calculate SLA deadline from severity and optional time-scale multiplier
export function computeSlaDeadline(severity: "routine" | "urgent" | "critical", timeScaleMinPerHour = 60): Date {
  const hoursMap = { routine: 24, urgent: 8, critical: 4 };
  const realMinutes = hoursMap[severity] * 60;
  // timeScaleMinPerHour=1 → demo mode: 1 real minute = 1 simulated hour
  const actualMinutes = realMinutes / (60 / timeScaleMinPerHour);
  return new Date(Date.now() + actualMinutes * 60 * 1000);
}
