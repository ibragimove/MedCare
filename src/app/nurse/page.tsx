"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TopBar from "@/components/TopBar";
import BackButton from "@/components/BackButton";
import {
  SEVERITY_LABEL,
  SEVERITY_STYLE,
  TASK_STATUS_LABEL,
  TASK_STATUS_STYLE,
  fmtDateTime,
  statusBadge,
} from "@/lib/patient-status";
import type { CareTask, Patient, Severity } from "@/types/db";

type NurseTab = "tasks" | "patients" | "profile";

interface ExtendedCareTask extends CareTask {
  patients?: {
    id: string;
    full_name: string;
    tuman: string;
    village: string;
    diagnosis: string;
    phone?: string | null;
  } | null;
  discharges?: {
    id: string;
    severity: Severity;
    epicrisis_raw?: string;
    ai_summaries?: {
      brief_uz?: string;
      checklist_uz?: string[];
      risk_score?: number;
      main_concerns?: string[];
      home_care_tasks?: string[];
    }[] | {
      brief_uz?: string;
      checklist_uz?: string[];
      risk_score?: number;
      main_concerns?: string[];
      home_care_tasks?: string[];
    } | null;
  } | null;
}

// SLA Countdown formatting
function formatSlaCountdown(deadlineIso: string, now: Date) {
  const diffMs = new Date(deadlineIso).getTime() - now.getTime();
  const isOverdue = diffMs <= 0;
  const absDiff = Math.abs(diffMs);
  const totalMins = Math.floor(absDiff / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;

  if (isOverdue) {
    if (hours > 0) return { text: `${hours} soat ${mins} daq kechikdi`, isOverdue: true };
    return { text: `${mins} daq kechikdi`, isOverdue: true };
  }
  if (hours > 0) return { text: `${hours} soat ${mins} daq qoldi`, isOverdue: false };
  return { text: `${mins} daq qoldi`, isOverdue: false };
}

export default function NursePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [activeTab, setActiveTab] = useState<NurseTab>("tasks");
  const [tasks, setTasks] = useState<ExtendedCareTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [selectedTask, setSelectedTask] = useState<ExtendedCareTask | null>(null);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientFilter, setPatientFilter] = useState<"active" | "all">("active");

  const [profile, setProfile] = useState<{
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    tuman: string;
    villages: string[];
    telegram_chat_id: string | null;
  } | null>(null);

  const [now, setNow] = useState<Date>(() => new Date());
  const [toastNotice, setToastNotice] = useState<string | null>(null);

  // Detail view state
  const [checklistTicks, setChecklistTicks] = useState<Record<string, boolean>>({});
  const [visitNotes, setVisitNotes] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSentMsg, setOtpSentMsg] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpCooldown, setOtpCooldown] = useState<number>(0);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [submittingVisit, setSubmittingVisit] = useState(false);
  const [visitSuccess, setVisitSuccess] = useState(false);

  // Worsening condition alert modal
  const [showConditionModal, setShowConditionModal] = useState(false);
  const [conditionSeverity, setConditionSeverity] = useState<"urgent" | "critical">("urgent");
  const [conditionNote, setConditionNote] = useState("");
  const [submittingAlert, setSubmittingAlert] = useState(false);
  const [alertSuccess, setAlertSuccess] = useState<string | null>(null);

  // Keep now updated every 30s for SLA countdowns
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Countdown timer for OTP resend cooldown
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const t = setInterval(() => setOtpCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [otpCooldown]);

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/care-tasks");
      if (res.ok) {
        const data = (await res.json()) as ExtendedCareTask[];
        setTasks(data ?? []);
      }
    } catch {
      // ignore network errors
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  const loadPatients = useCallback(async () => {
    try {
      const res = await fetch("/api/patients");
      if (res.ok) {
        const j = await res.json();
        setPatients(j.patients ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingPatients(false);
    }
  }, []);

  const loadProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [nurseRes, profRes, terrRes] = await Promise.all([
      supabase.from("nurses").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("nurse_territories").select("territories(village)").eq("nurse_id", user.id),
    ]);

    const nurse = nurseRes.data;
    const prof = profRes.data;
    const terrs = (terrRes.data ?? []) as unknown as { territories: { village: string } | null }[];
    const villages = terrs.map((t) => t.territories?.village).filter(Boolean) as string[];

    setProfile({
      id: user.id,
      full_name: (prof?.full_name || nurse?.full_name || user.user_metadata?.full_name || "Hamshira") as string,
      email: (nurse?.email || user.email || "") as string,
      phone: (prof?.phone || nurse?.phone || null) as string | null,
      tuman: (nurse?.tuman || "") as string,
      villages: villages.length > 0 ? villages : nurse?.village ? [nurse.village] : [],
      telegram_chat_id: (prof?.telegram_chat_id || null) as string | null,
    });
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTasks();
    loadPatients();
    loadProfile();

    // Auto-refresh tasks every 30 seconds
    const interval = setInterval(() => {
      loadTasks();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadTasks, loadPatients, loadProfile]);

  function showToast(msg: string) {
    setToastNotice(msg);
    setTimeout(() => setToastNotice(null), 4000);
  }

  // Accept task ("Qabul qildim")
  async function acceptTask(task: ExtendedCareTask, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: "accepted", accepted_at: new Date().toISOString() } : t)),
    );
    if (selectedTask?.id === task.id) {
      setSelectedTask((prev) => (prev ? { ...prev, status: "accepted", accepted_at: new Date().toISOString() } : null));
    }
    showToast("Vazifa qabul qilindi ✅");

    try {
      const res = await fetch(`/api/care-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "accepted" }),
      });
      if (!res.ok) {
        const j = await res.json();
        showToast(`Xatolik: ${j.error ?? "Qabul qilib boʻlmadi"}`);
        loadTasks();
      }
    } catch {
      loadTasks();
    }
  }

  // Open task detail
  function openTaskDetail(task: ExtendedCareTask) {
    setSelectedTask(task);
    setChecklistTicks({});
    setVisitNotes(task.visit_notes ?? "");
    setOtpCode("");
    setOtpSentMsg(null);
    setOtpError(null);
    setVisitSuccess(false);
    setAlertSuccess(null);
  }

  // Request OTP from patient
  async function handleRequestOtp() {
    if (!selectedTask) return;
    setSendingOtp(true);
    setOtpError(null);
    setOtpSentMsg(null);
    try {
      const res = await fetch("/api/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: selectedTask.patient_id,
          care_task_id: selectedTask.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "OTP yuborib boʻlmadi");

      setOtpCooldown(60);
      setOtpSentMsg(
        data.sent_via_telegram
          ? "KOD YUBORILDI: Bemorning Telegram ilovasi va portaliga 6 xonali kod joʻnatildi."
          : `KOD YUBORILDI: Bemor portalida kod paydo boʻldi.${data.otp ? ` (Demo: ${data.otp})` : ""}`,
      );
    } catch (err) {
      setOtpError((err as Error).message);
    } finally {
      setSendingOtp(false);
    }
  }

  // Confirm visit
  async function handleConfirmVisit() {
    if (!selectedTask) return;
    if (otpCode.trim().length !== 6) {
      setOtpError("6 xonali tasdiqlash kodini toʻliq kiriting");
      return;
    }

    setSubmittingVisit(true);
    setOtpError(null);

    const checkedItems = Object.entries(checklistTicks)
      .filter(([, v]) => v)
      .map(([k]) => k);

    try {
      const res = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          care_task_id: selectedTask.id,
          patient_id: selectedTask.patient_id,
          checklist_done: checkedItems,
          notes: visitNotes.trim() || undefined,
          otp_code: otpCode.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Tashrifni tasdiqlab boʻlmadi");

      setVisitSuccess(true);
      showToast("Tashrif muvaffaqiyatli tasdiqlandi! 🎉");
      loadTasks();
      loadPatients();
    } catch (err) {
      setOtpError((err as Error).message);
    } finally {
      setSubmittingVisit(false);
    }
  }

  // Submit deteriorating condition alert ("Holati yomon")
  async function handleReportCondition() {
    if (!selectedTask || !conditionNote.trim()) return;
    setSubmittingAlert(true);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: selectedTask.patient_id,
          reason: conditionNote.trim(),
          severity: conditionSeverity,
          care_task_id: selectedTask.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ogohlantirish yuborib boʻlmadi");

      setAlertSuccess("Shifokorga shoshilinch ogohlantirish yuborildi! 🚨");
      setShowConditionModal(false);
      setConditionNote("");
      showToast("Shifokorga xabarnoma joʻnatildi!");
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSubmittingAlert(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // Summary counts
  const newCount = tasks.filter((t) => t.status === "new").length;
  const inProgressCount = tasks.filter((t) => t.status === "accepted" || t.status === "reassigned").length;
  const overdueCount = tasks.filter(
    (t) => t.status === "overdue" || (t.status !== "confirmed" && new Date(t.sla_deadline) < now),
  ).length;

  // Urgency sorting: overdue → new → accepted → confirmed today
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const aOverdue = a.status === "overdue" || (a.status !== "confirmed" && new Date(a.sla_deadline) < now);
      const bOverdue = b.status === "overdue" || (b.status !== "confirmed" && new Date(b.sla_deadline) < now);
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;

      const priorityOrder: Record<string, number> = { new: 0, accepted: 1, reassigned: 2, reopened: 3, confirmed: 4 };
      const aRank = priorityOrder[a.status] ?? 99;
      const bRank = priorityOrder[b.status] ?? 99;
      if (aRank !== bRank) return aRank - bRank;

      return new Date(a.sla_deadline).getTime() - new Date(b.sla_deadline).getTime();
    });
  }, [tasks, now]);

  // Patients tab filtering
  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLocaleLowerCase("uz");
    return patients.filter((p) => {
      if (patientFilter === "active" && p.completed_at) return false;
      if (!q) return true;
      return (
        p.full_name.toLocaleLowerCase("uz").includes(q) ||
        p.diagnosis.toLocaleLowerCase("uz").includes(q) ||
        p.village.toLocaleLowerCase("uz").includes(q)
      );
    });
  }, [patients, patientSearch, patientFilter]);

  // Extract AI summary helper for detail view
  const aiSummary = useMemo(() => {
    if (!selectedTask?.discharges?.ai_summaries) return null;
    const summaries = selectedTask.discharges.ai_summaries;
    return Array.isArray(summaries) ? summaries[0] : summaries;
  }, [selectedTask]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 pb-20">
      <TopBar />

      {/* Toast banner */}
      {toastNotice && (
        <div className="fixed top-16 left-1/2 z-50 -translate-x-1/2 transform rounded-2xl bg-teal-900/90 px-4 py-2.5 text-sm font-semibold text-white shadow-xl backdrop-blur-sm transition-all animate-bounce">
          {toastNotice}
        </div>
      )}

      {/* Main Single Column Container (Mobile-first, max-w-2xl) */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4 sm:px-6">
        {selectedTask ? (
          /* ============================================================
             TASK DETAIL VIEW
             ============================================================ */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <BackButton onClick={() => setSelectedTask(null)} fallbackHref="/nurse" label="Vazifalar" />
              <Link
                href={`/nurse/patients/${selectedTask.patient_id}`}
                className="text-xs font-semibold text-teal-700 hover:underline"
              >
                Bemor profili →
              </Link>
            </div>

            {/* Patient overview header card */}
            <div className="rounded-3xl border border-teal-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${SEVERITY_STYLE[selectedTask.severity]}`}>
                    {SEVERITY_LABEL[selectedTask.severity]} xavf
                  </span>
                  <h1 className="mt-1.5 text-lg font-bold text-gray-900">
                    {selectedTask.patients?.full_name ?? "Bemor"}
                  </h1>
                  <p className="text-xs text-gray-500">
                    {selectedTask.patients?.tuman}, {selectedTask.patients?.village} · {selectedTask.patients?.diagnosis}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${TASK_STATUS_STYLE[selectedTask.status]}`}>
                  {TASK_STATUS_LABEL[selectedTask.status]}
                </span>
              </div>

              {/* SLA & Quick call strip */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs">
                {(() => {
                  const sla = formatSlaCountdown(selectedTask.sla_deadline, now);
                  return (
                    <span className={`font-semibold ${sla.isOverdue ? "text-red-600" : "text-teal-700"}`}>
                      SLA: {sla.text}
                    </span>
                  );
                })()}

                <div className="flex items-center gap-2">
                  {selectedTask.patients?.phone && (
                    <a
                      href={`tel:${selectedTask.patients.phone}`}
                      className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-teal-50 px-3 py-1 font-semibold text-teal-700 hover:bg-teal-100"
                    >
                      📞 Qoʻngʻiroq
                    </a>
                  )}
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(`${selectedTask.patients?.tuman ?? ""} ${selectedTask.patients?.village ?? ""}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-gray-200 px-3 py-1 font-semibold text-gray-600 hover:bg-gray-50"
                  >
                    📍 Xarita
                  </a>
                </div>
              </div>
            </div>

            {/* AI Summary card */}
            {aiSummary && (
              <div className="rounded-3xl border border-teal-100 bg-white p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-teal-900 flex items-center gap-1.5">
                    <span>✨</span> AI Qisqa tibbiy xulosa
                  </h2>
                  {aiSummary.risk_score !== undefined && aiSummary.risk_score !== null && (
                    <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-bold text-teal-800">
                      Xavf indeksi: {aiSummary.risk_score}%
                    </span>
                  )}
                </div>

                {aiSummary.brief_uz && (
                  <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-line rounded-2xl bg-teal-50/60 p-3.5 border border-teal-100/50">
                    {aiSummary.brief_uz}
                  </p>
                )}

                {aiSummary.main_concerns && aiSummary.main_concerns.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-gray-700 mb-1">⚠️ Asosiy xavflar:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-xs text-gray-600 pl-1">
                      {aiSummary.main_concerns.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {aiSummary.home_care_tasks && aiSummary.home_care_tasks.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-gray-700 mb-1">🏠 Uyda parvarish choralari:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-xs text-gray-600 pl-1">
                      {aiSummary.home_care_tasks.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Checklist card */}
            <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                <span>📋</span> Tashrifda bajariladigan tekshiruvlar
              </h2>
              <p className="text-xs text-gray-500 mb-3">
                Bemor huzuriga borganingizda belgilangan amallarni bajaring va belgilang:
              </p>

              {(() => {
                const items =
                  aiSummary?.checklist_uz && aiSummary.checklist_uz.length > 0
                    ? aiSummary.checklist_uz
                    : [
                        "Bemorning umumiy holatini va shikoyatlarini baholash",
                        "Arterial qon bosimi va pulsni oʻlchash",
                        "Tana haroratini tekshirish",
                        "Belgilangan dorilar qabul qilinayotganini tekshirish",
                        "Xavfli alomatlar yoʻqligiga ishonch hosil qilish",
                      ];
                return (
                  <div className="space-y-2">
                    {items.map((item, idx) => {
                      const checked = Boolean(checklistTicks[item]);
                      return (
                        <label
                          key={idx}
                          className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border p-3 text-sm transition ${
                            checked
                              ? "border-teal-300 bg-teal-50/60 text-teal-900 font-medium"
                              : "border-gray-100 bg-gray-50/50 text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded accent-teal-600"
                            checked={checked}
                            onChange={(e) => setChecklistTicks((prev) => ({ ...prev, [item]: e.target.checked }))}
                          />
                          <span className="flex-1 leading-snug">{item}</span>
                        </label>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Visit notes */}
            <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <label className="block text-sm font-bold text-gray-900 mb-1.5">
                📝 Tashrif izohi va kuzatuvlar
              </label>
              <textarea
                rows={3}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-3 text-sm outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"
                placeholder="Bemorning ahvoli, oʻlchangan koʻrsatkichlar yoki tavsiyalar..."
                value={visitNotes}
                onChange={(e) => setVisitNotes(e.target.value)}
              />
            </div>

            {/* OTP & Visit Confirmation Section */}
            {selectedTask.status !== "confirmed" && !visitSuccess && (
              <div className="rounded-3xl border-2 border-teal-500 bg-gradient-to-br from-teal-50/80 via-white to-emerald-50/60 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-teal-950 flex items-center gap-2">
                      <span>🔑</span> Tashrifni tasdiqlash (OTP)
                    </h2>
                    <p className="text-xs text-teal-700">
                      Haqiqiy tashrifni isbotlash uchun bemordan 6 xonali kodni soʻrang
                    </p>
                  </div>
                  <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-bold text-teal-800">
                    SLA yopiladi
                  </span>
                </div>

                {/* Step 1: Request OTP */}
                <div className="rounded-2xl border border-teal-200/80 bg-white p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase text-gray-500">1-qadam: Kod yuborish</p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        Kod bemorning Telegramiga yoki ilova portaliga avtomatik chiqadi
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={sendingOtp || otpCooldown > 0}
                      onClick={handleRequestOtp}
                      className="min-h-11 shrink-0 rounded-xl bg-teal-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
                    >
                      {sendingOtp ? "Yuborilmoqda..." : otpCooldown > 0 ? `Qayta yuborish (${otpCooldown}s)` : "OTP kodni soʻrash"}
                    </button>
                  </div>

                  {otpSentMsg && (
                    <div className="mt-3 rounded-xl bg-emerald-50 p-2.5 text-xs font-medium text-emerald-800 border border-emerald-200">
                      {otpSentMsg}
                    </div>
                  )}
                </div>

                {/* Step 2: Enter 6-digit OTP */}
                <div className="rounded-2xl border border-teal-200/80 bg-white p-4 space-y-3">
                  <p className="text-xs font-bold uppercase text-gray-500">2-qadam: Bemor aytgan kodni kiriting</p>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 text-center font-mono text-2xl font-bold tracking-widest text-teal-950 outline-none transition focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-100"
                  />

                  {otpError && (
                    <p className="rounded-xl bg-red-50 p-2.5 text-xs font-medium text-red-600 border border-red-200">
                      {otpError}
                    </p>
                  )}

                  <button
                    type="button"
                    disabled={submittingVisit || otpCode.length !== 6}
                    onClick={handleConfirmVisit}
                    className="w-full min-h-12 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 py-3 text-sm font-bold text-white shadow-md hover:from-emerald-700 hover:to-teal-700 disabled:opacity-40"
                  >
                    {submittingVisit ? "Tasdiqlanmoqda..." : "✓ Tashrifni tasdiqlash va SLA ni yopish"}
                  </button>
                </div>
              </div>
            )}

            {visitSuccess && (
              <div className="rounded-3xl border-2 border-emerald-500 bg-emerald-50 p-6 text-center shadow-sm">
                <p className="text-3xl mb-1">🎉</p>
                <h3 className="text-base font-bold text-emerald-900">Tashrif muvaffaqiyatli yakunlandi!</h3>
                <p className="text-xs text-emerald-700 mt-1">
                  OTP tasdiqlandi, SLA qondirildi va hisobot tizimda yangilandi.
                </p>
                <button
                  onClick={() => setSelectedTask(null)}
                  className="mt-4 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
                >
                  Vazifalar roʻyxatiga qaytish
                </button>
              </div>
            )}

            {/* Actions: "Holati yomon" & "Kunlik tekshiruv" */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConditionModal(true)}
                className="min-h-11 rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-2.5 text-xs font-bold text-red-700 hover:bg-red-100 transition"
              >
                ⚠️ Bemor holati yomon (Shifokorga xabar)
              </button>

              <Link
                href={`/nurse/${selectedTask.patient_id}`}
                className="min-h-11 inline-flex items-center justify-center rounded-2xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs font-bold text-teal-800 hover:bg-teal-100 transition"
              >
                📊 Kunlik tekshiruv anketasi →
              </Link>
            </div>

            {alertSuccess && (
              <div className="rounded-2xl border border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-800">
                {alertSuccess}
              </div>
            )}

            {/* Condition modal */}
            {showConditionModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
                <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-red-700 flex items-center gap-1.5">
                      <span>⚠️</span> Shifokorga ogohlantirish yuborish
                    </h3>
                    <button
                      onClick={() => setShowConditionModal(false)}
                      className="rounded-lg p-1 text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </div>

                  <p className="text-xs text-gray-600">
                    Bemorning holati yomonlashgan boʻlsa, shifokorga darhol Telegram va bildirishnoma joʻnatiladi.
                  </p>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Xavf darajasi</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setConditionSeverity("urgent")}
                        className={`rounded-xl border p-2.5 text-xs font-bold ${
                          conditionSeverity === "urgent"
                            ? "border-orange-500 bg-orange-50 text-orange-800"
                            : "border-gray-200 text-gray-600"
                        }`}
                      >
                        Shoshilinch (Urgent)
                      </button>
                      <button
                        type="button"
                        onClick={() => setConditionSeverity("critical")}
                        className={`rounded-xl border p-2.5 text-xs font-bold ${
                          conditionSeverity === "critical"
                            ? "border-red-600 bg-red-50 text-red-800"
                            : "border-gray-200 text-gray-600"
                        }`}
                      >
                        Kritik (103 talab)
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Bemor holati haqida qisqacha</label>
                    <textarea
                      rows={3}
                      required
                      placeholder="Simptomlar, hushdan ketish, yuqori harorat, nafas qisishi..."
                      className="w-full rounded-xl border border-gray-200 p-3 text-xs outline-none focus:border-red-400"
                      value={conditionNote}
                      onChange={(e) => setConditionNote(e.target.value)}
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowConditionModal(false)}
                      className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600"
                    >
                      Bekor qilish
                    </button>
                    <button
                      type="button"
                      disabled={submittingAlert || !conditionNote.trim()}
                      onClick={handleReportCondition}
                      className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-red-700 disabled:opacity-50"
                    >
                      {submittingAlert ? "Yuborilmoqda..." : "Shifokorga yuborish 🚨"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === "tasks" ? (
          /* ============================================================
             TAB 1: VAZIFALAR (TASKS)
             ============================================================ */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Vazifalar</h1>
                <p className="text-xs text-gray-500">Aktiv patronaj va bemorlarni koʻrish rejasi</p>
              </div>
              <button
                onClick={() => loadTasks()}
                className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 shadow-xs hover:bg-gray-50"
              >
                Yangilash 🔄
              </button>
            </div>

            {/* Summary metrics strip */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3 text-center">
                <p className="text-xl font-black text-blue-700">{newCount}</p>
                <p className="text-[11px] font-semibold text-blue-600">Yangi</p>
              </div>
              <div className="rounded-2xl border border-teal-100 bg-teal-50/60 p-3 text-center">
                <p className="text-xl font-black text-teal-700">{inProgressCount}</p>
                <p className="text-[11px] font-semibold text-teal-600">Jarayonda</p>
              </div>
              <div className="rounded-2xl border border-red-100 bg-red-50/60 p-3 text-center">
                <p className="text-xl font-black text-red-700">{overdueCount}</p>
                <p className="text-[11px] font-semibold text-red-600">Kechikkan</p>
              </div>
            </div>

            {/* Tasks list */}
            {loadingTasks ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-28 animate-pulse rounded-3xl bg-gray-100" />
                ))}
              </div>
            ) : sortedTasks.length === 0 ? (
              <div className="rounded-3xl border-2 border-dashed border-gray-200 p-12 text-center">
                <p className="text-4xl">🩺</p>
                <h3 className="mt-2 text-sm font-bold text-gray-700">Hozircha vazifa yoʻq</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Yangi bemorlar chiqarilganda bu yerda avtomatik koʻrinadi.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedTasks.map((task) => {
                  const sla = formatSlaCountdown(task.sla_deadline, now);
                  const isNew = task.status === "new";
                  const isConfirmed = task.status === "confirmed";

                  return (
                    <div
                      key={task.id}
                      onClick={() => openTaskDetail(task)}
                      className={`group relative cursor-pointer rounded-3xl border bg-white p-4 shadow-sm transition hover:shadow-md ${
                        sla.isOverdue && !isConfirmed
                          ? "border-red-300 bg-red-50/20"
                          : isNew
                            ? "border-blue-200"
                            : "border-gray-100"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${SEVERITY_STYLE[task.severity]}`}>
                              {SEVERITY_LABEL[task.severity]}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${TASK_STATUS_STYLE[task.status]}`}>
                              {TASK_STATUS_LABEL[task.status]}
                            </span>
                          </div>

                          <h3 className="mt-1.5 truncate text-base font-bold text-gray-900 group-hover:text-teal-700 transition">
                            {task.patients?.full_name ?? "Bemor"}
                          </h3>
                          <p className="truncate text-xs text-gray-500">
                            {task.patients?.tuman}, {task.patients?.village} · {task.patients?.diagnosis}
                          </p>
                        </div>

                        {/* Live SLA countdown badge */}
                        <div className="text-right shrink-0">
                          {isConfirmed ? (
                            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                              ✓ Bajarildi
                            </span>
                          ) : (
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                sla.isOverdue
                                  ? "bg-red-100 text-red-700 animate-pulse"
                                  : "bg-teal-50 text-teal-800"
                              }`}
                            >
                              {sla.text}
                            </span>
                          )}
                          <p className="mt-1 text-[10px] text-gray-400">
                            {fmtDateTime(task.sla_deadline)}
                          </p>
                        </div>
                      </div>

                      {/* Card bottom quick actions */}
                      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-gray-50 pt-2.5">
                        <div className="flex items-center gap-2">
                          {task.patients?.phone && (
                            <a
                              href={`tel:${task.patients.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                            >
                              📞 Qoʻngʻiroq
                            </a>
                          )}
                          <a
                            href={`https://maps.google.com/?q=${encodeURIComponent(`${task.patients?.tuman ?? ""} ${task.patients?.village ?? ""}`)}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                          >
                            📍 Xarita
                          </a>
                        </div>

                        {isNew && (
                          <button
                            type="button"
                            onClick={(e) => acceptTask(task, e)}
                            className="min-h-9 rounded-xl bg-teal-600 px-3 py-1 text-xs font-bold text-white shadow-sm hover:bg-teal-700 transition active:scale-95"
                          >
                            Qabul qildim ✓
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : activeTab === "patients" ? (
          /* ============================================================
             TAB 2: BEMORLARIM (MY PATIENTS)
             ============================================================ */
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Bemorlarim</h1>
              <p className="text-xs text-gray-500">Menga biriktirilgan bemorlar roʻyxati</p>
            </div>

            {/* Search & filters */}
            <div className="space-y-2">
              <input
                type="search"
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                placeholder="Ism, tashxis yoki mahalla qidirish..."
                className="w-full min-h-11 rounded-2xl border border-gray-200 bg-white px-4 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPatientFilter("active")}
                  className={`min-h-9 rounded-xl px-3 text-xs font-bold transition ${
                    patientFilter === "active" ? "bg-teal-600 text-white" : "bg-white border border-gray-200 text-gray-600"
                  }`}
                >
                  Faol bemorlar
                </button>
                <button
                  type="button"
                  onClick={() => setPatientFilter("all")}
                  className={`min-h-9 rounded-xl px-3 text-xs font-bold transition ${
                    patientFilter === "all" ? "bg-teal-600 text-white" : "bg-white border border-gray-200 text-gray-600"
                  }`}
                >
                  Barchasi ({patients.length})
                </button>
              </div>
            </div>

            {loadingPatients ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-3xl bg-gray-100" />
                ))}
              </div>
            ) : filteredPatients.length === 0 ? (
              <div className="rounded-3xl border-2 border-dashed border-gray-200 p-12 text-center">
                <p className="text-4xl">👥</p>
                <h3 className="mt-2 text-sm font-bold text-gray-700">Bemor topilmadi</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Qidiruv soʻrovini oʻzgartiring yoki filterni tekshiring.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPatients.map((p) => {
                  const badge = statusBadge(p);
                  return (
                    <div
                      key={p.id}
                      className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/nurse/patients/${p.id}`}
                            className="text-base font-bold text-gray-900 hover:text-teal-700"
                          >
                            {p.full_name}
                          </Link>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {p.tuman}, {p.village} · {p.diagnosis}
                          </p>
                          <p className="text-xs text-teal-800 font-medium mt-0.5">
                            💊 {p.drug_name} ({p.dosage})
                          </p>
                        </div>

                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${badge.badge}`}>
                          {badge.label}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-2.5">
                        <Link
                          href={`/nurse/${p.id}`}
                          className="min-h-9 inline-flex items-center rounded-xl bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700 hover:bg-teal-100"
                        >
                          Check-in anketasi →
                        </Link>
                        <Link
                          href={`/nurse/patients/${p.id}`}
                          className="text-xs font-semibold text-gray-500 hover:text-gray-800"
                        >
                          Batafsil maʼlumot
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* ============================================================
             TAB 3: PROFIL (PROFILE)
             ============================================================ */
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Mening profilim</h1>
              <p className="text-xs text-gray-500">Hamshira maʼlumotlari va bildirishnomalar holati</p>
            </div>

            <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-500 text-2xl font-bold text-white shadow-sm">
                  {profile?.full_name?.charAt(0) ?? "H"}
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">{profile?.full_name}</h2>
                  <p className="text-xs text-gray-500">{profile?.email}</p>
                  {profile?.phone && <p className="text-xs text-teal-700 font-medium">{profile.phone}</p>}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-bold uppercase text-gray-500 mb-1">Xizmat hududi</p>
                <p className="text-sm font-semibold text-gray-800">
                  {profile?.tuman || "Tuman koʻrsatilmagan"}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(profile?.villages ?? []).map((v, i) => (
                    <span key={i} className="rounded-xl bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                      {v}
                    </span>
                  ))}
                </div>
              </div>

              {/* Telegram status */}
              <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <span>📱</span> Telegram bildirishnomalar
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      profile?.telegram_chat_id ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {profile?.telegram_chat_id ? "Ulangan ✓" : "Ulanmagan"}
                  </span>
                </div>
                <p className="text-xs text-blue-800 leading-relaxed">
                  Vazifalar va shoshilinch xabarlarni Telegram orqali olish uchun botga kiring:
                  <span className="font-semibold block mt-0.5">@MedCareBot ga /start yuboring</span>
                </p>
              </div>

              {/* Push status */}
              <div className="rounded-2xl border border-teal-100 bg-teal-50/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                    <span>🔔</span> Mobil ilova bildirishnomalari (FCM)
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    Faol
                  </span>
                </div>
                <p className="text-xs text-teal-800 mt-1">
                  Android ilovasida yangi bemorlar va eslatmalar avtomatik ekranga chiqadi.
                </p>
              </div>

              {/* Logout button */}
              <button
                type="button"
                onClick={handleLogout}
                className="w-full min-h-11 rounded-2xl border border-red-200 bg-red-50 py-2.5 text-sm font-bold text-red-700 hover:bg-red-100 transition"
              >
                Tizimdan chiqish
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ============================================================
         BOTTOM TAB BAR (Mobile-First 3 tabs)
         ============================================================ */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-around px-2">
          <button
            type="button"
            onClick={() => {
              setSelectedTask(null);
              setActiveTab("tasks");
            }}
            className={`flex flex-1 flex-col items-center justify-center py-1 transition ${
              activeTab === "tasks" && !selectedTask ? "text-teal-700 font-bold" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <div className="relative">
              <span className="text-xl">🩺</span>
              {newCount > 0 && (
                <span className="absolute -right-2.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {newCount}
                </span>
              )}
            </div>
            <span className="text-[11px] mt-0.5">Vazifalar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedTask(null);
              setActiveTab("patients");
            }}
            className={`flex flex-1 flex-col items-center justify-center py-1 transition ${
              activeTab === "patients" ? "text-teal-700 font-bold" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <span className="text-xl">👥</span>
            <span className="text-[11px] mt-0.5">Bemorlarim</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedTask(null);
              setActiveTab("profile");
            }}
            className={`flex flex-1 flex-col items-center justify-center py-1 transition ${
              activeTab === "profile" ? "text-teal-700 font-bold" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <span className="text-xl">👤</span>
            <span className="text-[11px] mt-0.5">Profil</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
