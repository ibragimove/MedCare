import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushToProfiles } from "@/lib/push";
import { sendTelegramMessage } from "@/lib/telegram";

// Called every minute by Supabase pg_cron (or daily by Vercel cron as fallback).
// Marks overdue tasks, triggers escalations, and notifies managers.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const now = new Date().toISOString();

  // 1. Mark new/accepted tasks as overdue if past SLA deadline
  const { data: overdueTasks } = await supabase
    .from("care_tasks")
    .select("id, nurse_id, patient_id, patients(full_name)")
    .in("status", ["new", "accepted"])
    .lt("sla_deadline", now);

  let markedOverdue = 0;
  for (const task of overdueTasks ?? []) {
    await supabase
      .from("care_tasks")
      .update({ status: "overdue", overdue_at: now })
      .eq("id", task.id);

    await supabase.from("audit_logs").insert({
      actor_id: null,
      action: "task.overdue",
      entity_type: "care_tasks",
      entity_id: task.id,
      meta: { auto: true },
    });

    // Push to assigned nurse
    if (task.nurse_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const name = (task as any).patients?.full_name ?? "Bemor";
      await sendPushToProfiles([task.nurse_id], { title: "⚠️ SLA muddati oʻtdi", body: `Bemor: ${name} — vazifa kechikdi!` });
    }
    markedOverdue++;
  }

  // 2. Escalate tasks overdue for more than 30 minutes
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: escalateTasks } = await supabase
    .from("care_tasks")
    .select("id, nurse_id, patient_id, patients(full_name)")
    .eq("status", "overdue")
    .lt("overdue_at", thirtyMinAgo);

  let escalated = 0;
  for (const task of escalateTasks ?? []) {
    await supabase
      .from("care_tasks")
      .update({ status: "escalated", escalated_at: now })
      .eq("id", task.id);

    await supabase.from("escalations").insert({
      care_task_id: task.id,
      from_nurse_id: task.nurse_id ?? null,
      reason: "SLA muddati 30 daqiqadan oshdi — avtomatik eskalatsia",
    });

    await supabase.from("audit_logs").insert({
      actor_id: null,
      action: "task.escalated",
      entity_type: "care_tasks",
      entity_id: task.id,
      meta: { auto: true },
    });

    // Notify all managers
    const { data: managers } = await supabase
      .from("profiles")
      .select("id, telegram_chat_id")
      .eq("role", "manager");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const name = (task as any).patients?.full_name ?? "Bemor";
    const managerIds = (managers ?? []).map((m) => m.id);
    if (managerIds.length) {
      await sendPushToProfiles(managerIds, { title: "🚨 Eskalatsia", body: `Bemor: ${name} — vazifa eskalatsiyaga tushdi!` });
    }
    for (const mgr of managers ?? []) {
      if (mgr.telegram_chat_id) {
        await sendTelegramMessage(
          mgr.telegram_chat_id,
          `🚨 <b>Eskalatsia: Vazifa kechikdi</b>\nBemor: ${name}\nVazifa ID: ${task.id}`,
        );
      }
    }
    escalated++;
  }

  return NextResponse.json({ ok: true, markedOverdue, escalated });
}

// Also support GET for Vercel cron (daily fallback)
export async function GET(req: NextRequest) {
  return POST(req);
}
