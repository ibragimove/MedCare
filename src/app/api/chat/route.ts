import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { streamChatWithPatient, type ChatTurn } from "@/lib/gemini";
import { requireRole } from "@/lib/auth";

// Streaming replies can take longer than the default function timeout.
export const maxDuration = 60;

export async function POST(request: Request) {
  const { user, response: authError } = await requireRole("patient");
  if (authError) return authError;

  const { message } = (await request.json()) as { message: string };
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Xabar talab etiladi" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: patient } = await supabase
    .from("patients")
    .select("id, diagnosis, drug_name, dosage, expected_trajectory")
    .eq("profile_id", user.id)
    .is("completed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: recentCheckinsRaw } = patient
    ? await supabase
        .from("checkins")
        .select("date, ai_recommendation")
        .eq("patient_id", patient.id)
        .order("created_at", { ascending: false })
        .limit(3)
    : { data: [] };

  const { data: historyRaw } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(40);

  const history = (historyRaw ?? []).slice().reverse() as ChatTurn[];

  let chunks: AsyncIterable<string>;
  try {
    chunks = await streamChatWithPatient({
      diagnosis: patient?.diagnosis ?? "Nomaʼlum",
      drugName: patient?.drug_name ?? "-",
      dosage: patient?.dosage ?? "-",
      trajectory: patient?.expected_trajectory ?? "-",
      recentCheckins: (recentCheckinsRaw ?? []).map((c) => ({
        date: c.date,
        recommendation: c.ai_recommendation,
      })),
      history,
      message,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `AI javob berishda xatolik: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      let failed = false;
      try {
        for await (const text of chunks) {
          if (request.signal.aborted) break;
          full += text;
          controller.enqueue(encoder.encode(text));
        }
      } catch (err) {
        failed = true;
        console.error("chat stream failed:", err);
        if (!full) {
          controller.enqueue(
            encoder.encode("Kechirasiz, AI hozir javob bera olmadi. Iltimos, qayta urinib koʻring."),
          );
        }
      }

      // Persist before closing so the function isn't frozen mid-insert.
      const reply = full.trim();
      if (!failed && reply) {
        await supabase.from("chat_messages").insert([
          { profile_id: user.id, patient_id: patient?.id ?? null, role: "user", content: message },
          { profile_id: user.id, patient_id: patient?.id ?? null, role: "assistant", content: reply },
        ]);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
