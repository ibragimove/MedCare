import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptPinfl } from "@/lib/crypto";

// GET /api/otp — the patient reads the active visit confirmation code.
// Requesting and verifying codes is done by the nurse under /api/care-tasks/:id/otp and /complete.
export async function GET() {
  const { user, response: authErr } = await requireUser();
  if (authErr) return authErr;

  const role = user?.user_metadata?.role as string | undefined;
  const supabase = createAdminClient();
  let patientId: string | null = null;

  if (role === "patient") {
    const { data: patient } = await supabase
      .from("patients")
      .select("id")
      .eq("profile_id", user!.id)
      .is("completed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    patientId = patient?.id ?? null;
  }

  if (!patientId) {
    return NextResponse.json({ active: false });
  }

  const now = new Date().toISOString();
  const { data: record } = await supabase
    .from("patient_otps")
    .select("otp_enc, expires_at")
    .eq("patient_id", patientId)
    .is("used_at", null)
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!record || !record.otp_enc) {
    return NextResponse.json({ active: false });
  }

  try {
    const otp = decryptPinfl(record.otp_enc);
    return NextResponse.json({ active: true, otp, expires_at: record.expires_at });
  } catch {
    return NextResponse.json({ active: false });
  }
}
