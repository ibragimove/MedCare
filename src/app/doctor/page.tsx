"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TopBar from "@/components/TopBar";
import DoctorSidebar from "@/components/doctor/DoctorSidebar";
import NotificationPanel from "@/components/doctor/NotificationPanel";
import type { Alert, Nurse, Patient, Discharge, AiSummary } from "@/types/db";

const emptyForm = {
  fullName: "",
  tuman: "",
  village: "",
  diagnosis: "",
  drugName: "",
  dosage: "",
  expectedDays: "",
  nurseId: "",
};

const emptyNurseForm = {
  fullName: "",
  tuman: "",
  village: "",
};

function statusBadge(patient: Patient) {
  if (patient.last_status === null || patient.last_match_percent === null) {
    return { label: "Kutilmoqda", pct: null, dot: "bg-slate-400", card: "border-gray-200", badge: "bg-slate-100 text-slate-600" };
  }
  const pct = patient.last_match_percent;
  if (pct >= 90)
    return { label: "Yaxshi", pct, dot: "bg-emerald-500", card: "border-emerald-200 bg-emerald-50/30", badge: "bg-emerald-100 text-emerald-700" };
  if (pct >= 70)
    return { label: "Kuzatuvda", pct, dot: "bg-amber-500", card: "border-amber-200 bg-amber-50/30", badge: "bg-amber-100 text-amber-700" };
  return { label: "Xavfli", pct, dot: "bg-red-500 animate-pulse", card: "border-red-200 bg-red-50/30", badge: "bg-red-100 text-red-700" };
}

