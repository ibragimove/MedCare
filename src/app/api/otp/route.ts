import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generateOtp } from "@/lib/crypto";
import { createHash } from "crypto";
import { sendTelegramMessage } from "@/lib/telegram";

// POST /api/otp — nurse requests OTP for a patient visit
export async function POST(req: NextRequest) {
  const { response: authErr } = await requireUser();
  if (authErr) return authErr;

  const { patient_id, care_task_id } = (await req.json()) as {
    patient_id: string;
    care_task_id: string;
  };

  if (!patient_id || !care_task_id) {
    return NextResponse.json({ error: "patient_id va care_task_id majburiy" }, { status: 400 });
  }

  const supabase = await createClient();

  // Get patient's Telegram chat_id via profile
  const { data: patient } = await supabase
    .from("patients")
    .select("id, full_name, profile_id")
    .eq("id", patient_id)
    .maybeSingle();

  let telegramChatId: string | null = null;
  if (patient?.profile_id) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("telegram_chat_id")
      .eq("id", patient.profile_id)
      .maybeSingle();
    telegramChatId = prof?.telegram_chat_id ?? null;
  }

  const otp = generateOtp();
  const otpHash = createHash("sha256").update(otp).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  // Invalidate old OTPs for this patient
  await supabase.from("patient_otps").delete().eq("patient_id", patient_id).is("used_at", null);

  await supabase.from("patient_otps").insert({
    patient_id,
    otp_hash: otpHash,
    expires_at: expiresAt,
  });

  // Send OTP to patient via Telegram
  if (telegramChatId) {
    await sendTelegramMessage(
      telegramChatId,
      `🔑 <b>Tashrif tasdiqlash kodi</b>\n\nHamshira tashrifini tasdiqlash uchun ushbu kodni hamshiraga ayting:\n\n<b>${otp}</b>\n\nKod 30 daqiqa amal qiladi.`,
    );
  }

  // Return OTP only in demo — in production only send via SMS/Telegram
  const isDev = process.env.NODE_ENV !== "production";
  return NextResponse.json({
    ok: true,
    otp: isDev ? otp : undefined,
    sent_via_telegram: !!telegramChatId,
  });
}

// POST /api/otp/verify — verify OTP submitted by nurse
export async function PUT(req: NextRequest) {
  const { response: authErr } = await requireUser();
  if (authErr) return authErr;

  const { patient_id, otp_code, visit_id } = (await req.json()) as {
    patient_id: string;
    otp_code: string;
    visit_id?: string;
  };

  if (!patient_id || !otp_code) {
    return NextResponse.json({ error: "patient_id va otp_code majburiy" }, { status: 400 });
  }

  const supabase = await createClient();
  const hash = createHash("sha256").update(otp_code).digest("hex");
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
    return NextResponse.json({ ok: false, error: "Notoʻgʻri yoki muddati oʻtgan kod" }, { status: 400 });
  }

  await supabase
    .from("patient_otps")
    .update({ used_at: now, visit_id: visit_id ?? null })
    .eq("id", record.id);

  return NextResponse.json({ ok: true });
}
