"use client";

import { useEffect, useState, useCallback } from "react";
import TopBar from "@/components/TopBar";
import type { CareTask } from "@/types/db";

const STATUS_LABEL: Record<string, string> = {
  new: "Yangi",
  accepted: "Qabul qilindi",
  confirmed: "Tasdiqlandi",
  overdue: "Kechikdi",
  escalated: "Eskalatsia",
  reassigned: "Qayta tayinlandi",
  reopened: "Qayta ochildi",
};
const STATUS_COLOR: Record<string, string> = {
  new: "bg-blue-100 text-blue-700",
  accepted: "bg-teal-100 text-teal-700",
  confirmed: "bg-green-100 text-green-700",
  overdue: "bg-orange-100 text-orange-700",
  escalated: "bg-red-100 text-red-700",
  reassigned: "bg-purple-100 text-purple-700",
  reopened: "bg-yellow-100 text-yellow-700",
};

export default function FamilyPage() {
  const [tasks, setTasks] = useState<CareTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CareTask | null>(null);
  const [otp, setOtp] = useState("");
  const [otpStatus, setOtpStatus] = useState<"idle" | "sending" | "verifying" | "done" | "error">("idle");
  const [otpMsg, setOtpMsg] = useState("");
  const [notes, setNotes] = useState("");
  const [transitioning, setTransitioning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/care-tasks");
    if (res.ok) setTasks(await res.json());
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function requestOtp(task: CareTask) {
    setOtpStatus("sending");
    setOtpMsg("");
    const res = await fetch("/api/otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patient_id: task.patient_id, care_task_id: task.id }),
    });
    const j = await res.json();
    if (res.ok) {
      setOtpMsg(
        j.sent_via_telegram
          ? "OTP kod bemorning Telegram ilovasiga yuborildi."
          : `Demo OTP: ${j.otp ?? "—"}`,
      );
      setOtpStatus("idle");
    } else {
      setOtpMsg(j.error ?? "Xatolik");
      setOtpStatus("error");
    }
  }

  async function verifyOtp(task: CareTask) {
    if (!otp.trim()) return;
    setOtpStatus("verifying");
    const res = await fetch("/api/otp", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patient_id: task.patient_id, otp_code: otp }),
    });
    const j = await res.json();
    if (j.ok) {
      setOtpStatus("done");
      setOtpMsg("OTP tasdiqlandi! Endi tashrifni yakunlang.");
    } else {
      setOtpStatus("error");
      setOtpMsg(j.error ?? "Kod notoʻgʻri");
    }
  }

  async function confirmVisit(task: CareTask) {
    setTransitioning(true);
    await fetch(`/api/care-tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "confirmed", visit_notes: notes }),
    });
    setTransitioning(false);
    setSelected(null);
    setOtp("");
    setOtpStatus("idle");
    setOtpMsg("");
    setNotes("");
    load();
  }

  async function transitionStatus(task: CareTask, status: string) {
    setTransitioning(true);
    await fetch(`/api/care-tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setTransitioning(false);
    load();
  }

  const activeTasks = tasks.filter((t) => t.status !== "confirmed");
  const doneTasks = tasks.filter((t) => t.status === "confirmed");

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <TopBar />
        <div className="flex flex-1 items-center justify-center text-gray-400">Yuklanmoqda...</div>
      </div>
    );
  }

  if (selected) {
    const ai = (selected as CareTask & { discharges?: { ai_summaries?: { brief_uz?: string; checklist_uz?: string[] } } })
      .discharges?.ai_summaries;
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <TopBar />
        <div className="mx-auto w-full max-w-2xl p-4">
          <button
            onClick={() => { setSelected(null); setOtp(""); setOtpStatus("idle"); setOtpMsg(""); }}
            className="mb-4 text-sm text-teal-600 hover:underline"
          >
            ← Orqaga
          </button>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-3">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLOR[selected.status]}`}>
                {STATUS_LABEL[selected.status]}
              </span>
              <span className="text-xs text-gray-400">
                SLA: {new Date(selected.sla_deadline).toLocaleString("uz-UZ")}
              </span>
            </div>

            <h2 className="mb-1 text-lg font-bold text-gray-800">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(selected as any).patients?.full_name ?? "—"}
            </h2>
            <p className="mb-4 text-sm text-gray-500">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(selected as any).patients?.tuman} · {(selected as any).patients?.village} · {(selected as any).patients?.diagnosis}
            </p>

            {ai?.brief_uz && (
              <div className="mb-4 rounded-xl bg-teal-50 p-4">
                <p className="mb-1 text-xs font-semibold uppercase text-teal-600">AI Qisqa xulosa</p>
                <p className="text-sm text-gray-700">{ai.brief_uz}</p>
              </div>
            )}

            {ai?.checklist_uz && ai.checklist_uz.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Tashrif tekshiruv roʻyxati</p>
                <ul className="space-y-1">
                  {ai.checklist_uz.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="mt-0.5 text-teal-500">✓</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* OTP verification section */}
            {selected.status !== "confirmed" && (
              <div className="mb-4 rounded-xl border border-gray-200 p-4">
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Tashrifni tasdiqlash (OTP)</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => requestOtp(selected)}
                    disabled={otpStatus === "sending"}
                    className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                  >
                    {otpStatus === "sending" ? "Yuborilmoqda..." : "OTP yuborish"}
                  </button>
                  <input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="6 xonali kod"
                    maxLength={6}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-teal-400"
                  />
                  <button
                    onClick={() => verifyOtp(selected)}
                    disabled={otpStatus === "verifying" || otpStatus === "done"}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Tekshirish
                  </button>
                </div>
                {otpMsg && (
                  <p className={`mt-2 text-xs ${otpStatus === "done" ? "text-green-600" : "text-gray-600"}`}>
                    {otpMsg}
                  </p>
                )}
              </div>
            )}

            {/* Notes */}
            {selected.status !== "confirmed" && (
              <div className="mb-4">
                <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Tashrif izohi</p>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Tashrif paytida kuzatilgan holat..."
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-400"
                />
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {selected.status === "new" && (
                <button
                  onClick={() => transitionStatus(selected, "accepted")}
                  disabled={transitioning}
                  className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  Qabul qilish
                </button>
              )}
              {(selected.status === "accepted" || otpStatus === "done") && (
                <button
                  onClick={() => confirmVisit(selected)}
                  disabled={transitioning || (otpStatus !== "done" && otpStatus !== "idle")}
                  className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  Tashrifni yakunlash
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <TopBar />
      <div className="mx-auto w-full max-w-2xl p-4">
        <h1 className="mb-4 text-xl font-bold text-gray-800">Tashrif vazifalari</h1>

        {activeTasks.length === 0 && doneTasks.length === 0 && (
          <div className="rounded-2xl bg-white p-8 text-center text-gray-400 shadow-sm">
            Hozircha vazifalar yoʻq
          </div>
        )}

        {activeTasks.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">Faol vazifalar ({activeTasks.length})</h2>
            <div className="space-y-3">
              {activeTasks.map((task) => {
                const isOverdue = new Date(task.sla_deadline) < new Date();
                return (
                  <button
                    key={task.id}
                    onClick={() => setSelected(task)}
                    className="w-full rounded-2xl bg-white p-4 text-left shadow-sm transition hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-800">
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {(task as any).patients?.full_name ?? "—"}
                        </p>
                        <p className="text-sm text-gray-500">
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {(task as any).patients?.tuman} · {(task as any).patients?.diagnosis}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[task.status]}`}>
                          {STATUS_LABEL[task.status]}
                        </span>
                        <span className={`text-xs ${isOverdue ? "text-red-500 font-semibold" : "text-gray-400"}`}>
                          {isOverdue ? "⚠️ Kechikdi" : new Date(task.sla_deadline).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {doneTasks.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">Yakunlangan ({doneTasks.length})</h2>
            <div className="space-y-2">
              {doneTasks.slice(0, 5).map((task) => (
                <div key={task.id} className="rounded-2xl bg-white/60 p-3 shadow-sm">
                  <p className="text-sm font-medium text-gray-600">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(task as any).patients?.full_name ?? "—"}
                  </p>
                  <p className="text-xs text-gray-400">
                    {task.confirmed_at ? new Date(task.confirmed_at).toLocaleString("uz-UZ") : "—"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
