"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage } from "@/types/db";

const SUGGESTED = [
  { icon: "💊", text: "Dorimni kech ichsam nima qilaman?" },
  { icon: "🍽️", text: "Qanday ovqatlanishim kerak?" },
  { icon: "🤕", text: "Bosh ogʻrigʻi normalmi?" },
  { icon: "⚠️", text: "Yon taʼsirlar bormi?" },
];

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatWidget() {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Only follow new content while the reader is already at the bottom.
  const stickToBottomRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function loadMessages() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: true })
      .limit(100);
    setMessages((data as ChatMessage[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll only the message list itself. scrollIntoView also scrolls every
  // ancestor (the whole page), which is what made the page jump on open.
  useEffect(() => {
    const el = containerRef.current;
    if (loading || !el || !stickToBottomRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: streamingId ? "auto" : "smooth" });
  }, [messages, sending, streamingId, loading]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function stopGeneration() {
    abortRef.current?.abort();
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError(null);
    setInput("");
    setSending(true);
    stickToBottomRef.current = true;

    const localId = `local-${crypto.randomUUID()}`;
    const replyId = `local-reply-${crypto.randomUUID()}`;
    const now = () => new Date().toISOString();
    setMessages((prev) => [
      ...prev,
      { id: localId, profile_id: "", patient_id: null, role: "user", content: trimmed, created_at: now() },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    let started = false;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Xatolik yuz berdi");
      }
      if (!res.body) throw new Error("Javob oqimi mavjud emas");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        if (!started) {
          started = true;
          setStreamingId(replyId);
          setMessages((prev) => [
            ...prev,
            { id: replyId, profile_id: "", patient_id: null, role: "assistant", content: chunk, created_at: now() },
          ]);
        } else {
          setMessages((prev) => prev.map((m) => (m.id === replyId ? { ...m, content: m.content + chunk } : m)));
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // User stopped generation — keep whatever was streamed so far.
      } else {
        setError((err as Error).message);
        setMessages((prev) => prev.filter((m) => m.id !== localId && m.id !== replyId));
      }
    } finally {
      abortRef.current = null;
      setStreamingId(null);
      setSending(false);
      inputRef.current?.focus({ preventScroll: true });
    }
  }

  return (
    <div className="relative flex flex-col overflow-hidden rounded-3xl border border-teal-100/60 bg-white shadow-lg shadow-teal-900/5">
      {/* Decorative gradient header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-teal-600 via-teal-500 to-cyan-400 px-4 py-4">
        <div className="pointer-events-none absolute -right-6 -top-10 h-28 w-28 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -right-2 bottom-[-30px] h-20 w-20 rounded-full bg-white/10" />

        <div className="relative flex items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-white/40 animate-pulse-ring" />
            <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white/25 text-xl shadow-inner backdrop-blur-sm">
              🤖
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">AI Tibbiy Yordamchi</p>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-green-300 shadow shadow-green-300/60" />
              <span className="text-[11px] font-medium text-teal-50">
                {sending ? "Yozmoqda..." : "Onlayn · 24/7 mavjud"}
              </span>
            </div>
          </div>
          <div className="ml-auto hidden shrink-0 items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm sm:flex">
            ✨ Gemini AI
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-[60vh] max-h-[520px] min-h-[260px] flex-none space-y-3 overflow-y-auto overscroll-contain bg-gradient-to-b from-teal-50/40 to-white px-4 py-4"
      >
        {loading ? (
          <div className="flex h-full items-center justify-center py-8">
            <div className="flex gap-1.5">
              <span className="h-2 w-2 animate-bounce rounded-full bg-teal-400 [animation-delay:0ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-teal-400 [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-teal-400 [animation-delay:300ms]" />
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center py-3 text-center">
              <div className="animate-float-slow flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-teal-100 to-cyan-100 text-3xl shadow-sm">
                💬
              </div>
              <p className="mt-3 text-sm font-semibold text-gray-700">Salom! Sizga qanday yordam bera olaman?</p>
              <p className="mt-0.5 max-w-[220px] text-xs text-gray-400">
                Davolanishingiz, dorilar yoki parhez haqida istalgan savolni bering
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTED.map((q) => (
                <button
                  key={q.text}
                  onClick={() => sendMessage(q.text)}
                  className="group flex items-center gap-2 rounded-2xl border border-teal-100 bg-white px-3 py-2.5 text-left text-xs font-medium text-gray-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 hover:shadow-md"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm transition group-hover:scale-110">
                    {q.icon}
                  </span>
                  <span className="leading-tight">{q.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => {
            const prevSameRole = messages[i - 1]?.role === m.role;
            const isStreaming = m.id === streamingId;
            return (
              <div
                key={m.id}
                className={`animate-msg-in flex items-end gap-2 ${m.role === "user" ? "flex-row-reverse" : "flex-row"} ${prevSameRole ? "mt-1" : "mt-3"}`}
              >
                {m.role === "assistant" ? (
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 text-xs shadow-sm ${prevSameRole ? "invisible" : ""}`}>
                    🤖
                  </div>
                ) : (
                  <div className="w-1 shrink-0" />
                )}
                <div className="group flex max-w-[78%] flex-col">
                  <div
                    className={`whitespace-pre-wrap px-4 py-2.5 text-sm shadow-sm ${
                      m.role === "user"
                        ? "rounded-2xl rounded-br-md bg-gradient-to-br from-teal-600 to-cyan-500 text-white"
                        : "rounded-2xl rounded-bl-md border border-gray-100 bg-white text-gray-800"
                    }`}
                  >
                    {m.content}
                    {isStreaming && (
                      <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-teal-500 align-middle" />
                    )}
                  </div>
                  {!isStreaming && (
                    <span className={`mt-0.5 px-1 text-[9px] text-gray-300 opacity-0 transition group-hover:opacity-100 ${m.role === "user" ? "text-right" : "text-left"}`}>
                      {formatTime(m.created_at)}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}

        {sending && !streamingId && (
          <div className="animate-msg-in flex items-end gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 text-xs shadow-sm">
              🤖
            </div>
            <div className="rounded-2xl rounded-bl-md border border-gray-100 bg-white px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-teal-400 [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-teal-400 [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-teal-400 [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="animate-msg-in flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            <span>⚠️</span>
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="shrink-0 font-semibold underline">Yopish</button>
          </div>
        )}

      </div>

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
        className="flex items-center gap-2 border-t border-gray-100 bg-white p-3"
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Savolingizni yozing..."
          className="flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-100"
          disabled={sending}
        />
        {sending ? (
          <button
            type="button"
            onClick={stopGeneration}
            title="Toʻxtatish"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-50"
          >
            <span className="block h-3 w-3 rounded-sm bg-gray-600" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-600 to-cyan-500 text-white shadow-md transition hover:scale-105 hover:shadow-lg disabled:scale-100 disabled:opacity-40 disabled:shadow-none"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        )}
      </form>

      <p className="border-t border-gray-50 bg-gray-50/50 px-4 py-2 text-center text-[10px] text-gray-400">
        🛡️ AI yordamchi shifokor maslahatini almashtirmaydi
      </p>
    </div>
  );
}
