import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSlaConfig, slaDeadline } from "@/lib/sla";
import { sendPushToProfiles } from "@/lib/push";
import { sendTelegramWithButton } from "@/lib/telegram";
import { writeAudit } from "@/lib/audit";
import type { Severity } from "@/types/db";

// Only tasks that are still open can be moved to another nurse.
const REASSIGNABLE = ["new", "accepted", "overdue", "escalated", "reassigned", "reopened"];

// POST /api/manager/tasks/:id/reassign  { nurseId }
// The task goes to the chosen nurse with a fresh SLA window (settings + sla_time_scale),
// any open escalation is closed, and the new nurse is notified.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response: authErr } = await requireAnyRole(["manager", "admin"]);
  if (authErr) return authErr;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { nurseId?: unknown };
  if (typeof body.nurseId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.nurseId)) {
    return NextResponse.json({ error: "Hamshirani tanlang" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: task } = await supabase
    .from("care_tasks")
    .select("id, patient_id, nurse_id, status, severity")
    .eq("id", id)
    .maybeSingle();
  if (!task) return NextResponse.json({ error: "Vazifa topilmadi" }, { status: 404 });
  if (!REASSIGNABLE.includes(task.status)) {
    return NextResponse.json({ error: "Tasdiqlangan vazifani qayta tayinlab boʻlmaydi" }, { status: 409 });
  }
  if (task.nurse_id === body.nurseId && task.status !== "escalated" && task.status !== "overdue") {
    return NextResponse.json({ error: "Vazifa allaqachon shu hamshirada" }, { status: 409 });
  }

  const { data: nurse } = await supabase.from("nurses").select("*").eq("id", body.nurseId).maybeSingle();
  if (!nurse || nurse.is_active === false) {
    return NextResponse.json({ error: "Hamshira topilmadi yoki nofaol" }, { status: 404 });
  }

  const now = new Date();
  const deadline = slaDeadline(task.severity as Severity, await loadSlaConfig(supabase), now);
  const { error } = await supabase
    .from("care_tasks")
    .update({
      nurse_id: nurse.id,
      status: "reassigned",
      sla_deadline: deadline.toISOString(),
      accepted_at: null,
      overdue_at: null,
      escalated_at: null,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "Qayta tayinlab boʻlmadi. Qayta urinib koʻring." }, { status: 500 });

  await supabase
    .from("escalations")
    .update({ resolved_at: now.toISOString(), to_manager_id: user!.id })
    .eq("care_task_id", id)
    .is("resolved_at", null);

  await writeAudit(supabase, {
    actorId: user!.id,
    action: "task.reassigned",
    entityType: "care_tasks",
    entityId: id,
    meta: { from: task.status, from_nurse_id: task.nurse_id, to_nurse_id: nurse.id },
  });

  // Tell the new nurse (best effort — the task is already saved).
  const { data: patient } = await supabase
    .from("patients")
    .select("full_name, village, tuman")
    .eq("id", task.patient_id)
    .maybeSingle();
  const name = patient?.full_name ?? "Bemor";
  try {
    await sendPushToProfiles([nurse.id], {
      title: "📋 Sizga yangi vazifa biriktirildi",
      body: `${name}${patient ? ` (${patient.village}, ${patient.tuman})` : ""}`,
      url: `/nurse/tasks/${id}`,
    });
    const { data: profile } = await supabase.from("profiles").select("telegram_chat_id").eq("id", nurse.id).maybeSingle();
    if (profile?.telegram_chat_id) {
      await sendTelegramWithButton(
        profile.telegram_chat_id,
        `📋 <b>Sizga vazifa qayta tayinlandi</b>\nBemor: ${name}\nMuddat: ${deadline.toLocaleString("uz-UZ")}`,
        "✔ Qabul qildim",
        `accept:${id}`,
      );
    }
  } catch (err) {
    console.error("reassign notification failed:", (err as Error).message);
  }

  return NextResponse.json({ ok: true, nurse: { id: nurse.id, full_name: nurse.full_name }, sla_deadline: deadline.toISOString() });
}
