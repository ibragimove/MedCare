"use client";

import { useState } from "react";
import { callApi } from "@/components/nurse/shared";
import { INPUT } from "@/components/patient-detail/ui";

type Level = "urgent" | "critical";

const LEVELS: { id: Level; label: string; hint: string; tone: string }[] = [
  { id: "urgent", label: "Shoshilinch", hint: "Holat yomonlashdi, shifokor tez javob berishi kerak", tone: "border-orange-400 bg-orange-50 text-orange-800" },
  { id: "critical", label: "Kritik", hint: "Hayot uchun xavf — zudlik bilan yordam kerak", tone: "border-red-500 bg-red-50 text-red-800" },
];

// "Holati yomon": severity + short note → an alert row for the doctor plus push/Telegram.
// A confirmation step keeps an accidental tap from paging the doctor.
export default function HoldatiYomon({ patientId, taskId, patientName }: { patientId: string; taskId: string; patientName: string }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"form" | "confirm">("form");
  const [level, setLevel] = useState<Level>("urgent");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function close() {
    if (sending) return;
    setOpen(false);
    setPhase("form");
    setError(null);
  }

  async function send() {
    setSending(true);
    setError(null);
    try {
      await callApi("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: patientId, care_task_id: taskId, severity: level, reason: note.trim() }),
      });
      setSent(true);
      setOpen(false);
      setPhase("form");
      setNote("");
    } catch (err) {
      setError((err as Error).message);
      setPhase("form");
    } finally {
      setSending(false);
    }
  }

  const noteOk = note.trim().length >= 5;

  return (
    <>
      {sent && (
        <p role="status" className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          Shifokorga shoshilinch xabar yuborildi ✅ Javobni kuting yoki bemorni kuzatishda davom eting.
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          setSent(false);
          setOpen(true);
        }}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-red-500 bg-red-50 px-4 text-base font-extrabold text-red-700 shadow-sm transition hover:bg-red-100 active:scale-[0.99]"
      >
        <span aria-hidden="true">🚨</span> Holati yomon
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={close}
          onKeyDown={(e) => e.key === "Escape" && close()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="holati-title"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
          >
            {phase === "form" ? (
              <div className="space-y-4">
                <div>
                  <h2 id="holati-title" className="text-lg font-bold text-gray-900">Bemor holati yomon</h2>
                  <p className="text-sm text-gray-500">{patientName} — shifokorga darhol xabar yuboriladi.</p>
                </div>

                <fieldset>
                  <legend className="mb-2 text-sm font-semibold text-gray-700">Xavf darajasi</legend>
                  <div className="grid gap-2">
                    {LEVELS.map((l) => (
                      <label key={l.id} className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border-2 px-3 py-3 ${level === l.id ? l.tone : "border-gray-200 bg-white text-gray-700"}`}>
                        <input type="radio" name="severity" className="mt-1 h-4 w-4 accent-red-600" checked={level === l.id} onChange={() => setLevel(l.id)} />
                        <span>
                          <span className="block text-sm font-bold">{l.label}</span>
                          <span className="block text-xs opacity-80">{l.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="block text-sm font-semibold text-gray-700">
                  Qisqa izoh
                  <textarea
                    autoFocus
                    rows={4}
                    maxLength={1000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Nima yomonlashdi? (masalan: harorat 39.5, nafas qisilishi)"
                    className={`${INPUT} mt-1.5`}
                  />
                </label>

                {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}

                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={close} className="min-h-12 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    Bekor qilish
                  </button>
                  <button
                    type="button"
                    disabled={!noteOk}
                    onClick={() => setPhase("confirm")}
                    className="min-h-12 rounded-xl bg-red-600 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Davom etish
                  </button>
                </div>
                {!noteOk && <p className="text-center text-xs text-gray-500">Izoh kamida 5 belgidan iborat boʻlsin.</p>}
              </div>
            ) : (
              <div className="space-y-4">
                <h2 id="holati-title" className="text-lg font-bold text-gray-900">Shifokorga xabar yuborilsinmi?</h2>
                <p className="rounded-xl bg-red-50 px-3 py-3 text-sm text-red-800">
                  <strong>{level === "critical" ? "KRITIK" : "SHOSHILINCH"}</strong> · {patientName}
                  <span className="mt-1 block text-red-700">{note.trim()}</span>
                </p>
                <p className="text-sm text-gray-600">Shifokorga push bildirishnoma va Telegram xabari joʻnatiladi. Buni bekor qilib boʻlmaydi.</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={sending} onClick={() => setPhase("form")} className="min-h-12 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                    Orqaga
                  </button>
                  <button type="button" disabled={sending} onClick={() => void send()} className="min-h-12 rounded-xl bg-red-600 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">
                    {sending ? "Yuborilmoqda..." : "Ha, yuborish"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
