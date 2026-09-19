import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateTrajectory, generateMedicationPlan } from "@/lib/gemini";
import { requireRole } from "@/lib/auth";

export async function POST(request: Request) {
  const { response: authError } = await requireRole("doctor");
  if (authError) return authError;

  const body = await request.json();
  const { fullName, tuman, village, diagnosis, drugName, dosage, expectedDays, nurseId } = body as {
    fullName: string;
    tuman: string;
    village: string;
    diagnosis: string;
    drugName: string;
    dosage: string;
    expectedDays: number;
    nurseId?: string;
  };

  if (!fullName || !tuman || !village || !diagnosis || !drugName || !dosage || !expectedDays) {
    return NextResponse.json(
      { error: "Barcha maydonlarni toʻldiring" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  let trajectory: string;
  let questions: string[];
  try {
    const result = await generateTrajectory({
      diagnosis,
      drugName,
      dosage,
      expectedDays: Number(expectedDays),
    });
    trajectory = result.trajectory;
    questions = result.questions;
  } catch (err) {
    return NextResponse.json(
      { error: `AI trayektoriya yaratishda xatolik: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  // Medication plan is supplementary (used by the patient portal) — don't
  // fail the whole discharge if it errors, just leave it null for now.
  let medicationPlan = null;
  try {
    medicationPlan = await generateMedicationPlan({
      diagnosis,
      drugName,
      dosage,
      expectedDays: Number(expectedDays),
    });
  } catch (err) {
    console.error("generateMedicationPlan failed:", err);
  }

  // Nurse assignment: use the doctor's explicit choice if given, otherwise
  // auto-route to the nearest nurse covering this patient's own tuman
  // (district) — case-insensitive, since tuman/village are free-typed.
  // Prefer an exact tuman + mahalla/qishloq match (truly nearest); fall back
  // to any nurse covering the same tuman.
  let assignedNurseId: string | null = nurseId ?? null;
  if (!assignedNurseId) {
    const { data: exactNurse } = await supabase
      .from("nurses")
      .select("id")
      .ilike("tuman", tuman.trim())
      .ilike("village", village.trim())
      .limit(1)
      .maybeSingle();

    if (exactNurse) {
      assignedNurseId = exactNurse.id;
    } else {
      const { data: districtNurse } = await supabase
        .from("nurses")
        .select("id")
        .ilike("tuman", tuman.trim())
        .limit(1)
        .maybeSingle();
      assignedNurseId = districtNurse?.id ?? null;
    }
  }

  const { data: patient, error } = await supabase
    .from("patients")
    .insert({
      full_name: fullName,
      tuman,
      village,
      diagnosis,
      drug_name: drugName,
      dosage,
      expected_days: Number(expectedDays),
      assigned_nurse_id: assignedNurseId,
      expected_trajectory: trajectory,
      checkin_questions: questions,
      medication_plan: medicationPlan,
    })
    .select("*, nurses(full_name, tuman, village)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ patient });
}
