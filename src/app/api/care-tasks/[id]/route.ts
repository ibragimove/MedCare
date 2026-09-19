import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { transitionTask } from "@/lib/task-state-machine";
import { loadOwnedTask, type OwnedTask } from "@/lib/nurse-tasks";
import { loadMedicationRows } from "@/lib/patient-meds";
import { isMissingSchema } from "@/lib/db-errors";
import { OTP_COOLDOWN_SECONDS, OTP_MAX_ATTEMPTS, type NurseTaskDetailResponse } from "@/types/nurse";
import type { TaskStatus } from "@/types/db";

const ROLES = ["nurse", "doctor", "manager", "admin"] as const;

// Loads a task the caller may see: a nurse only her own, other staff roles any.
async function loadTask(
  supabase: ReturnType<typeof createAdminClient>,
  role: string,
  userId: string,
  id: string,
): Promise<{ task: OwnedTask; response: null } | { task: null; response: NextResponse }> {
  if (role === "nurse") return loadOwnedTask(supabase, id, userId);
  const { data } = await supabase.from("care_tasks").select("*").eq("id", id).maybeSingle();
  if (!data) return { task: null, response: NextResponse.json({ error: "Vazifa topilmadi" }, { status: 404 }) };
  return { task: data as OwnedTask, response: null };
}

// GET /api/care-tasks/:id — one task with the patient brief, AI summary and OTP state.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, role, response: authErr } = await requireAnyRole([...ROLES]);
  if (authErr) return authErr;

  const { id } = await params;
  const supabase = createAdminClient();
  const found = await loadTask(supabase, role!, user!.id, id);
  if (found.response) return found.response;
  const task = found.task;

  const { data: patient } = await supabase
    .from("patients")
    .select("id, full_name, tuman, village, address, phone, diagnosis, drug_name, dosage, birth_date, completed_at, profile_id")
    .eq("id", task.patient_id)
    .maybeSingle();
  if (!patient) return NextResponse.json({ error: "Bemor topilmadi" }, { status: 404 });

  const rows = await loadMedicationRows(supabase, patient.id as string);
  const medications =
    rows && rows.length > 0
      ? rows.map((m) => ({ drug_name: m.drug_name, dosage: m.dosage }))
      : patient.drug_name
        ? [{ drug_name: patient.drug_name as string, dosage: patient.dosage as string }]
        : [];

  let ai: NurseTaskDetailResponse["ai"] = null;
  if (task.discharge_id) {
    const { data: summary } = await supabase
      .from("ai_summaries")
      .select("brief_uz, risk_score, main_concerns, home_care_tasks, checklist_uz")
      .eq("discharge_id", task.discharge_id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (summary) {
      ai = {
        brief_uz: summary.brief_uz ?? null,
        risk_score: summary.risk_score ?? null,
        main_concerns: summary.main_concerns ?? [],
        home_care_tasks: summary.home_care_tasks ?? [],
        checklist_uz: summary.checklist_uz ?? [],
      };
    }
  }

  // OTP state (the code itself is never returned to the nurse — the patient reads it out).
  const now = Date.now();
  const { data: lastOtp } = await supabase
    .from("patient_otps")
    .select("created_at, expires_at, used_at")
    .eq("patient_id", task.patient_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const usable = lastOtp && !lastOtp.used_at && new Date(lastOtp.expires_at).getTime() > now ? lastOtp : null;
  const cooldownSeconds = lastOtp
    ? Math.max(0, Math.ceil((new Date(lastOtp.created_at).getTime() + OTP_COOLDOWN_SECONDS * 1000 - now) / 1000))
    : 0;

  let attemptsLeft = OTP_MAX_ATTEMPTS;
  if (usable) {
    const { count } = await supabase
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("action", "otp.failed")
      .eq("entity_id", task.id)
      .gte("created_at", usable.created_at);
    attemptsLeft = Math.max(0, OTP_MAX_ATTEMPTS - (count ?? 0));
  }

  let telegram = false;
  if (patient.profile_id) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("telegram_chat_id")
      .eq("id", patient.profile_id)
      .maybeSingle();
    telegram = Boolean(prof?.telegram_chat_id);
  }

  const body: NurseTaskDetailResponse = {
    task: {
      id: task.id,
      patient_id: task.patient_id,
      status: task.status,
      severity: task.severity,
      sla_deadline: task.sla_deadline,
      accepted_at: task.accepted_at,
      confirmed_at: task.confirmed_at,
      overdue_at: task.overdue_at,
      visit_notes: task.visit_notes,
      checklist_done: task.checklist_done ?? [],
      checklist_persisted: "checklist_done" in task,
    },
    patient: {
      id: patient.id as string,
      full_name: patient.full_name as string,
      tuman: patient.tuman as string,
      village: patient.village as string,
      address: (patient.address as string | null) ?? null,
      phone: (patient.phone as string | null) ?? null,
      diagnosis: patient.diagnosis as string,
      birth_date: (patient.birth_date as string | null) ?? null,
      completed_at: (patient.completed_at as string | null) ?? null,
    },
    medications,
    ai,
    otp: {
      issuedAt: usable?.created_at ?? null,
      expiresAt: usable?.expires_at ?? null,
      cooldownSeconds,
      attemptsLeft,
      delivered: { portal: Boolean(patient.profile_id), telegram },
    },
    serverNow: new Date(now).toISOString(),
  };
  return NextResponse.json(body);
}

