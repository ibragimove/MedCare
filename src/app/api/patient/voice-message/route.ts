import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTelegramVoice } from "@/lib/telegram";
import { requireRole } from "@/lib/auth";
import { sendPushToRole } from "@/lib/push";

export async function POST(request: Request) {
  const { user, response: authError } = await requireRole("patient");
  if (authError) return authError;

  try {
    const formData = await request.formData();
    const patientId = formData.get("patientId") as string | null;
    const audioFile = formData.get("audio") as Blob | null;
    const durationStr = formData.get("duration") as string | null;
    const duration = durationStr ? parseInt(durationStr, 10) : undefined;

    if (!patientId || !audioFile) {
      return NextResponse.json(
        { error: "patientId va audio fayl talab etiladi" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Verify patient belongs to this user
    const { data: patient } = await supabase
      .from("patients")
      .select("id, full_name, tuman, village, diagnosis, profile_id")
      .eq("id", patientId)
      .maybeSingle();

    if (!patient || patient.profile_id !== user.id) {
      return NextResponse.json(
        { error: "Bu davolanish sizga tegishli emas" },
        { status: 403 }
      );
    }

    // 1. Find attached doctor's Telegram chat ID
    let targetChatId: string | number | null = null;

    // Check latest discharge for this patient to find the specific treating doctor
    const { data: latestDischarge } = await supabase
      .from("discharges")
      .select("doctor_id")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestDischarge?.doctor_id) {
      const { data: docProfile } = await supabase
        .from("profiles")
        .select("telegram_chat_id")
        .eq("id", latestDischarge.doctor_id)
        .maybeSingle();

      if (docProfile?.telegram_chat_id) {
        targetChatId = docProfile.telegram_chat_id;
      }
    }

    // If treating doctor has no chat_id yet, fallback to any doctor with telegram_chat_id
    if (!targetChatId) {
      const { data: anyDoc } = await supabase
        .from("profiles")
        .select("telegram_chat_id")
        .eq("role", "doctor")
        .not("telegram_chat_id", "is", null)
        .limit(1)
        .maybeSingle();

      if (anyDoc?.telegram_chat_id) {
        targetChatId = anyDoc.telegram_chat_id;
      }
    }

    // Fallback to TELEGRAM_TEST_CHAT_ID for hackathon demo testing
    if (!targetChatId && process.env.TELEGRAM_TEST_CHAT_ID) {
      targetChatId = process.env.TELEGRAM_TEST_CHAT_ID;
    }

    // 2. Prepare Telegram caption
    const caption = `🎙️ <b>Bemor ovozli xabari</b>\n\n` +
      `👤 <b>Bemor:</b> ${patient.full_name}\n` +
      `📍 <b>Manzil:</b> ${patient.tuman}, ${patient.village}\n` +
      `🩺 <b>Tashxis:</b> ${patient.diagnosis || "Koʻrsatilmagan"}\n\n` +
      `<i>Bemor ushbu xabarni ilova orqali toʻgʻridan-toʻgʻri yozib yubordi.</i>`;

    // 3. Send voice message to Telegram
    let telegramDelivered = false;
    let telegramError: string | undefined;

    if (targetChatId) {
      const tgResult = await sendTelegramVoice(targetChatId, audioFile, caption, duration);
      telegramDelivered = tgResult.ok;
      telegramError = tgResult.error;
    }

    // 4. Create alert record for doctor dashboard
    await supabase.from("alerts").insert({
      patient_id: patientId,
      reason: `🎙️ Bemor ovozli xabar yubordi: ${patient.full_name} (${patient.village})`,
      resolved: false,
    });

    // 5. Send push notification to doctors
    await sendPushToRole("doctor", {
      title: "🎙️ Bemor ovozli xabari",
      body: `${patient.full_name} (${patient.village}) ovozli xabar yubordi`,
      url: `/doctor/patients/${patientId}`,
    });

    return NextResponse.json({
      ok: true,
      telegramDelivered,
      telegramError: telegramDelivered ? undefined : telegramError,
      message: "Ovozli xabar muvaffaqiyatli yuborildi",
    });
  } catch (err) {
    console.error("Voice message upload error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Server xatosi" },
      { status: 500 }
    );
  }
}

