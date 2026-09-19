import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateMedicationPlan } from "@/lib/gemini";
import { requireRole } from "@/lib/auth";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response: authError } = await requireRole("doctor");
  if (authError) return authError;

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("diagnosis, drug_name, dosage, expected_days")
    .eq("id", id)
    .single();

  if (patientError || !patient) {
    return NextResponse.json({ error: "Bemor topilmadi" }, { status: 404 });
  }

  let medicationPlan;
  try {
    medicationPlan = await generateMedicationPlan({
      diagnosis: patient.diagnosis,
      drugName: patient.drug_name,
      dosage: patient.dosage,
      expectedDays: patient.expected_days,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `AI dori rejasini yaratishda xatolik: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  const { error } = await supabase
    .from("patients")
    .update({ medication_plan: medicationPlan })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ medicationPlan });
}
