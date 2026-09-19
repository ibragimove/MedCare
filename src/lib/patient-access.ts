import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/types/db";

// RLS is off, so every patient-scoped API decides here who may see a patient:
// doctors, managers and admins see everyone; a nurse only her own patients (assigned to her,
// or reached through one of her care tasks); a patient only their own record.
export async function canAccessPatient(
  supabase: SupabaseClient,
  role: UserRole,
  userId: string,
  patient: { id: string; assigned_nurse_id: string | null; profile_id: string | null },
): Promise<boolean> {
  if (role === "doctor" || role === "manager" || role === "admin") return true;
  if (role === "patient") return patient.profile_id === userId;
  if (role === "nurse") {
    if (patient.assigned_nurse_id === userId) return true;
    const { data } = await supabase
      .from("care_tasks")
      .select("id")
      .eq("patient_id", patient.id)
      .eq("nurse_id", userId)
      .limit(1)
      .maybeSingle();
    return Boolean(data);
  }
  return false;
}
