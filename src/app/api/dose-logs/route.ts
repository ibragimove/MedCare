import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";

// Toggles a single scheduled dose: inserts a taken row if missing, removes it if present.
export async function POST(request: Request) {
  const { user, response: authError } = await requireRole("patient");
  if (authError) return authError;

  const { patientId, drug, scheduledDate, scheduledTime } = (await request.json()) as {
    patientId: string;
    drug: string;
    scheduledDate: string;
    scheduledTime: string;
  };

  if (!patientId || !drug || !scheduledDate || !scheduledTime) {
    return NextResponse.json({ error: "Barcha maydonlar talab etiladi" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: patient } = await supabase
    .from("patients")
    .select("profile_id")
    .eq("id", patientId)
    .maybeSingle();

  if (!patient || patient.profile_id !== user.id) {
    return NextResponse.json({ error: "Bu davolanish sizga tegishli emas" }, { status: 403 });
  }

  const { data: existing } = await supabase
    .from("dose_logs")
    .select("id")
    .eq("patient_id", patientId)
    .eq("drug", drug)
    .eq("scheduled_date", scheduledDate)
    .eq("scheduled_time", scheduledTime)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("dose_logs").delete().eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ taken: false });
  }

  const { error } = await supabase.from("dose_logs").insert({
    patient_id: patientId,
    drug,
    scheduled_date: scheduledDate,
    scheduled_time: scheduledTime,
    taken_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ taken: true });
}
