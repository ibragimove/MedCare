import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateMedicationPlan } from "@/lib/gemini";
import { fallbackPlan, joinedDosages, joinedDrugNames, type MedicationInput } from "@/lib/medications";
import type { MedicationPlan, PatientMedication } from "@/types/db";

function frequencyToTimes(freq: string | null): number | null {
  const m = freq?.match(/(\d)/);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 4 ? n : null;
}

export function medicationRowToInput(row: PatientMedication): MedicationInput {
  return {
    drugName: row.drug_name,
    dosage: row.dosage,
    timesPerDay: frequencyToTimes(row.frequency),
    durationDays: row.duration_days,
    note: row.instructions,
  };
}

// Structured drug rows when patient_medications exists (migration_008), otherwise the legacy
// single drug_name / dosage pair.
export async function loadMedicationRows(
  supabase: SupabaseClient,
  patientId: string,
  opts: { includeStopped?: boolean } = {},
): Promise<PatientMedication[] | null> {
  let query = supabase.from("patient_medications").select("*").eq("patient_id", patientId);
  if (!opts.includeStopped) query = query.is("stopped_at", null);
  const { data, error } = await query
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return null;
  return (data ?? []) as PatientMedication[];
}

export async function loadMedicationInputs(
  supabase: SupabaseClient,
  patient: { id: string; drug_name: string; dosage: string; expected_days: number },
): Promise<MedicationInput[]> {
  const rows = await loadMedicationRows(supabase, patient.id);
  if (rows && rows.length > 0) return rows.map(medicationRowToInput);
  return patient.drug_name
    ? [{ drugName: patient.drug_name, dosage: patient.dosage, durationDays: patient.expected_days }]
    : [];
}

// Rebuilds patients.medication_plan (AI, deterministic fallback) and the joined legacy
// drug_name / dosage from the currently active drugs. Call after any medication change.
export async function refreshMedicationPlan(
  supabase: SupabaseClient,
  patient: { id: string; diagnosis: string; drug_name: string; dosage: string; expected_days: number },
): Promise<MedicationPlan> {
  const medications = await loadMedicationInputs(supabase, patient);
  let plan: MedicationPlan;
  try {
    plan = await generateMedicationPlan({
      diagnosis: patient.diagnosis,
      medications,
      expectedDays: patient.expected_days,
    });
  } catch (err) {
    console.error("generateMedicationPlan failed:", err);
    plan = fallbackPlan(medications, patient.expected_days);
  }
  const { error } = await supabase
    .from("patients")
    .update({
      medication_plan: plan,
      drug_name: joinedDrugNames(medications),
      dosage: joinedDosages(medications),
    })
    .eq("id", patient.id);
  if (error) throw new Error(error.message);
  return plan;
}
