import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendTelegramMessage, editTelegramMessage, answerCallbackQuery } from "@/lib/telegram";
import { transitionTask } from "@/lib/task-state-machine";

const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

export async function POST(req: NextRequest) {
  // Verify Telegram webhook secret token
  const token = req.headers.get("x-telegram-bot-api-secret-token");
  if (SECRET && token !== SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update = (await req.json()) as Record<string, any>;

  // Handle /start command with phone linking
  if (update.message?.text?.startsWith("/start")) {
    const chatId = update.message.chat.id as number;

    await sendTelegramMessage(
      chatId,
      `👋 <b>MedCare botiga xush kelibsiz!</b>\n\nTizimga ulaning: <b>/link [telefon raqam]</b>\nMasalan: <b>/link +998901234567</b>`,
    );
    return NextResponse.json({ ok: true });
  }

  // Handle /link [phone] to link nurse's Telegram to their profile
  if (update.message?.text?.startsWith("/link ")) {
    const chatId = update.message.chat.id as number;
    const phone = update.message.text.replace("/link ", "").trim();
    const supabase = await createClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("phone", phone)
      .maybeSingle();

    if (!profile) {
      await sendTelegramMessage(chatId, `❌ Bu telefon raqam tizimda topilmadi: ${phone}`);
      return NextResponse.json({ ok: true });
    }

    await supabase
      .from("profiles")
      .update({ telegram_chat_id: String(chatId) })
      .eq("id", profile.id);

    await sendTelegramMessage(
      chatId,
      `✅ Muvaffaqiyatli ulandi!\nXush kelibsiz, <b>${profile.full_name}</b>!\nEndi siz bildirishnomalar va vazifalarni shu bot orqali olasiz.`,
    );
    return NextResponse.json({ ok: true });
  }

  // Handle inline button callback (e.g. "accept:<task_id>")
  if (update.callback_query) {
    const cbq = update.callback_query;
    const data: string = cbq.data ?? "";
    const chatId = cbq.message?.chat?.id;
    const messageId = cbq.message?.message_id;

    if (data.startsWith("accept:")) {
      const taskId = data.replace("accept:", "");
      const supabase = await createClient();

      // Find nurse profile by telegram chat_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("telegram_chat_id", String(chatId))
        .maybeSingle();

      if (!profile) {
        await answerCallbackQuery(cbq.id, "❌ Profil topilmadi");
        return NextResponse.json({ ok: true });
      }

      // Only the nurse the task belongs to may accept it from the bot.
      const { data: owned } = await supabase
        .from("care_tasks")
        .select("id")
        .eq("id", taskId)
        .eq("nurse_id", profile.id)
        .maybeSingle();
      if (!owned) {
        await answerCallbackQuery(cbq.id, "❌ Bu vazifa sizga tegishli emas");
        return NextResponse.json({ ok: true });
      }

      const result = await transitionTask(taskId, "accepted", profile.id, { via: "telegram" });

      if (!result.ok) {
        await answerCallbackQuery(cbq.id, `❌ ${result.error}`);
        return NextResponse.json({ ok: true });
      }

      await answerCallbackQuery(cbq.id, "✅ Qabul qilindi!");

      // Edit the original message to remove the button and show accepted state
      if (chatId && messageId) {
        await editTelegramMessage(
          chatId,
          messageId,
          cbq.message?.text?.replace("Yangi tashrif vazifasi", "✅ Qabul qilingan vazifa") ??
            "✅ Vazifa qabul qilindi",
        );
      }
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
