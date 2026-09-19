import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { canAccessPatient } from "@/lib/patient-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendPushToProfiles } from "@/lib/push";
import { writeAudit } from "@/lib/audit";

// POST /api/alerts — nurse reports deteriorating condition ("Holati yomon")
export async function POST(req: NextRequest) {
  const { user, role, response: authErr } = await requireAnyRole(["nurse", "doctor", "manager", "admin"]);
  if (authErr) return authErr;

  const body = (await req.json().catch(() => ({}))) as {
    patient_id: string;
    reason: string;
    severity?: "urgent" | "critical";
    care_task_id?: string;
  };

  const { patient_id, reason, severity = "urgent", care_task_id } = body;
  if (!patient_id || !reason?.trim()) {
    return NextResponse.json({ error: "Bemor va holat tavsifi majburiy" }, { status: 400 });
  }
  if (reason.trim().length > 1000 || (severity !== "urgent" && severity !== "critical")) {
    return NextResponse.json({ error: "Maʼlumot notoʻgʻri" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Load patient info
  const { data: patient } = await supabase
    .from("patients")
    .select("id, full_name, tuman, village, diagnosis, assigned_nurse_id, profile_id")
    .eq("id", patient_id)
    .maybeSingle();

  if (!patient || !(await canAccessPatient(supabase, role!, user!.id, patient))) {
    return NextResponse.json({ error: "Bemor topilmadi" }, { status: 404 });
  }

  const formattedReason = `[${severity === "critical" ? "KRITIK" : "SHOSHILINCH"}] ${reason.trim()}`;

  const { data: alert, error: alertErr } = await supabase
    .from("alerts")
    .insert({
      patient_id,
      reason: formattedReason,
      resolved: false,
    })
    .select()
    .single();

  if (alertErr) {
    return NextResponse.json({ error: alertErr.message }, { status: 500 });
  }

  // Notify hospital doctors
  const { data: doctorProfiles } = await supabase
    .from("profiles")
    .select("id, telegram_chat_id")
    .eq("role", "doctor");

  const doctorIds = (doctorProfiles ?? []).map((d) => d.id);
  const patientName = patient?.full_name ?? "Bemor";
  const location = patient ? `${patient.tuman}, ${patient.village}` : "";

  // 1. Push notification to doctors
  if (doctorIds.length > 0) {
    await sendPushToProfiles(doctorIds, {
      title: "⚠️ Bemor holati ogʻirlashdi!",
      body: `${patientName} (${location}): ${reason.trim()}`,
      url: `/doctor/patients/${patient_id}`,
    });
  }

  // 2. Telegram message to doctors
  const tgText = `⚠️ <b>Shoshilinch ogohlantirish!</b>\n\n<b>Bemor:</b> ${patientName}\n<b>Manzil:</b> ${location}\n<b>Tashxis:</b> ${patient?.diagnosis ?? "—"}\n<b>Holat:</b> ${reason.trim()}\n\n<i>Hamshira tomonidan belgilangan xavf: ${severity === "critical" ? "KRITIK 🚨" : "SHOSHILINCH ⚠️"}</i>`;

  for (const doc of doctorProfiles ?? []) {
    if (doc.telegram_chat_id) {
      await sendTelegramMessage(doc.telegram_chat_id, tgText);
    }
  }

  await writeAudit(supabase, {
    actorId: user!.id,
    action: "alert.reported_by_nurse",
    entityType: "alerts",
    entityId: alert.id,
    meta: { patient_id, care_task_id, severity, reason: reason.trim() },
  });

  return NextResponse.json({ ok: true, alert });
}
