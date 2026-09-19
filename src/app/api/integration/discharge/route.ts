import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySignature, encryptPinfl, maskPinfl } from "@/lib/crypto";
import { loadSlaConfig } from "@/lib/sla";
import { computeSlaDeadline } from "@/lib/task-state-machine";

const INTEGRATION_SECRET = process.env.INTEGRATION_SECRET ?? "";

// FHIR-like discharge integration endpoint for external hospital systems
// POST /api/integration/discharge
// Headers: X-Signature: hmac-sha256 of raw body
export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-signature") ?? "";
  const rawBody = await req.text();

  if (INTEGRATION_SECRET && !verifySignature(rawBody, INTEGRATION_SECRET, signature)) {
    return NextResponse.json({ error: "Imzo notoʻgʻri" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON notoʻgʻri" }, { status: 400 });
  }

  const {
    full_name,
    pinfl,
    birth_date,
    tuman,
    village,
    diagnosis,
    drug_name,
    dosage,
    expected_days,
    epicrisis,
    severity = "routine",
  } = body as Record<string, string | number>;

  if (!full_name || !diagnosis || !epicrisis) {
    return NextResponse.json({ error: "full_name, diagnosis, epicrisis majburiy" }, { status: 400 });
  }

  const supabase = await createClient();

  // Upsert patient
  let pinfl_enc: string | null = null;
  let pinfl_last4: string | null = null;
  if (pinfl && typeof pinfl === "string") {
    pinfl_enc = encryptPinfl(pinfl);
    pinfl_last4 = maskPinfl(pinfl);
  }

  const { data: patient, error: patErr } = await supabase
    .from("patients")
    .insert({
      full_name,
      tuman: tuman ?? "",
      village: village ?? "",
      diagnosis,
      drug_name: drug_name ?? "",
      dosage: dosage ?? "",
      expected_days: Number(expected_days) || 7,
      discharge_date: new Date().toISOString().slice(0, 10),
      pinfl_enc,
      pinfl_last4,
      birth_date: birth_date ?? null,
      status: "active",
    })
    .select()
    .single();

  if (patErr || !patient) {
    return NextResponse.json({ error: patErr?.message ?? "Bemor yaratilmadi" }, { status: 500 });
  }

  // Create discharge record
  const { data: discharge } = await supabase
    .from("discharges")
    .insert({
      patient_id: patient.id,
      doctor_id: "00000000-0000-0000-0000-000000000000", // system doctor
      epicrisis_raw: String(epicrisis),
      severity: String(severity),
    })
    .select()
    .single();

  if (!discharge) {
    return NextResponse.json({ error: "Discharge yaratilmadi" }, { status: 500 });
  }

  // Create care task
  const deadline = computeSlaDeadline(String(severity) as "routine" | "urgent" | "critical", await loadSlaConfig(supabase));
  const { data: task } = await supabase
    .from("care_tasks")
    .insert({
      patient_id: patient.id,
      discharge_id: discharge.id,
      status: "new",
      severity: String(severity),
      sla_deadline: deadline.toISOString(),
    })
    .select()
    .single();

  await supabase.from("audit_logs").insert({
    actor_id: null,
    action: "discharge.integrated",
    entity_type: "discharges",
    entity_id: discharge.id,
    meta: { source: "fhir_integration", patient_id: patient.id },
  });

  return NextResponse.json(
    {
      patient_id: patient.id,
      discharge_id: discharge.id,
      task_id: task?.id,
      pinfl_masked: pinfl_last4,
    },
    { status: 201 },
  );
}
