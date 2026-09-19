import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { computeSlaDeadline } from "@/lib/task-state-machine";
import { sendTelegramWithButton } from "@/lib/telegram";
import { sendPushToProfiles } from "@/lib/push";
import type { Severity } from "@/types/db";

// POST /api/discharges — hospital doctor submits epicrisis
// AI pipeline runs after() response is sent
export async function POST(req: NextRequest) {
  const { user, response: authErr } = await requireRole("doctor");
  if (authErr) return authErr;

  const body = (await req.json()) as {
    patient_id: string;
    epicrisis_raw: string;
    severity?: Severity;
    icd10_code?: string;
    facility_id?: string;
  };

  if (!body.patient_id || !body.epicrisis_raw?.trim()) {
    return NextResponse.json({ error: "patient_id va epicrisis_raw majburiy" }, { status: 400 });
  }

  const supabase = await createClient();
  const severity: Severity = body.severity ?? "routine";
  const scaleStr = await supabase.from("settings").select("value").eq("key", "sla_time_scale").single();
  const scale = parseFloat(scaleStr.data?.value ?? "1");
  const deadline = computeSlaDeadline(severity, scale);

  // 1. Create discharge record
  const { data: discharge, error: discErr } = await supabase
    .from("discharges")
    .insert({
      patient_id: body.patient_id,
      facility_id: body.facility_id ?? null,
      doctor_id: user!.id,
      epicrisis_raw: body.epicrisis_raw,
      severity,
      icd10_code: body.icd10_code ?? null,
    })
    .select()
    .single();

  if (discErr || !discharge) {
    return NextResponse.json({ error: discErr?.message ?? "Yaratib boʻlmadi" }, { status: 500 });
  }

  // 2. Get patient + assigned nurse
  const { data: patient } = await supabase
    .from("patients")
    .select("id, full_name, assigned_nurse_id, diagnosis, nurses(id)")
    .eq("id", body.patient_id)
    .single();

  const nurseId = patient?.assigned_nurse_id ?? null;

  // 3. Create care task
  const { data: task, error: taskErr } = await supabase
    .from("care_tasks")
    .insert({
      patient_id: body.patient_id,
      discharge_id: discharge.id,
      nurse_id: nurseId,
      status: "new",
      severity,
      sla_deadline: deadline.toISOString(),
    })
    .select()
    .single();

  if (taskErr || !task) {
    return NextResponse.json({ error: taskErr?.message ?? "Vazifa yaratilmadi" }, { status: 500 });
  }

  // 4. Audit log
  await supabase.from("audit_logs").insert({
    actor_id: user!.id,
    action: "discharge.created",
    entity_type: "discharges",
    entity_id: discharge.id,
    meta: { task_id: task.id, severity, patient_id: body.patient_id },
  });

  // 5. Notify nurse via push + Telegram (after response is sent)
  after(async () => {
    if (!nurseId) return;
    const { data: nurseProfile } = await supabase
      .from("profiles")
      .select("id, full_name, telegram_chat_id")
      .eq("id", nurseId)
      .maybeSingle();

    const msg =
      `🏥 <b>Yangi tashrif vazifasi</b>\n` +
      `Bemor: ${patient?.full_name ?? "—"}\n` +
      `Tashxis: ${patient?.diagnosis ?? "—"}\n` +
      `SLA muddati: ${deadline.toLocaleString("uz-UZ")}\n` +
      `Muhimlik: ${severity}`;

    // Push notification
    if (nurseProfile) {
      await sendPushToProfiles([nurseProfile.id], { title: "Yangi tashrif vazifasi", body: `Bemor: ${patient?.full_name ?? "—"}` });
    }

    // Telegram inline button
    if (nurseProfile?.telegram_chat_id) {
      const sent = await sendTelegramWithButton(
        nurseProfile.telegram_chat_id,
        msg,
        "✅ Qabul qildim",
        `accept:${task.id}`,
      );
      if (sent?.message_id) {
        // Save telegram message_id so we can edit it after acceptance
        await supabase.from("care_tasks").update({ visit_notes: `tg_msg:${sent.message_id}` }).eq("id", task.id);
      }
    }

    // Run AI pipeline
    try {
      const { deidentify, extractEpicrisStructured, generateBrief } = await import("@/lib/gemini");
      const deid = await deidentify(body.epicrisis_raw);
      const structured = await extractEpicrisStructured(deid.deidentified);
      const brief = await generateBrief({
        diagnosis: structured.diagnosis,
        mainConcerns: structured.main_concerns,
        homeCare: structured.home_care_tasks,
        riskScore: structured.risk_score,
      });

      await supabase.from("ai_summaries").insert({
        discharge_id: discharge.id,
        deidentified_text: deid.deidentified,
        diagnosis: structured.diagnosis,
        main_concerns: structured.main_concerns,
        home_care_tasks: structured.home_care_tasks,
        risk_score: structured.risk_score,
        brief_uz: brief.brief_uz,
        checklist_uz: brief.checklist_uz,
      });
    } catch (e) {
      console.error("AI pipeline error:", e);
    }
  });

  return NextResponse.json({ discharge, task }, { status: 201 });
}

// GET /api/discharges?patient_id=xxx — list discharges with AI summaries
export async function GET(req: NextRequest) {
  const { response: authErr } = await requireRole("doctor");
  if (authErr) return authErr;

  const supabase = await createClient();
  const patientId = req.nextUrl.searchParams.get("patient_id");

  let query = supabase
    .from("discharges")
    .select("*, ai_summaries(*)")
    .order("created_at", { ascending: false })
    .limit(20);

  if (patientId) query = query.eq("patient_id", patientId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
