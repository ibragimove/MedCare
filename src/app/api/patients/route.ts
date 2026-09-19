import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateTrajectory, generateMedicationPlan } from "@/lib/gemini";
import { requireAnyRole, requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { listNurses } from "@/lib/nurses";
import { pickNurseFor } from "@/lib/nurse-routing";
import { isMissingSchema, MIGRATION_HINT } from "@/lib/db-errors";
import { normalizeUzPhone } from "@/lib/phone";
import {
  fallbackPlan,
  joinedDosages,
  joinedDrugNames,
  validateMedications,
  type MedicationInput,
} from "@/lib/medications";
import type { MedicationPlan } from "@/types/db";

// GET /api/patients — list patients (nurse gets only her assigned/territory patients; doctor/manager gets all)
export async function GET(request: Request) {
  const { user, role, response: authError } = await requireAnyRole(["doctor", "nurse", "manager", "admin"]);
  if (authError) return authError;

  const supabase = createAdminClient();
  const params = new URL(request.url).searchParams;
  const status = params.get("status");

  let query = supabase
    .from("patients")
    .select("*, nurses(id, full_name, tuman, village, phone)")
    .order("created_at", { ascending: false });

  if (status === "active") {
    query = query.is("completed_at", null);
  } else if (status === "completed") {
    query = query.not("completed_at", "is", null);
  }

  if (role === "nurse") {
    const { data: terrLinks } = await supabase
      .from("nurse_territories")
      .select("territory_id")
      .eq("nurse_id", user!.id);
    const terrIds = (terrLinks ?? []).map((t) => t.territory_id);

    if (terrIds.length > 0) {
      query = query.or(`assigned_nurse_id.eq.${user!.id},territory_id.in.(${terrIds.join(",")})`);
    } else {
      query = query.eq("assigned_nurse_id", user!.id);
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ patients: data ?? [] });
}

export async function POST(request: Request) {
  const { user, response: authError } = await requireRole("doctor");
  if (authError) return authError;

  const body = (await request.json().catch(() => ({}))) as {
    fullName?: string;
    territoryId?: string;
    diagnosis?: string;
    medications?: MedicationInput[];
    // legacy single-drug payload
    drugName?: string;
    dosage?: string;
    expectedDays?: number | string;
    nurseId?: string;
    phone?: string;
    address?: string;
  };

  const fullName = body.fullName?.trim() ?? "";
  const diagnosis = body.diagnosis?.trim() ?? "";
  const expectedDays = Number(body.expectedDays);
  const rawMeds =
    body.medications ?? (body.drugName ? [{ drugName: body.drugName, dosage: body.dosage ?? "" }] : []);

  if (!fullName || !diagnosis || !body.territoryId) {
    return NextResponse.json({ error: "Bemor ismi, tashxis, tuman va mahallani toʻldiring" }, { status: 400 });
  }
  if (!Number.isInteger(expectedDays) || expectedDays < 1) {
    return NextResponse.json({ error: "Davolanish muddatini kunlarda kiriting" }, { status: 400 });
  }
  const meds = validateMedications(rawMeds);
  if (!meds.ok) return NextResponse.json({ error: meds.error }, { status: 400 });
  const medications = meds.medications;

  const phoneRaw = body.phone?.trim() ?? "";
  const phone = phoneRaw ? normalizeUzPhone(phoneRaw) : null;
  if (phoneRaw && !phone) {
    return NextResponse.json({ error: "Telefon raqami toʻliq emas (+998 XX XXX XX XX)" }, { status: 400 });
  }
  const address = body.address?.trim() || null;

  const supabase = createAdminClient();

  const { data: territory } = await supabase
    .from("territories")
    .select("id, tuman, village")
    .eq("id", body.territoryId)
    .maybeSingle();
  if (!territory) {
    return NextResponse.json({ error: "Tanlangan mahalla topilmadi" }, { status: 400 });
  }

  let trajectory: string;
  let questions: string[];
  try {
    const result = await generateTrajectory({ diagnosis, medications, expectedDays });
    trajectory = result.trajectory;
    questions = result.questions;
  } catch (err) {
    return NextResponse.json(
      { error: `AI trayektoriya yaratishda xatolik: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  // Medication plan is supplementary (used by the patient portal): if the AI fails we still
  // save a deterministic plan built from the doctor's own values.
  let medicationPlan: MedicationPlan;
  try {
    medicationPlan = await generateMedicationPlan({ diagnosis, medications, expectedDays });
  } catch (err) {
    console.error("generateMedicationPlan failed:", err);
    medicationPlan = fallbackPlan(medications, expectedDays);
  }

  // Nurse: the doctor's explicit choice, otherwise the active nurse serving this mahalla
  // (fewest active patients), otherwise any active nurse of the same tuman.
  let assignedNurseId: string | null = null;
  if (body.nurseId) {
    const { data: chosen } = await supabase.from("nurses").select("id").eq("id", body.nurseId).maybeSingle();
    if (!chosen) return NextResponse.json({ error: "Tanlangan hamshira topilmadi" }, { status: 400 });
    assignedNurseId = chosen.id;
  } else {
    try {
      const { nurses } = await listNurses(supabase);
      assignedNurseId =
        pickNurseFor(nurses, { territoryId: territory.id, tuman: territory.tuman, village: territory.village })
          .nurse?.id ?? null;
    } catch (err) {
      console.error("nurse auto-assign failed:", (err as Error).message);
    }
  }

  const insertRow: Record<string, unknown> = {
    full_name: fullName,
    tuman: territory.tuman,
    village: territory.village,
    territory_id: territory.id,
    diagnosis,
    drug_name: joinedDrugNames(medications),
    dosage: joinedDosages(medications),
    expected_days: expectedDays,
    assigned_nurse_id: assignedNurseId,
    expected_trajectory: trajectory,
    checkin_questions: questions,
    medication_plan: medicationPlan,
  };
  if (phone) insertRow.phone = phone;
  if (address) insertRow.address = address;

  const { data: patient, error } = await supabase
    .from("patients")
    .insert(insertRow)
    .select("*, nurses(full_name, tuman, village)")
    .single();

  if (error) {
    if (isMissingSchema(error)) return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
    return NextResponse.json({ error: "Bemorni saqlab boʻlmadi. Qayta urinib koʻring" }, { status: 500 });
  }

  // Per-drug rows (needs migration_008); the plan above already carries every drug, so a
  // missing table only costs the structured list in the patient detail.
  const { error: medError } = await supabase.from("patient_medications").insert(
    medications.map((m, i) => ({
      patient_id: patient.id,
      drug_name: m.drugName,
      dosage: m.dosage,
      frequency: m.timesPerDay ? `kuniga ${m.timesPerDay} marta` : null,
      duration_days: m.durationDays ?? null,
      instructions: m.note ?? null,
      sort_order: i,
    })),
  );
  if (medError && !isMissingSchema(medError)) {
    console.error("patient_medications insert failed:", medError.message);
  }

  await writeAudit(supabase, {
    actorId: user!.id,
    action: "patient.created",
    entityType: "patients",
    entityId: patient.id,
    meta: { medications: medications.length, nurseAssigned: Boolean(assignedNurseId) },
  });

  return NextResponse.json({
    patient,
    warning: assignedNurseId ? undefined : "Bu hudud uchun hamshira biriktirilmagan",
  });
}
