import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTelegramMessage } from "@/lib/telegram";
import { requireRole } from "@/lib/auth";

export async function POST(request: Request) {
  const { response: authError } = await requireRole("doctor");
  if (authError) return authError;

  const { patientId } = (await request.json()) as { patientId: string };

  if (!patientId) {
    return NextResponse.json({ error: "patientId talab etiladi" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: patient, error } = await supabase
    .from("patients")
    .select("full_name, drug_name, dosage")
    .eq("id", patientId)
    .single();

  if (error || !patient) {
    return NextResponse.json({ error: "Bemor topilmadi" }, { status: 404 });
  }

  const text =
    `Assalomu alaykum! Bu MedCare avtomatik eslatmasi.\n\n` +
    `${patient.full_name} bugun dam olish kuni ham davolanishni davom ettirishi kerak:\n` +
    `— Dori: ${patient.drug_name} (${patient.dosage})\n\n` +
    `Iltimos, dorini vaqtida ichishiga yordam bering va holatidan xabardor boʻling. ` +
    `Agar holati yomonlashsa, eng yaqin tibbiyot punktiga murojaat qiling.`;

  // Find patient's linked Telegram chat_id via their profile
  const { data: patientRow } = await supabase
    .from("patients")
    .select("profile_id")
    .eq("id", patientId)
    .maybeSingle();

  const chatId = patientRow?.profile_id
    ? (await supabase.from("profiles").select("telegram_chat_id").eq("id", patientRow.profile_id).maybeSingle())
        .data?.telegram_chat_id ?? null
    : null;

  if (!chatId) {
    return NextResponse.json({ error: "Bemor Telegram bilan bogʻlanmagan" }, { status: 404 });
  }

  try {
    await sendTelegramMessage(chatId, text);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
