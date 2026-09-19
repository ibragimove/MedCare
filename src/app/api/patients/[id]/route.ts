import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAnyRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { canAccessPatient } from "@/lib/patient-access";
import { loadMedicationRows, refreshMedicationPlan } from "@/lib/patient-meds";
import { isMissingSchema, MIGRATION_HINT } from "@/lib/db-errors";
import { normalizeUzPhone } from "@/lib/phone";
import { MAX_MEDICATIONS, validateMedications, type MedicationInput } from "@/lib/medications";
import type { AiSummary, Alert, CallbackRequest, CareTask, Checkin, Discharge, DoseLog, Visit } from "@/types/db";
import type { PatientDetailData } from "@/types/patient-detail";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// GET /api/patients/[id] — everything the shared patient detail screen shows.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, role, response: authError } = await requireAnyRole(["doctor", "nurse", "manager", "admin"]);
  if (authError) return authError;

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: patient, error } = await supabase.from("patients").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "Bemor maʼlumotlarini yuklab boʻlmadi" }, { status: 500 });
  if (!patient) return NextResponse.json({ error: "Bemor topilmadi" }, { status: 404 });

  if (!(await canAccessPatient(supabase, role!, user!.id, patient))) {
    return NextResponse.json({ error: "Bu bemor sizga biriktirilmagan" }, { status: 403 });
  }

  const since = new Date();
  since.setDate(since.getDate() - 14);

  const [nurseRes, medications, checkinsRes, dosesRes, alertsRes, tasksRes, visitsRes, dischargesRes, callbacksRes] =
    await Promise.all([
      patient.assigned_nurse_id
        ? supabase
            .from("nurses")
            .select("id, full_name, tuman, village, phone")
            .eq("id", patient.assigned_nurse_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      loadMedicationRows(supabase, id, { includeStopped: true }),
      supabase.from("checkins").select("*").eq("patient_id", id).order("date", { ascending: false }).limit(30),
      supabase
        .from("dose_logs")
        .select("*")
        .eq("patient_id", id)
        .gte("scheduled_date", isoDay(since))
        .order("scheduled_date", { ascending: false }),
      supabase.from("alerts").select("*").eq("patient_id", id).order("created_at", { ascending: false }).limit(30),
      supabase.from("care_tasks").select("*").eq("patient_id", id).order("created_at", { ascending: false }).limit(20),
      supabase.from("visits").select("*").eq("patient_id", id).order("visited_at", { ascending: false }).limit(50),
      supabase
        .from("discharges")
        .select("*, ai_summaries(*)")
        .eq("patient_id", id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("callback_requests").select("*").eq("patient_id", id).order("created_at", { ascending: false }).limit(20),
    ]);

  const visits = (visitsRes.data ?? []) as Visit[];
  const tasks = ((tasksRes.data ?? []) as CareTask[]).map((t) => ({
    ...t,
    visits: visits.filter((v) => v.care_task_id === t.id),
  }));

  // A nurse gets the AI brief but not the doctor's raw epicrisis text.
  const canSeeEpicrisis = role !== "nurse";
  const discharges = ((dischargesRes.data ?? []) as (Discharge & { ai_summaries: AiSummary[] | AiSummary | null })[]).map(
    (d) => ({
      ...d,
      epicrisis_raw: canSeeEpicrisis ? d.epicrisis_raw : "",
      ai_summaries: Array.isArray(d.ai_summaries) ? d.ai_summaries : d.ai_summaries ? [d.ai_summaries] : [],
    }),
  );

  const data: PatientDetailData = {
    role: role!,
    patient: {
      id: patient.id,
      full_name: patient.full_name,
      tuman: patient.tuman,
      village: patient.village,
      territory_id: patient.territory_id ?? null,
      phone: patient.phone ?? null,
      address: patient.address ?? null,
      birth_date: patient.birth_date ?? null,
      pinfl_last4: patient.pinfl_last4 ?? null,
      diagnosis: patient.diagnosis,
      drug_name: patient.drug_name,
      dosage: patient.dosage,
      expected_days: patient.expected_days,
      discharge_date: patient.discharge_date,
      completed_at: patient.completed_at,
      expected_trajectory: patient.expected_trajectory,
      medication_plan: patient.medication_plan,
      last_match_percent: patient.last_match_percent,
      last_status: patient.last_status,
      created_at: patient.created_at,
      assigned_nurse_id: patient.assigned_nurse_id,
      has_account: Boolean(patient.profile_id),
    },
    nurse: (nurseRes.data as PatientDetailData["nurse"]) ?? null,
    medications,
    checkins: (checkinsRes.data ?? []) as Checkin[],
    doseLogs: (dosesRes.data ?? []) as DoseLog[],
    alerts: (alertsRes.data ?? []) as Alert[],
    tasks,
    discharges,
    callbacks: (callbacksRes.data ?? []) as CallbackRequest[],
  };

  return NextResponse.json(data);
}

interface PatchBody {
  action: "add_medication" | "stop_medication" | "update_contact";
  medication?: MedicationInput;
  medicationId?: string;
  phone?: string | null;
  address?: string | null;
}

// PATCH /api/patients/[id] — doctor edits: add / stop a drug, update contact details.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response: authError } = await requireAnyRole(["doctor"]);
  if (authError) return authError;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Partial<PatchBody>;
  const supabase = createAdminClient();

  const { data: patient } = await supabase
    .from("patients")
    .select("id, diagnosis, drug_name, dosage, expected_days, completed_at")
    .eq("id", id)
    .maybeSingle();
  if (!patient) return NextResponse.json({ error: "Bemor topilmadi" }, { status: 404 });

  if (body.action === "update_contact") {
    const update: Record<string, unknown> = {};
    if (body.phone !== undefined) {
      const raw = body.phone?.trim() ?? "";
      const phone = raw ? normalizeUzPhone(raw) : null;
      if (raw && !phone) {
        return NextResponse.json({ error: "Telefon raqami toʻliq emas (+998 XX XXX XX XX)" }, { status: 400 });
      }
      update.phone = phone;
    }
    if (body.address !== undefined) update.address = body.address?.trim() || null;
    if (Object.keys(update).length === 0) return NextResponse.json({ error: "Oʻzgarish yoʻq" }, { status: 400 });

    const { error } = await supabase.from("patients").update(update).eq("id", id);
    if (error) {
      if (isMissingSchema(error)) return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
      return NextResponse.json({ error: "Saqlab boʻlmadi" }, { status: 500 });
    }
    await writeAudit(supabase, { actorId: user!.id, action: "patient.contact_updated", entityType: "patients", entityId: id });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "add_medication" || body.action === "stop_medication") {
    if (patient.completed_at) {
      return NextResponse.json({ error: "Davolanish yakunlangan — dorilarni oʻzgartirib boʻlmaydi" }, { status: 409 });
    }
    const active = await loadMedicationRows(supabase, id);
    if (active === null) return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });

    if (body.action === "add_medication") {
      if (active.length >= MAX_MEDICATIONS) {
        return NextResponse.json({ error: `Dorilar soni ${MAX_MEDICATIONS} tadan oshmasligi kerak` }, { status: 400 });
      }
      // Validate together with the existing drugs so duplicates are caught.
      const existing: MedicationInput[] = active.map((m) => ({ drugName: m.drug_name, dosage: m.dosage }));
      const checked = validateMedications([...existing, body.medication ?? {}]);
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
      const med = checked.medications[checked.medications.length - 1];

      const { error } = await supabase.from("patient_medications").insert({
        patient_id: id,
        drug_name: med.drugName,
        dosage: med.dosage,
        frequency: med.timesPerDay ? `kuniga ${med.timesPerDay} marta` : null,
        duration_days: med.durationDays ?? null,
        instructions: med.note ?? null,
        sort_order: active.length,
      });
      if (error) {
        if (isMissingSchema(error)) return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
        return NextResponse.json({ error: "Dorini saqlab boʻlmadi" }, { status: 500 });
      }
    } else {
      const target = active.find((m) => m.id === body.medicationId);
      if (!target) return NextResponse.json({ error: "Dori topilmadi" }, { status: 404 });
      if (active.length <= 1) {
        return NextResponse.json(
          { error: "Kamida bitta faol dori qolishi kerak. Davolanishni tugatish uchun “Yakunlash” tugmasidan foydalaning" },
          { status: 409 },
        );
      }
      const { error } = await supabase
        .from("patient_medications")
        .update({ stopped_at: new Date().toISOString() })
        .eq("id", target.id);
      if (error) return NextResponse.json({ error: "Dorini toʻxtatib boʻlmadi" }, { status: 500 });
    }

    try {
      await refreshMedicationPlan(supabase, patient);
    } catch (err) {
      console.error("refreshMedicationPlan failed:", (err as Error).message);
    }
    await writeAudit(supabase, {
      actorId: user!.id,
      action: body.action === "add_medication" ? "patient.medication_added" : "patient.medication_stopped",
      entityType: "patients",
      entityId: id,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Nomaʼlum amal" }, { status: 400 });
}
