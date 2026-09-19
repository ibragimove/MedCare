import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { transitionTask } from "@/lib/task-state-machine";
import { createHash } from "crypto";
import { writeAudit } from "@/lib/audit";

// POST /api/visits — record visit, verify OTP, update checklist, confirm task
export async function POST(req: NextRequest) {
  const { user, response: authErr } = await requireAnyRole(["nurse", "doctor", "manager", "admin"]);
  if (authErr) return authErr;

  const body = (await req.json().catch(() => ({}))) as {
    care_task_id: string;
    patient_id: string;
    checklist_done?: string[];
    notes?: string;
    otp_code?: string;
  };

  const { care_task_id, patient_id, checklist_done, notes, otp_code } = body;
  if (!care_task_id || !patient_id) {
    return NextResponse.json({ error: "care_task_id va patient_id majburiy" }, { status: 400 });
  }

  const supabase = createAdminClient();
  let otpVerified = false;

  if (otp_code?.trim()) {
    const hash = createHash("sha256").update(otp_code.trim()).digest("hex");
    const now = new Date().toISOString();
    const { data: record } = await supabase
      .from("patient_otps")
      .select("id, expires_at, used_at")
      .eq("patient_id", patient_id)
      .eq("otp_hash", hash)
      .is("used_at", null)
      .gt("expires_at", now)
      .maybeSingle();

    if (!record) {
      return NextResponse.json({ error: "Kiritilgan OTP kod notoʻgʻri yoki muddati oʻtgan" }, { status: 400 });
    }
    otpVerified = true;
  }

  const now = new Date().toISOString();
  const { data: visit, error: visitErr } = await supabase
    .from("visits")
    .insert({
      care_task_id,
      nurse_id: user!.id,
      patient_id,
      visited_at: now,
      checklist_done: checklist_done ?? [],
      notes: notes?.trim() || null,
      otp_verified: otpVerified,
    })
    .select()
    .single();

  if (visitErr) {
    return NextResponse.json({ error: visitErr.message }, { status: 500 });
  }

  if (otpVerified && otp_code?.trim()) {
    const hash = createHash("sha256").update(otp_code.trim()).digest("hex");
    await supabase
      .from("patient_otps")
      .update({ used_at: now, visit_id: visit.id })
      .eq("patient_id", patient_id)
      .eq("otp_hash", hash);
  }

  // Transition care task to confirmed
  await transitionTask(care_task_id, "confirmed", user!.id, {
    visit_id: visit.id,
    otp_verified: otpVerified,
  });

  if (notes?.trim()) {
    await supabase.from("care_tasks").update({ visit_notes: notes.trim() }).eq("id", care_task_id);
  }

  await writeAudit(supabase, {
    actorId: user!.id,
    action: "visit.confirmed",
    entityType: "visits",
    entityId: visit.id,
    meta: { care_task_id, patient_id, otp_verified: otpVerified },
  });

  return NextResponse.json({ ok: true, visit });
}

// GET /api/visits?care_task_id=... or ?patient_id=...
export async function GET(req: NextRequest) {
  const { response: authErr } = await requireAnyRole(["nurse", "doctor", "manager", "admin"]);
  if (authErr) return authErr;

  const { searchParams } = req.nextUrl;
  const careTaskId = searchParams.get("care_task_id");
  const patientId = searchParams.get("patient_id");

  const supabase = createAdminClient();
  let q = supabase.from("visits").select("*").order("visited_at", { ascending: false });
  if (careTaskId) q = q.eq("care_task_id", careTaskId);
  if (patientId) q = q.eq("patient_id", patientId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ visits: data });
}