const MAX_CHECKLIST_ITEMS = 60;
const MAX_ITEM_LENGTH = 400;
const MAX_NOTES = 2000;

// PATCH /api/care-tasks/:id
//   nurse:  { action: "accept" } (idempotent) or { checklist_done?, visit_notes? } to save visit progress
//   others: { status } — a transition validated by the task state machine
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, role, response: authErr } = await requireAnyRole([...ROLES]);
  if (authErr) return authErr;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    status?: TaskStatus;
    checklist_done?: unknown;
    visit_notes?: unknown;
  };

  const supabase = createAdminClient();
  const found = await loadTask(supabase, role!, user!.id, id);
  if (found.response) return found.response;
  const task = found.task;

  if (role === "nurse") {
    // Progress autosave: ticked checklist items and the visit notes.
    if (body.checklist_done !== undefined || body.visit_notes !== undefined) {
      if (task.status === "confirmed") {
        return NextResponse.json({ error: "Tasdiqlangan vazifani oʻzgartirib boʻlmaydi" }, { status: 409 });
      }
      const patch: Record<string, unknown> = {};
      if (body.visit_notes !== undefined) {
        if (typeof body.visit_notes !== "string" || body.visit_notes.length > MAX_NOTES) {
          return NextResponse.json({ error: `Izoh ${MAX_NOTES} belgidan oshmasligi kerak` }, { status: 400 });
        }
        patch.visit_notes = body.visit_notes.trim() || null;
      }
      if (body.checklist_done !== undefined) {
        const items = body.checklist_done;
        if (
          !Array.isArray(items) ||
          items.length > MAX_CHECKLIST_ITEMS ||
          items.some((i) => typeof i !== "string" || i.length > MAX_ITEM_LENGTH)
        ) {
          return NextResponse.json({ error: "Nazorat roʻyxati notoʻgʻri" }, { status: 400 });
        }
        patch.checklist_done = items;
      }

      let { error } = await supabase.from("care_tasks").update(patch).eq("id", id);
      let checklistPersisted = true;
      if (error && isMissingSchema(error) && "checklist_done" in patch) {
        // Migration not applied: keep the notes, tell the client the ticks stay on the device.
        checklistPersisted = false;
        delete patch.checklist_done;
        ({ error } = Object.keys(patch).length > 0
          ? await supabase.from("care_tasks").update(patch).eq("id", id)
          : { error: null });
      }
      if (error) return NextResponse.json({ error: "Saqlab boʻlmadi. Qayta urinib koʻring." }, { status: 500 });
      return NextResponse.json({ ok: true, checklistPersisted });
    }

    if (body.action !== "accept" && body.status !== "accepted") {
      return NextResponse.json({ error: "Nomaʼlum amal" }, { status: 400 });
    }
    // Idempotent: a second tap (or the Telegram button) after acceptance is not an error.
    if (task.status === "accepted" || task.status === "confirmed") {
      return NextResponse.json({ ok: true, status: task.status, already: true });
    }
    if (task.status === "overdue" || task.status === "escalated") {
      return NextResponse.json(
        { error: "Vazifa kechikkan — qabul qilish shart emas, tashrifni tasdiqlang" },
        { status: 409 },
      );
    }
    const result = await transitionTask(id, "accepted", user!.id, { via: "nurse_app" });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true, status: "accepted" });
  }

  if (!body.status) {
    return NextResponse.json({ error: "status majburiy" }, { status: 400 });
  }
  const result = await transitionTask(id, body.status, user!.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
