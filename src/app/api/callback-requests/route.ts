import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTelegramMessage } from "@/lib/telegram";
import { requireRole } from "@/lib/auth";
import { sendPushToRole } from "@/lib/push";

export async function POST(request: Request) {
  const { user, response: authError } = await requireRole("patient");
  if (authError) return authError;

  const { patientId, note } = (await request.json()) as { patientId: string; note?: string };
  if (!patientId) {
    return NextResponse.json({ error: "patientId talab etiladi" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: patient } = await supabase
    .from("patients")
    .select("full_name, village, profile_id")
    .eq("id", patientId)
    .maybeSingle();

  if (!patient || patient.profile_id !== user.id) {
    return NextResponse.json({ error: "Bu davolanish sizga tegishli emas" }, { status: 403 });
  }

  const { error: insertError } = await supabase.from("callback_requests").insert({
    patient_id: patientId,
    profile_id: user.id,
    note: note || null,
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  await supabase.from("alerts").insert({
    patient_id: patientId,
    reason: `Bemor qoʻngʻiroq soʻradi: ${patient.full_name}${note ? ` — ${note}` : ""}`,
  });

  const { data: doctorProfile } = await supabase
    .from("profiles")
    .select("telegram_chat_id")
    .eq("role", "doctor")
    .limit(1)
    .maybeSingle();

  if (doctorProfile?.telegram_chat_id) {
    try {
      await sendTelegramMessage(
        doctorProfile.telegram_chat_id,
        `📞 Qayta qoʻngʻiroq soʻrovi\n\n${patient.full_name} (${patient.village})${note ? `\nIzoh: ${note}` : ""}`,
      );
    } catch (err) {
      console.error("Telegram callback notification failed:", err);
    }
  }

  await sendPushToRole("doctor", {
    title: "📞 Qayta qoʻngʻiroq soʻrovi",
    body: `${patient.full_name} (${patient.village})${note ? ` — ${note}` : ""}`,
    url: "/doctor",
  });

  return NextResponse.json({ ok: true });
}
