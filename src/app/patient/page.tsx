"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import TopBar from "@/components/TopBar";
import ChatWidget from "@/components/patient/ChatWidget";
import { hapticTap, scheduleDoseReminders } from "@/lib/native";
import type { DoseLog, Patient } from "@/types/db";

const WEEKDAYS = ["Yak", "Dush", "Sesh", "Chor", "Pay", "Jum", "Shan"];
const ADMIN_PHONE = process.env.NEXT_PUBLIC_ADMIN_PHONE;
const DOCTOR_PHONE_FALLBACK = process.env.NEXT_PUBLIC_DOCTOR_PHONE;

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function statusInfo(matchPercent: number | null, status: string | null) {
  if (status === null || matchPercent === null) {
    return { label: "Kutilmoqda", score: null, ring: "stroke-slate-300", bg: "from-slate-400 to-slate-500", text: "text-slate-600" };
  }
  if (matchPercent >= 90) {
    return { label: "Yaxshi holat", score: matchPercent, ring: "stroke-emerald-500", bg: "from-emerald-500 to-teal-500", text: "text-emerald-700" };
  }
  if (matchPercent >= 70) {
    return { label: "Kuzatuvda", score: matchPercent, ring: "stroke-amber-500", bg: "from-amber-500 to-orange-500", text: "text-amber-700" };
  }
  return { label: "Shifokorga murojaat", score: matchPercent, ring: "stroke-red-500", bg: "from-red-500 to-rose-600", text: "text-red-700" };
}

