import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateOtp, encryptPinfl } from "@/lib/crypto";
import { sendTelegramMessage } from "@/lib/telegram";
import { writeAudit } from "@/lib/audit";
import { isMissingSchema } from "@/lib/db-errors";
import { loadOwnedTask, loadOtpExpiryMinutes } from "@/lib/nurse-tasks";
import { WORKABLE } from "@/lib/nurse-ui";
import { OTP_COOLDOWN_SECONDS } from "@/types/nurse";

// POST /api/care-tasks/:id/otp — the nurse asks for a visit confirmation code.
// The code goes to the patient (portal + Telegram); the response never contains it,
// so the nurse can only complete the visit by being with the patient.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response: authErr } = await requireRole("nurse");
  if (authErr) return authErr;

  const { id } = await params;
  const supabase = createAdminClient();
  const found = await loadOwnedTask(supabase, id, user!.id);
  if (found.response) return found.response;
  const task = found.task;

  if (task.status === "confirmed") {
    return NextResponse.json({ error: "Bu tashrif allaqachon tasdiqlangan" }, { status: 409 });
  }
  if (!WORKABLE.has(task.status)) {
    return NextResponse.json({ error: "Avval vazifani qabul qiling" }, { status: 409 });
  }

  // Server-side resend cooldown (the button's countdown is only a hint).
  const { data: last } = await supabase
    .from("patient_otps")
    .select("created_at")
    .eq("patient_id", task.patient_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last) {
    const wait = Math.ceil((new Date(last.created_at).getTime() + OTP_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000);
    if (wait > 0) {
      return NextResponse.json(
        { error: `Yangi kodni ${wait} soniyadan keyin soʻrashingiz mumkin`, retryAfter: wait },
        { status: 429, headers: { "Retry-After": String(wait) } },
      );
    }
  }

  const { data: patient } = await supabase
    .from("patients")
    .select("id, full_name, profile_id")
    .eq("id", task.patient_id)
    .maybeSingle();
  if (!patient) return NextResponse.json({ error: "Bemor topilmadi" }, { status: 404 });

  let telegramChatId: string | null = null;
  if (patient.profile_id) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("telegram_chat_id")
      .eq("id", patient.profile_id)
      .maybeSingle();
    telegramChatId = prof?.telegram_chat_id ?? null;
  }
  if (!patient.profile_id && !telegramChatId) {
    return NextResponse.json(
      { error: "Bemorda shaxsiy kabinet yoki Telegram yoʻq — kodni yetkazib boʻlmaydi. Shifokorga xabar bering." },
      { status: 409 },
    );
  }

  const otp = generateOtp();
  const minutes = await loadOtpExpiryMinutes(supabase);
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  const row = { patient_id: task.patient_id, otp_hash: createHash("sha256").update(otp).digest("hex"), expires_at: expiresAt };

  // A fresh code replaces any unused one.
  await supabase.from("patient_otps").delete().eq("patient_id", task.patient_id).is("used_at", null);
  let { error } = await supabase.from("patient_otps").insert({ ...row, otp_enc: encryptPinfl(otp) });
  let portal = Boolean(patient.profile_id);
  if (error && isMissingSchema(error)) {
    // migration_008 not applied: no portal copy of the code, Telegram only.
    portal = false;
    if (!telegramChatId) {
      return NextResponse.json(
        { error: "Maʼlumotlar bazasi yangilanmagan. Supabase → SQL Editorʼda supabase/migration_008_polish.sql faylini ishga tushiring." },
        { status: 503 },
      );
    }
    ({ error } = await supabase.from("patient_otps").insert(row));
  }
  if (error) return NextResponse.json({ error: "Kod yaratib boʻlmadi. Qayta urinib koʻring." }, { status: 500 });

  if (telegramChatId) {
    try {
      await sendTelegramMessage(
        telegramChatId,
        `🔑 <b>Tashrif tasdiqlash kodi</b>\n\nHamshira tashrifini tasdiqlash uchun ushbu kodni hamshiraga ayting:\n\n<b>${otp}</b>\n\nKod ${minutes} daqiqa amal qiladi.`,
      );
    } catch (err) {
      console.error("OTP telegram send failed:", (err as Error).message);
    }
  }

  await writeAudit(supabase, {
    actorId: user!.id,
    action: "otp.issued",
    entityType: "care_tasks",
    entityId: task.id,
    meta: { portal, telegram: Boolean(telegramChatId) },
  });

  return NextResponse.json({
    ok: true,
    expiresAt,
    cooldownSeconds: OTP_COOLDOWN_SECONDS,
    delivered: { portal, telegram: Boolean(telegramChatId) },
  });
}
