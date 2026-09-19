import "server-only";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

export async function sendTelegramMessage(chatId: string | number, text: string): Promise<void> {
  if (!BOT_TOKEN) return;
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

export async function sendTelegramWithButton(
  chatId: string | number,
  text: string,
  buttonLabel: string,
  callbackData: string,
): Promise<{ message_id: number } | null> {
  if (!BOT_TOKEN) return null;
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: buttonLabel, callback_data: callbackData }]],
      },
    }),
  });
  const json = (await res.json()) as { ok: boolean; result?: { message_id: number } };
  return json.ok ? (json.result ?? null) : null;
}

export async function editTelegramMessage(
  chatId: string | number,
  messageId: number,
  text: string,
): Promise<void> {
  if (!BOT_TOKEN) return;
  await fetch(`${TELEGRAM_API}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" }),
  });
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  if (!BOT_TOKEN) return;
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

export async function sendTelegramVoice(
  chatId: string | number,
  audioBlob: Blob,
  caption?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!BOT_TOKEN) return { ok: false, error: "Telegram bot sozlanmagan" };

  try {
    // First try sendVoice
    const voiceForm = new FormData();
    voiceForm.append("chat_id", String(chatId));
    voiceForm.append("voice", audioBlob, "voice_message.ogg");
    if (caption) {
      voiceForm.append("caption", caption);
      voiceForm.append("parse_mode", "HTML");
    }

    const voiceRes = await fetch(`${TELEGRAM_API}/sendVoice`, {
      method: "POST",
      body: voiceForm,
    });
    const voiceJson = (await voiceRes.json()) as { ok: boolean; description?: string };
    if (voiceJson.ok) {
      return { ok: true };
    }

    // Fallback to sendAudio if voice codec is rejected
    const audioForm = new FormData();
    audioForm.append("chat_id", String(chatId));
    audioForm.append("audio", audioBlob, "voice_message.webm");
    if (caption) {
      audioForm.append("caption", caption);
      audioForm.append("parse_mode", "HTML");
    }

    const audioRes = await fetch(`${TELEGRAM_API}/sendAudio`, {
      method: "POST",
      body: audioForm,
    });
    const audioJson = (await audioRes.json()) as { ok: boolean; description?: string };
    if (audioJson.ok) {
      return { ok: true };
    }

    return { ok: false, error: audioJson.description ?? voiceJson.description ?? "Telegram yuborishda xatolik" };
  } catch (err) {
    console.error("sendTelegramVoice error:", err);
    return { ok: false, error: (err as Error).message };
  }
}
