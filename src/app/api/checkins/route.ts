import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scoreCheckin } from "@/lib/gemini";
import { requireRole } from "@/lib/auth";
import { canAccessPatient } from "@/lib/patient-access";
import { sendPushToRole } from "@/lib/push";

// GET /api/checkins?patientId=… — the questionnaire for one of the nurse's own patients.
export async function GET(request: Request) {
  const { user, response: authError } = await requireRole("nurse");
  if (authError) return authError;

  const patientId = new URL(request.url).searchParams.get("patientId");
  if (!patientId) return NextResponse.json({ error: "patientId talab etiladi" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: patient } = await supabase
    .from("patients")
    .select("id, full_name, tuman, village, diagnosis, drug_name, dosage, checkin_questions, assigned_nurse_id, profile_id, completed_at")
    .eq("id", patientId)
    .maybeSingle();
  if (!patient) return NextResponse.json({ error: "Bemor topilmadi" }, { status: 404 });
  if (!(await canAccessPatient(supabase, "nurse", user.id, patient))) {
    return NextResponse.json({ error: "Bu bemor sizga biriktirilmagan" }, { status: 403 });
  }

  return NextResponse.json({
    patient: {
      id: patient.id,
      full_name: patient.full_name,
      tuman: patient.tuman,
      village: patient.village,
      diagnosis: patient.diagnosis,
      drug_name: patient.drug_name,
      dosage: patient.dosage,
      completed_at: patient.completed_at,
    },
    questions: patient.checkin_questions ?? [],
  });
}

export async function POST(request: Request) {
  const { user, response: authError } = await requireRole("nurse");
  if (authError) return authError;

  const body = await request.json();
  const { patientId, answers } = body as {
    patientId: string;
    answers: Record<string, boolean>;
  };

  if (!patientId || !answers) {
    return NextResponse.json({ error: "patientId va answers talab etiladi" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("*")
    .eq("id", patientId)
    .single();

  if (patientError || !patient) {
    return NextResponse.json({ error: "Bemor topilmadi" }, { status: 404 });
  }

  if (!(await canAccessPatient(supabase, "nurse", user.id, patient))) {
    return NextResponse.json({ error: "Bu bemor sizga biriktirilmagan" }, { status: 403 });
  }

  const dischargeDate = new Date(patient.discharge_date);
  const daysSinceDischarge = Math.max(
    0,
    Math.round((Date.now() - dischargeDate.getTime()) / (1000 * 60 * 60 * 24)),
  );

  let score;
  try {
    score = await scoreCheckin({
      diagnosis: patient.diagnosis,
      drugName: patient.drug_name,
      expectedDays: patient.expected_days,
      daysSinceDischarge,
      trajectory: patient.expected_trajectory ?? "",
      questions: patient.checkin_questions ?? [],
      answers,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `AI baholashda xatolik: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  const { data: checkin, error: checkinError } = await supabase
    .from("checkins")
    .insert({
      patient_id: patientId,
      answers,
      match_percent: score.matchPercent,
      ai_recommendation: score.recommendation,
    })
    .select("*")
    .single();

  if (checkinError) {
    return NextResponse.json({ error: checkinError.message }, { status: 500 });
  }

  await supabase
    .from("patients")
    .update({
      last_match_percent: score.matchPercent,
      last_status: score.status,
    })
    .eq("id", patientId);

  if (score.status === "deviation") {
    await supabase.from("alerts").insert({
      patient_id: patientId,
      reason: score.recommendation,
    });
    await sendPushToRole("doctor", {
      title: `⚠️ Chetlanish: ${patient.full_name}`,
      body: `${patient.tuman ?? patient.village} · ${patient.diagnosis} · moslik ${score.matchPercent}%\n${score.recommendation}`,
      url: "/doctor",
    });
  }

  return NextResponse.json({ checkin, score });
}