export default function DoctorPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [loading, setLoading] = useState(true);
  const [doctorName, setDoctorName] = useState("Shifokor");
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [nurseForm, setNurseForm] = useState(emptyNurseForm);
  const [showNurseForm, setShowNurseForm] = useState(false);
  const [nurseSubmitting, setNurseSubmitting] = useState(false);
  const [nurseFormError, setNurseFormError] = useState<string | null>(null);
  const [sendingReminderFor, setSendingReminderFor] = useState<string | null>(null);
  const [reminderNotice, setReminderNotice] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("dashboard");
  const [showNotifications, setShowNotifications] = useState(false);
  const [reassigningFor, setReassigningFor] = useState<string | null>(null);
  const [reassignSaving, setReassignSaving] = useState<string | null>(null);

  // Epicrisis / discharge form
  const [, setEpicrisisPatientId] = useState<string | null>(null);
  const [epicrisisText, setEpicrisisText] = useState("");
  const [epicrisisSeverity, setEpicrisisSeverity] = useState<"routine" | "urgent" | "critical">("routine");
  const [epicrisisSubmitting, setEpicrisisSubmitting] = useState(false);
  const [epicrisisResult, setEpicrisisResult] = useState<{ discharge: Discharge; task: { id: string } } | null>(null);
  const [showEpicrisisFor, setShowEpicrisisFor] = useState<string | null>(null);
  const [patientAiSummary, setPatientAiSummary] = useState<(AiSummary & { discharge_id: string }) | null>(null);

  // Section refs for scroll-into-view
  const alertsRef = useRef<HTMLElement>(null);
  const patientsRef = useRef<HTMLElement>(null);

  const loadData = useCallback(async () => {
    const [{ data: patientsData }, { data: alertsData }] = await Promise.all([
      supabase
        .from("patients")
        .select("*, nurses(id, full_name, tuman, village)")
        .is("completed_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("alerts")
        .select("*, patients(full_name, tuman, village)")
        .eq("resolved", false)
        .order("created_at", { ascending: false }),
    ]);
    setPatients((patientsData as Patient[]) ?? []);
    setAlerts((alertsData as Alert[]) ?? []);
    setLoading(false);
  }, [supabase]);

  const loadNurses = useCallback(async () => {
    try {
      const res = await fetch("/api/nurses");
      const data = await res.json();
      setNurses((data.nurses as Nurse[]) ?? []);
    } catch {
      // best-effort — nurse dropdowns just stay empty
    }
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setDoctorName((data.user?.user_metadata?.full_name as string | undefined) ?? "Shifokor");
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    loadNurses();
  }, [supabase, loadNurses]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    loadData();
    const channel = supabase
      .channel("doctor-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "patients" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "checkins" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, loadData]);

  function handleSectionChange(section: string) {
    setActiveSection(section);
    if (section === "alerts") {
      alertsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (section === "patients") {
      patientsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          expectedDays: Number(form.expectedDays),
          nurseId: form.nurseId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Xatolik yuz berdi");
      setForm(emptyForm);
      setShowForm(false);
      loadData();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNurseSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNurseSubmitting(true);
    setNurseFormError(null);
    try {
      const res = await fetch("/api/nurses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nurseForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Xatolik yuz berdi");
      setNurseForm(emptyNurseForm);
      setShowNurseForm(false);
      loadNurses();
    } catch (err) {
      setNurseFormError((err as Error).message);
    } finally {
      setNurseSubmitting(false);
    }
  }

  async function assignNurse(patientId: string, nurseId: string) {
    if (!nurseId) return;
    setReassignSaving(patientId);
    try {
      const res = await fetch(`/api/patients/${patientId}/assign-nurse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nurseId }),
      });
      if (res.ok) {
        setReassigningFor(null);
        loadData();
      }
    } finally {
      setReassignSaving(null);
    }
  }

  async function resolveAlert(id: string) {
    await fetch(`/api/alerts/${id}/resolve`, { method: "POST" });
    loadData();
  }

  async function completeTreatment(patientId: string) {
    if (!confirm("Bu davolanishni yakunlangan deb belgilaysizmi?")) return;
    await fetch(`/api/patients/${patientId}/complete`, { method: "POST" });
    loadData();
  }

  async function sendReminder(patientId: string) {
    setSendingReminderFor(patientId);
    setReminderNotice(null);
    try {
      const res = await fetch("/api/telegram/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Xatolik yuz berdi");
      setReminderNotice("Telegram orqali eslatma yuborildi ✅");
    } catch (err) {
      setReminderNotice(`Xatolik: ${(err as Error).message}`);
    } finally {
      setSendingReminderFor(null);
    }
  }

  async function handleEpicrisisSubmit(patientId: string) {
    if (!epicrisisText.trim()) return;
    setEpicrisisSubmitting(true);
    try {
      const res = await fetch("/api/discharges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          epicrisis_raw: epicrisisText,
          severity: epicrisisSeverity,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Xatolik");
      setEpicrisisResult(data);
      setShowEpicrisisFor(null);
      setEpicrisisText("");
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setEpicrisisSubmitting(false);
    }
  }

  async function loadPatientAiSummary(patientId: string) {
    const res = await fetch(`/api/discharges?patient_id=${patientId}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.length > 0 && data[0].ai_summaries) {
      setPatientAiSummary({ ...data[0].ai_summaries, discharge_id: data[0].id });
    }
  }

  const tumanTrim = form.tuman.trim().toLowerCase();
  const villageTrim = form.village.trim().toLowerCase();
  const districtNurses = tumanTrim ? nurses.filter((n) => n.tuman.trim().toLowerCase() === tumanTrim) : [];
  const exactVillageMatch = villageTrim
    ? districtNurses.find((n) => n.village.trim().toLowerCase() === villageTrim)
    : undefined;
  const autoMatchedNurse: Nurse | null = exactVillageMatch ?? districtNurses[0] ?? null;
  const isExactMatch = Boolean(exactVillageMatch);
  const knownTumans = [...new Set(nurses.map((n) => n.tuman))];

  const onTrackCount = patients.filter((p) => p.last_match_percent !== null && p.last_match_percent >= 70).length;
  const avgScore =
    patients.length
      ? Math.round(
          patients
            .filter((p) => p.last_match_percent !== null)
            .reduce((s, p) => s + (p.last_match_percent ?? 0), 0) /
            Math.max(1, patients.filter((p) => p.last_match_percent !== null).length),
        )
      : null;

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Top bar — notification bell wired up */}
      <div className="relative z-50 shrink-0">
        <TopBar
          notificationCount={alerts.length}
          onNotificationClick={() => setShowNotifications((s) => !s)}
        />
        {/* Notification dropdown anchored to topbar right */}
        {showNotifications && (
          <div className="absolute right-4 top-full">
            <NotificationPanel
              alerts={alerts}
              onResolve={async (id) => { await resolveAlert(id); }}
              onClose={() => setShowNotifications(false)}
            />
          </div>
        )}
      </div>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <DoctorSidebar
          doctorName={doctorName}
          patientCount={patients.length}
          alertCount={alerts.length}
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
          onLogout={handleLogout}
        />

        {/* Main scrollable area */}
        <main className="flex-1 overflow-y-auto px-5 py-6">
          {/* Page header */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Shifokor Paneli</h1>
              <p className="text-sm text-gray-500">Statsionardan chiqarilgan bemorlar monitoringi</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setShowNurseForm((s) => !s); setShowForm(false); }}
                className="rounded-xl border border-teal-200 bg-white px-4 py-2.5 text-sm font-semibold text-teal-700 shadow-sm transition hover:bg-teal-50"
              >
                {showNurseForm ? "✕ Bekor" : "+ Hamshira qoʻshish"}
              </button>
              <button
                onClick={() => { setShowForm((s) => !s); setShowNurseForm(false); }}
                className="rounded-xl bg-gradient-to-r from-teal-600 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-teal-700 hover:to-cyan-600"
              >
                {showForm ? "✕ Bekor" : "+ Yangi bemor"}
              </button>
            </div>
          </div>

          {/* Stats */}
          {!loading && (
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Jami bemorlar", value: patients.length, color: "text-gray-800" },
                { label: "Ogohlantirishlar", value: alerts.length, color: alerts.length > 0 ? "text-red-600" : "text-gray-800" },
                { label: "Yaxshi holat", value: onTrackCount, color: "text-emerald-600" },
                { label: "Oʻrt. ball", value: avgScore !== null ? `${avgScore}%` : "—", color: "text-teal-600" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium text-gray-500">{stat.label}</p>
                  <p className={`mt-1 text-3xl font-bold ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Add-nurse form */}
          {showNurseForm && (
            <form
              onSubmit={handleNurseSubmit}
              className="mb-5 rounded-2xl border border-teal-100 bg-white p-6 shadow-md"
            >
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-500 text-sm text-white">
                  👩‍⚕️
                </div>
                <h2 className="text-base font-bold text-gray-800">Yangi hamshira qoʻshish</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
                  Hamshira ismi
                  <input
                    required
                    className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"
                    value={nurseForm.fullName}
                    onChange={(e) => setNurseForm({ ...nurseForm, fullName: e.target.value })}
                    placeholder="Masalan: Gulnora Yusupova"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
                  Tumani
                  <input
                    required
                    list="tuman-options"
                    className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"
                    value={nurseForm.tuman}
                    onChange={(e) => setNurseForm({ ...nurseForm, tuman: e.target.value })}
                    placeholder="Masalan: Xazorasp"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
                  Mahalla yoki qishlogʻi
                  <input
                    required
                    className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"
                    value={nurseForm.village}
                    onChange={(e) => setNurseForm({ ...nurseForm, village: e.target.value })}
                    placeholder="Masalan: Guliston MFY"
                  />
                </label>
              </div>
              {nurseFormError && <p className="mt-3 text-sm text-red-600">{nurseFormError}</p>}
              <button
                type="submit"
                disabled={nurseSubmitting}
                className="mt-5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-500 px-6 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-60"
              >
                {nurseSubmitting ? "Saqlanmoqda..." : "Hamshirani saqlash →"}
              </button>
            </form>
          )}

          {/* Discharge form */}
          {showForm && (
            <form
              onSubmit={handleSubmit}
              className="mb-5 rounded-2xl border border-teal-100 bg-white p-6 shadow-md"
            >
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-500 text-sm text-white">
                  🏥
                </div>
                <h2 className="text-base font-bold text-gray-800">Bemorni chiqarish</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { key: "fullName", label: "Bemor F.I.Sh.", placeholder: "" },
                  { key: "diagnosis", label: "Tashxis", placeholder: "Masalan: Qandli diabet" },
                  { key: "drugName", label: "Dori nomi", placeholder: "" },
                  { key: "dosage", label: "Dozasi", placeholder: "500 mg, kuniga 2 mahal" },
                ].map(({ key, label, placeholder }) => (
                  <label key={key} className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
                    {label}
                    <input
                      required
                      className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"
                      value={form[key as keyof typeof form]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      placeholder={placeholder}
                    />
                  </label>
                ))}
                <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
                  Davolanish muddati (kun)
                  <input
                    required
                    type="number"
                    min={1}
                    className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"
                    value={form.expectedDays}
                    onChange={(e) => setForm({ ...form, expectedDays: e.target.value })}
                  />
                </label>

                {/* Tuman + mahalla/qishloq + nurse routing */}
                <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
                  Tumani
                  <input
                    required
                    list="tuman-options"
                    className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"
                    value={form.tuman}
                    onChange={(e) => setForm({ ...form, tuman: e.target.value, nurseId: "" })}
                    placeholder="Masalan: Xazorasp"
                  />
                  <datalist id="tuman-options">
                    {knownTumans.map((t) => <option key={t} value={t} />)}
                  </datalist>
                </label>

                <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
                  Mahalla yoki qishlogʻi
                  <input
                    required
                    className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"
                    value={form.village}
                    onChange={(e) => setForm({ ...form, village: e.target.value, nurseId: "" })}
                    placeholder="Masalan: Guliston MFY"
                  />
                </label>

                <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
                  Hamshira
                  <select
                    className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"
                    value={form.nurseId}
                    onChange={(e) => setForm({ ...form, nurseId: e.target.value })}
                  >
                    <option value="">
                      {autoMatchedNurse ? "Avtomatik (eng yaqin hamshira)" : "Avtomatik — mos hamshira topilmadi"}
                    </option>
                    {nurses.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.full_name} — {n.tuman}, {n.village}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Live routing hint */}
              {form.tuman.trim() && !form.nurseId && (
                autoMatchedNurse ? (
                  <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                    {isExactMatch ? "✓ Eng yaqin hamshira topildi:" : "✓ Tumandagi hamshiraga biriktiriladi:"}{" "}
                    <span className="font-semibold">{autoMatchedNurse.full_name}</span> ({autoMatchedNurse.tuman}, {autoMatchedNurse.village})
                  </p>
                ) : (
                  <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                    ⚠️ &quot;{form.tuman}&quot; tumanida hamshira topilmadi — yuqoridan qoʻlda tanlang, &quot;+ Hamshira qoʻshish&quot; orqali yangisini qoʻshing, yoki keyinroq biriktiring.
                  </p>
                )
              )}
              {form.nurseId && (
                <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-teal-50 px-3 py-2 text-xs font-medium text-teal-700">
                  ✓ Qoʻlda tanlandi: <span className="font-semibold">{nurses.find((n) => n.id === form.nurseId)?.full_name}</span>
                </p>
              )}

              {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="mt-5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-500 px-6 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-60"
              >
                {submitting ? "⏳ AI trayektoriya yaratilmoqda..." : "Chiqarish va hamshiraga biriktirish →"}
              </button>
            </form>
          )}

          {/* Alerts section */}
          {alerts.length > 0 && (
            <section ref={alertsRef} className="mb-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-red-700">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-sm">⚠️</span>
                Faol ogohlantirishlar
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">{alerts.length}</span>
              </h2>
              <div className="space-y-2">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-4 shadow-sm"
                  >
                    <div>
                      <p className="font-semibold text-red-900">
                        {alert.patients?.full_name} — {alert.patients?.village}
                      </p>
                      <p className="text-sm text-red-700">{alert.reason}</p>
                    </div>
                    <button
                      onClick={() => resolveAlert(alert.id)}
                      className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50"
                    >
                      ✓ Yopish
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Patients section */}
          <section ref={patientsRef}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-gray-800">
                Bemorlar
                <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs text-teal-700">{patients.length}</span>
              </h2>
              {reminderNotice && <p className="text-sm text-gray-600">{reminderNotice}</p>}
            </div>

            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-gray-100" />)}
              </div>
            ) : patients.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-gray-200 p-10 text-center">
                <p className="text-4xl">🏥</p>
                <p className="mt-2 font-medium text-gray-600">Hozircha bemorlar yoʻq</p>
                <p className="text-sm text-gray-400">+ Yangi bemor tugmasini bosing</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {patients.map((patient) => {
                  const s = statusBadge(patient);
                  return (
                    <div
                      key={patient.id}
                      className={`rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md ${s.card}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3">
                          <div className="relative mt-0.5">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 text-base font-bold text-white shadow-sm">
                              {patient.full_name.charAt(0)}
                            </div>
                            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${s.dot}`} />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800">{patient.full_name}</p>
                            <p className="text-xs text-gray-500">
                              {patient.tuman}, {patient.village} · {patient.diagnosis}
                            </p>
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${s.badge}`}>
                          {s.label}
                          {s.pct !== null ? ` · ${s.pct}%` : ""}
                        </span>
                      </div>

                      {s.pct !== null && (
                        <div className="mt-3">
                          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className={`h-full rounded-full ${s.pct >= 90 ? "bg-emerald-500" : s.pct >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                              style={{ width: `${s.pct}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {patient.nurses ? (
                        <p className="mt-2 text-xs text-gray-500">
                          👩‍⚕️ {patient.nurses.full_name} · {patient.nurses.tuman}, {patient.nurses.village}
                        </p>
                      ) : reassigningFor === patient.id ? (
                        <div className="mt-2 flex items-center gap-1.5">
                          <select
                            autoFocus
                            className="flex-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs outline-none focus:border-amber-400"
                            disabled={reassignSaving === patient.id}
                            defaultValue=""
                            onChange={(e) => assignNurse(patient.id, e.target.value)}
                          >
                            <option value="" disabled>Hamshira tanlang...</option>
                            {nurses.map((n) => (
                              <option key={n.id} value={n.id}>{n.full_name} — {n.tuman}, {n.village}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => setReassigningFor(null)}
                            className="shrink-0 text-xs text-gray-400 hover:text-gray-600"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setReassigningFor(patient.id)}
                          className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700"
                        >
                          ⚠️ Biriktirilmagan — hamshira tanlash uchun bosing
                        </button>
                      )}

                      {patient.expected_trajectory && (
                        <p className="mt-2 line-clamp-2 text-xs text-gray-600">{patient.expected_trajectory}</p>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          onClick={() => sendReminder(patient.id)}
                          disabled={sendingReminderFor === patient.id}
                          className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60"
                        >
                          {sendingReminderFor === patient.id ? "Yuborilmoqda..." : "📨 Eslatma"}
                        </button>
                        <button
                          onClick={() => {
                            setShowEpicrisisFor(showEpicrisisFor === patient.id ? null : patient.id);
                            setEpicrisisPatientId(patient.id);
                            setEpicrisisResult(null);
                            setPatientAiSummary(null);
                            loadPatientAiSummary(patient.id);
                          }}
                          className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 transition hover:bg-teal-100"
                        >
                          📋 Epikriz
                        </button>
                        <button
                          onClick={() => completeTreatment(patient.id)}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
                        >
                          ✅ Yakunlash
                        </button>
                      </div>

                      {/* Epicrisis form for this patient */}
                      {showEpicrisisFor === patient.id && (
                        <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-4">
                          <p className="mb-2 text-xs font-semibold uppercase text-teal-700">Epikriz yuborish</p>
                          {epicrisisResult?.task && (
                            <p className="mb-2 rounded-lg bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-700">
                              ✅ Epikriz yuborildi! Vazifa ID: {epicrisisResult.task.id.slice(0, 8)}...
                            </p>
                          )}
                          {patientAiSummary?.brief_uz && (
                            <div className="mb-3 rounded-lg bg-white p-3">
                              <p className="mb-1 text-xs font-semibold text-teal-600">AI xulosa (oxirgi):</p>
                              <p className="text-xs text-gray-700">{patientAiSummary.brief_uz}</p>
                              {patientAiSummary.risk_score !== null && (
                                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  (patientAiSummary.risk_score ?? 0) >= 80 ? "bg-red-100 text-red-700"
                                  : (patientAiSummary.risk_score ?? 0) >= 50 ? "bg-orange-100 text-orange-700"
                                  : "bg-green-100 text-green-700"
                                }`}>
                                  Xavf bali: {patientAiSummary.risk_score}/100
                                </span>
                              )}
                            </div>
                          )}
                          <textarea
                            rows={4}
                            value={epicrisisText}
                            onChange={(e) => setEpicrisisText(e.target.value)}
                            placeholder="Kasallik tarixi matni (epikriz)..."
                            className="mb-2 w-full rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-400"
                          />
                          <div className="mb-2 flex gap-2">
                            {(["routine", "urgent", "critical"] as const).map((sev) => (
                              <button
                                key={sev}
                                onClick={() => setEpicrisisSeverity(sev)}
                                className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                                  epicrisisSeverity === sev
                                    ? sev === "critical" ? "bg-red-500 text-white"
                                      : sev === "urgent" ? "bg-orange-500 text-white"
                                      : "bg-teal-600 text-white"
                                    : "bg-white text-gray-600 border border-gray-200"
                                }`}
                              >
                                {sev === "routine" ? "Oddiy" : sev === "urgent" ? "Shoshilinch" : "Kritik"}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={() => handleEpicrisisSubmit(patient.id)}
                            disabled={epicrisisSubmitting || !epicrisisText.trim()}
                            className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                          >
                            {epicrisisSubmitting ? "Yuborilmoqda..." : "Epikrizni yuborish →"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
