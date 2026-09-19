import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { canTransition, transitionTask } from "@/lib/task-state-machine";
import { writeAudit } from "@/lib/audit";
import { loadOwnedTask } from "@/lib/nurse-tasks";
import { OTP_MAX_ATTEMPTS } from "@/types/nurse";

const MAX_CHECKLIST_ITEMS = 60;
const MAX_ITEM_LENGTH = 400;
const MAX_NOTES = 2000;

// POST /api/care-tasks/:id/complete — the nurse enters the code the patient read out.
// A correct code records the visit and confirms the task; a wrong one is counted, and after
// OTP_MAX_ATTEMPTS misses the code is void and a new one has to be requested.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response: authErr } = await requireRole("nurse");
  if (authErr) return authErr;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    otp_code?: unknown;
    notes?: unknown;
    checklist_done?: unknown;
  };

  const code = typeof body.otp_code === "string" ? body.otp_code.trim() : "";
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "6 xonali tasdiqlash kodini kiriting" }, { status: 400 });
  }
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (notes.length > MAX_NOTES) {
    return NextResponse.json({ error: `Izoh ${MAX_NOTES} belgidan oshmasligi kerak` }, { status: 400 });
  }
  const checklist = body.checklist_done ?? [];
  if (
    !Array.isArray(checklist) ||
    checklist.length > MAX_CHECKLIST_ITEMS ||
    checklist.some((i) => typeof i !== "string" || i.length > MAX_ITEM_LENGTH)
  ) {
    return NextResponse.json({ error: "Nazorat roʻyxati notoʻgʻri" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const found = await loadOwnedTask(supabase, id, user!.id);
  if (found.response) return found.response;
  const task = found.task;

  if (task.status === "confirmed") {
    return NextResponse.json({ ok: true, already: true });
  }
  if (!canTransition(task.status, "confirmed")) {
    return NextResponse.json(
      { error: task.status === "new" ? "Avval vazifani qabul qiling" : "Bu vazifani hozir tasdiqlab boʻlmaydi" },
      { status: 409 },
    );
  }

  const now = new Date();
  const { data: otp } = await supabase
    .from("patient_otps")
    .select("id, otp_hash, created_at")
    .eq("patient_id", task.patient_id)
    .is("used_at", null)
    .gt("expires_at", now.toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!otp) {
    return NextResponse.json(
      { error: "Kod topilmadi yoki muddati tugagan. Yangi kod soʻrang.", attemptsLeft: 0 },
      { status: 400 },
    );
  }

  const { count: failed } = await supabase
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", "otp.failed")
    .eq("entity_id", task.id)
    .gte("created_at", otp.created_at);
  if ((failed ?? 0) >= OTP_MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: "Urinishlar soni tugadi. Bemordan yangi kod soʻrang.", attemptsLeft: 0 },
      { status: 429 },
    );
  }

  if (createHash("sha256").update(code).digest("hex") !== otp.otp_hash) {
    await writeAudit(supabase, {
      actorId: user!.id,
      action: "otp.failed",
      entityType: "care_tasks",
      entityId: task.id,
    });
    const attemptsLeft = Math.max(0, OTP_MAX_ATTEMPTS - ((failed ?? 0) + 1));
    if (attemptsLeft === 0) {
      // Void the code so it cannot be brute-forced across requests.
      await supabase.from("patient_otps").delete().eq("id", otp.id);
    }
    return NextResponse.json(
      {
        error:
          attemptsLeft > 0
            ? `Kod notoʻgʻri. Yana ${attemptsLeft} ta urinish qoldi.`
            : "Urinishlar soni tugadi. Bemordan yangi kod soʻrang.",
        attemptsLeft,
      },
      { status: 400 },
    );
  }

  const { data: visit, error: visitErr } = await supabase
    .from("visits")
    .insert({
      care_task_id: task.id,
      nurse_id: user!.id,
      patient_id: task.patient_id,
      visited_at: now.toISOString(),
      checklist_done: checklist,
      notes: notes || null,
      otp_verified: true,
    })
    .select("id")
    .single();
  if (visitErr || !visit) {
    return NextResponse.json({ error: "Tashrifni saqlab boʻlmadi. Qayta urinib koʻring." }, { status: 500 });
  }

  const result = await transitionTask(task.id, "confirmed", user!.id, { visit_id: visit.id, otp_verified: true });
  if (!result.ok) {
    await supabase.from("visits").delete().eq("id", visit.id);
    return NextResponse.json({ error: result.error ?? "Vazifani tasdiqlab boʻlmadi" }, { status: 409 });
  }

  await supabase.from("patient_otps").update({ used_at: now.toISOString(), visit_id: visit.id }).eq("id", otp.id);
  // Keep the final notes and ticks on the task too (the timeline reads them from there).
  const patch: Record<string, unknown> = { visit_notes: notes || null, checklist_done: checklist };
  const { error: patchErr } = await supabase.from("care_tasks").update(patch).eq("id", task.id);
  if (patchErr) await supabase.from("care_tasks").update({ visit_notes: notes || null }).eq("id", task.id);

  await writeAudit(supabase, {
    actorId: user!.id,
    action: "visit.confirmed",
    entityType: "visits",
    entityId: visit.id,
    meta: { care_task_id: task.id, patient_id: task.patient_id, otp_verified: true },
  });

  return NextResponse.json({ ok: true, visitId: visit.id });
}