function ScoreRing({ pct }: { pct: number | null }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const filled = pct !== null ? (pct / 100) * circ : 0;
  return (
    <svg width="96" height="96" viewBox="0 0 96 96">
      <circle cx="48" cy="48" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
      <circle
        cx="48" cy="48" r={r} fill="none" strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circ}`}
        strokeDashoffset={circ / 4}
        className={pct === null ? "stroke-slate-300" : pct >= 90 ? "stroke-emerald-500" : pct >= 70 ? "stroke-amber-500" : "stroke-red-500"}
        style={{ transition: "stroke-dasharray 0.8s ease" }}
      />
      <text x="48" y="52" textAnchor="middle" className="text-xs font-bold" fill="#1f2937" fontSize="18" fontWeight="700">
        {pct !== null ? `${pct}%` : "—"}
      </text>
    </svg>
  );
}

export default function PatientPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Patient | null>(null);
  const [completed, setCompleted] = useState<Patient[]>([]);
  const [doseLogs, setDoseLogs] = useState<DoseLog[]>([]);
  const [doctorPhone, setDoctorPhone] = useState<string | null>(null);
  const [callbackNote, setCallbackNote] = useState("");
  const [callbackSending, setCallbackSending] = useState(false);
  const [callbackSent, setCallbackSent] = useState(false);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"doses" | "schedule" | "chat">("doses");
  const [activeOtp, setActiveOtp] = useState<{ otp: string; expires_at: string } | null>(null);

  async function loadOtp() {
    try {
      const res = await fetch("/api/otp");
      if (res.ok) {
        const j = await res.json();
        if (j.active && j.otp) {
          setActiveOtp({ otp: j.otp, expires_at: j.expires_at });
        } else {
          setActiveOtp(null);
        }
      }
    } catch {
      // ignore
    }
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: activeData } = await supabase
      .from("patients")
      .select("*, nurses(full_name, village)")
      .eq("profile_id", user.id)
      .is("completed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: completedData } = await supabase
      .from("patients")
      .select("*")
      .eq("profile_id", user.id)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false });

    setActive((activeData as Patient) ?? null);
    setCompleted((completedData as Patient[]) ?? []);

    if (activeData) {
      const { data: logs } = await supabase.from("dose_logs").select("*").eq("patient_id", activeData.id);
      setDoseLogs((logs as DoseLog[]) ?? []);
      // In the Android app, schedule on-device alarms for each dose time.
      if ((activeData as Patient).medication_plan) {
        scheduleDoseReminders((activeData as Patient).medication_plan!.items);
      }
    }

    const { data: doctorProfile } = await supabase
      .from("profiles").select("phone").eq("role", "doctor").limit(1).maybeSingle();
    setDoctorPhone(doctorProfile?.phone ?? DOCTOR_PHONE_FALLBACK ?? null);
    setLoading(false);
    loadOtp();
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    load();
    const interval = setInterval(loadOtp, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleDose(drug: string, date: string, time: string) {
    if (!active) return;
    const key = `${drug}-${date}-${time}`;
    setTogglingKey(key);
    hapticTap();
    try {
      const res = await fetch("/api/dose-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: active.id, drug, scheduledDate: date, scheduledTime: time }),
      });
      if (res.ok) {
        const { data: logs } = await supabase.from("dose_logs").select("*").eq("patient_id", active.id);
        setDoseLogs((logs as DoseLog[]) ?? []);
      }
    } finally {
      setTogglingKey(null);
    }
  }

  async function sendCallbackRequest() {
    if (!active) return;
    setCallbackSending(true);
    try {
      const res = await fetch("/api/callback-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: active.id, note: callbackNote || undefined }),
      });
      if (res.ok) { setCallbackSent(true); setCallbackNote(""); }
    } finally {
      setCallbackSending(false);
    }
  }

  if (loading) {
    return (
      <>
        <TopBar />
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-16">
          <div className="flex gap-1">
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-teal-400 [animation-delay:0ms]" />
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-teal-400 [animation-delay:150ms]" />
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-teal-400 [animation-delay:300ms]" />
          </div>
        </main>
      </>
    );
  }

  const now = new Date();
  const today = ymd(now);
  const dischargeDate = active ? new Date(active.discharge_date) : null;
  const dayOfTreatment = dischargeDate
    ? Math.min(active!.expected_days, Math.max(1, Math.floor((now.getTime() - dischargeDate.getTime()) / 86400000) + 1))
    : 0;
  const progressPct = active ? Math.round((dayOfTreatment / active.expected_days) * 100) : 0;
  const status = active ? statusInfo(active.last_match_percent, active.last_status) : null;

  const todayDoses = active?.medication_plan
    ? active.medication_plan.items
        .flatMap((item) =>
          item.times.map((time) => ({ drug: item.drug, dosage: item.dosage, time, withFood: item.withFood, instructions: item.instructions })),
        )
        .sort((a, b) => a.time.localeCompare(b.time))
    : [];

  const nowHHMM = now.toTimeString().slice(0, 5);
  const takenTodayCount = todayDoses.filter((d) =>
    doseLogs.some((l) => l.drug === d.drug && l.scheduled_date === today && l.scheduled_time === d.time && l.taken_at),
  ).length;

  const next7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5 space-y-4">

        {!active ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
            <p className="text-4xl">🏥</p>
            <p className="mt-2 font-medium text-gray-600">Hozircha faol davolanish yoʻq</p>
          </div>
        ) : (
          <>
            {/* Active OTP Card */}
            {activeOtp && (
              <section className="overflow-hidden rounded-3xl border-2 border-teal-500 bg-gradient-to-br from-teal-50 via-white to-emerald-50 p-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-cyan-500 text-xl text-white shadow-sm">
                      🔑
                    </span>
                    <div>
                      <h2 className="text-sm font-bold uppercase tracking-wide text-teal-900">
                        Tashrif tasdiqlash kodi
                      </h2>
                      <p className="text-xs text-teal-700">Hamshira kelganda ushbu kodni ayting</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 animate-pulse">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Faol
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-center gap-2 py-1">
                  {activeOtp.otp.split("").map((digit, i) => (
                    <span
                      key={i}
                      className="flex h-14 w-12 items-center justify-center rounded-2xl border-2 border-teal-300 bg-white font-mono text-2xl font-black text-teal-900 shadow-md"
                    >
                      {digit}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-center text-xs text-teal-600">
                  Ushbu kod hamshira tashrifini tasdiqlash uchun 30 daqiqa amal qiladi
                </p>
              </section>
            )}

            {/* Hero card */}
            <section className="rounded-3xl bg-gradient-to-br from-teal-600 via-teal-500 to-cyan-500 p-5 text-white shadow-lg">
              <div className="flex items-center gap-4">
                <div className="shrink-0">
                  <div className="relative">
                    <ScoreRing pct={active.last_match_percent} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-teal-100">Joriy davolanish</p>
                  <h2 className="text-lg font-bold leading-tight">{active.diagnosis}</h2>
                  <p className="mt-0.5 text-sm text-teal-100">{active.drug_name} · {active.dosage}</p>
                  {status && (
                    <span className="mt-1.5 inline-block rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold backdrop-blur-sm">
                      {status.label}
                    </span>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-teal-100">
                  <span>{dayOfTreatment}-kun</span>
                  <span>{active.expected_days} kunlik kurs</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-white/80 transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-teal-200">
                  <span>Chiqarilgan: {active.discharge_date}</span>
                  <span>{progressPct}% tugallangan</span>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-xs text-teal-100">
                <span>👩‍⚕️</span>
                <span>Hamshira: {active.nurses?.full_name ?? "biriktirilmagan"}</span>
              </div>
            </section>

            {/* Tabs */}
            {active.medication_plan && (
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="flex border-b border-gray-100">
                  {([
                    { key: "doses", label: `💊 Bugun (${takenTodayCount}/${todayDoses.length})` },
                    { key: "schedule", label: "📅 Jadval" },
                    { key: "chat", label: "🤖 AI Chat" },
                  ] as const).map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`flex-1 py-3 text-xs font-semibold transition ${
                        activeTab === tab.key
                          ? "border-b-2 border-teal-500 text-teal-700 bg-teal-50/50"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="p-4">
                  {/* Doses tab */}
                  {activeTab === "doses" && (
                    <div className="space-y-2">
                      {todayDoses.length === 0 ? (
                        <p className="py-4 text-center text-sm text-gray-400">Bugun uchun dori rejalashtirilmagan</p>
                      ) : (
                        todayDoses.map((dose) => {
                          const taken = doseLogs.some(
                            (l) => l.drug === dose.drug && l.scheduled_date === today && l.scheduled_time === dose.time && l.taken_at,
                          );
                          const isPast = dose.time < nowHHMM;
                          const key = `${dose.drug}-${today}-${dose.time}`;
                          return (
                            <div
                              key={key}
                              className={`flex items-center gap-3 rounded-xl border p-3.5 ${
                                taken
                                  ? "border-emerald-200 bg-emerald-50"
                                  : isPast
                                    ? "border-amber-200 bg-amber-50"
                                    : "border-gray-200 bg-white"
                              }`}
                            >
                              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${
                                taken ? "bg-emerald-100" : isPast ? "bg-amber-100" : "bg-gray-100"
                              }`}>
                                {taken ? "✅" : isPast ? "⏰" : "💊"}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800">
                                  {dose.time} — {dose.drug}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {dose.dosage} · {dose.withFood ? "Ovqat bilan" : "Ovqatdan qatʼi nazar"}
                                </p>
                                {!taken && isPast && (
                                  <p className="text-xs font-medium text-amber-700">Oʻtkazib yuborildi?</p>
                                )}
                              </div>
                              <button
                                onClick={() => toggleDose(dose.drug, today, dose.time)}
                                disabled={togglingKey === key}
                                className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50 ${
                                  taken
                                    ? "bg-emerald-600 text-white"
                                    : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                                }`}
                              >
                                {taken ? "Ichdim ✓" : "Ichdim"}
                              </button>
                            </div>
                          );
                        })
                      )}

                      {active.medication_plan?.generalAdvice && (
                        <div className="mt-2 rounded-xl bg-teal-50 p-3 text-xs text-teal-700">
                          💡 {active.medication_plan.generalAdvice}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Schedule tab */}
                  {activeTab === "schedule" && (
                    <div className="space-y-2">
                      {next7Days.map((d) => {
                        const dstr = ymd(d);
                        const isToday = dstr === today;
                        const dayItems = active.medication_plan!.items.filter((item) => {
                          const endDate = new Date(dischargeDate!);
                          endDate.setDate(endDate.getDate() + item.durationDays - 1);
                          return d >= dischargeDate! && d <= endDate;
                        });
                        return (
                          <div
                            key={dstr}
                            className={`rounded-xl border p-3 ${isToday ? "border-teal-300 bg-teal-50" : "border-gray-100 bg-white"}`}
                          >
                            <div className="flex items-center justify-between">
                              <p className={`text-xs font-semibold ${isToday ? "text-teal-700" : "text-gray-600"}`}>
                                {isToday ? "Bugun · " : ""}{WEEKDAYS[d.getDay()]}, {d.getDate().toString().padStart(2, "0")}.{(d.getMonth() + 1).toString().padStart(2, "0")}
                              </p>
                              {isToday && <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-bold text-white">BUGUN</span>}
                            </div>
                            {dayItems.length === 0 ? (
                              <p className="mt-1 text-xs text-gray-400">Dori yoʻq</p>
                            ) : (
                              dayItems.map((item) => (
                                <p key={item.drug} className="mt-1 text-xs text-gray-600">
                                  🕐 {item.times.join(", ")} — <span className="font-medium">{item.drug}</span>
                                </p>
                              ))
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Chat tab */}
                  {activeTab === "chat" && <ChatWidget />}
                </div>
              </div>
            )}

            {/* If no medication plan, show chat directly */}
            {!active.medication_plan && (
              <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <ChatWidget />
              </section>
            )}
          </>
        )}

        {/* Completed episodes */}
        {completed.length > 0 && (
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-bold text-gray-800">Tugallangan davolanishlar</h2>
            <div className="space-y-2">
              {completed.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-base">✅</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{p.diagnosis}</p>
                    <p className="text-xs text-gray-500">{p.drug_name} · {p.discharge_date} — {p.completed_at?.slice(0, 10)}</p>
                  </div>
                  {p.last_match_percent !== null && (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                      {p.last_match_percent}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Contact section */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-bold text-gray-800">Yordam va aloqa</h2>

          <div className="flex flex-wrap gap-2">
            {doctorPhone && (
              <a
                href={`tel:${doctorPhone}`}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
              >
                📞 Shifokorga qoʻngʻiroq
              </a>
            )}
            {ADMIN_PHONE && (
              <a
                href={`tel:${ADMIN_PHONE}`}
                className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                📞 Admin
              </a>
            )}
          </div>

          {active && (
            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Qayta qoʻngʻiroq soʻrash
              </label>
              <textarea
                value={callbackNote}
                onChange={(e) => setCallbackNote(e.target.value)}
                placeholder="Qisqa izoh (ixtiyoriy)"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"
                rows={2}
              />
              <button
                onClick={sendCallbackRequest}
                disabled={callbackSending || callbackSent}
                className="mt-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                {callbackSending ? "Yuborilmoqda..." : callbackSent ? "✅ Soʻrov yuborildi" : "Qoʻngʻiroq soʻrash"}
              </button>
              {callbackSent && (
                <p className="mt-2 text-sm text-emerald-600">Shifokor tez orada bogʻlanadi.</p>
              )}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
