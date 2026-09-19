"use client";

import { useCallback, useEffect, useState } from "react";
import BackButton from "@/components/BackButton";
import { formatUzPhone } from "@/lib/phone";
import { fmtDate, statusBadge, treatmentDay } from "@/lib/patient-status";
import type { NurseSummary } from "@/types/db";
import type { PatientDetailData } from "@/types/patient-detail";
import { AlertsSection, ContactSection, TasksSection } from "./ActivitySection";
import EpicrisisSection from "./EpicrisisSection";
import MedicationsSection from "./MedicationsSection";
import MonitoringSection from "./MonitoringSection";
import { BTN_GHOST, BTN_PRIMARY, Card, Field, INPUT, Pill } from "./ui";

interface Props {
  patientId: string;
  /** Where "Orqaga" goes when there is no in-app history (deep link / refresh). */
  backHref: string;
}

type TabId = "overview" | "treatment" | "meds" | "monitoring" | "epicrisis" | "tasks" | "alerts" | "contact";

export default function PatientDetail({ patientId, backHref }: Props) {
  const [data, setData] = useState<PatientDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("overview");
  const [nurses, setNurses] = useState<NurseSummary[]>([]);
  const [editingContact, setEditingContact] = useState(false);
  const [contact, setContact] = useState({ phone: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/patients/${patientId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Bemor maʼlumotlarini yuklab boʻlmadi");
      setData(json as PatientDetailData);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    load();
  }, [load]);

  const isDoctor = data?.role === "doctor";

  useEffect(() => {
    if (!isDoctor) return;
    fetch("/api/nurses")
      .then((r) => r.json())
      .then((j) => setNurses((j.nurses as NurseSummary[]) ?? []))
      .catch(() => undefined);
  }, [isDoctor]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-3 px-4 py-5" aria-busy="true">
        <div className="h-11 w-32 animate-pulse rounded-xl bg-gray-200" />
        <div className="h-28 animate-pulse rounded-2xl bg-gray-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-5">
        <BackButton fallbackHref={backHref} />
        <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-semibold text-red-800">{error ?? "Bemor topilmadi"}</p>
          <button type="button" className={`${BTN_GHOST} mt-3`} onClick={() => { setLoading(true); load(); }}>
            Qayta urinish
          </button>
        </div>
      </div>
    );
  }

  const { patient, nurse } = data;
  const s = statusBadge(patient);
  const progress = treatmentDay(patient.discharge_date, patient.expected_days);
  const done = Boolean(patient.completed_at);
  const activeAlerts = data.alerts.filter((a) => !a.resolved).length;

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "overview", label: "Umumiy" },
    { id: "treatment", label: "Tashxis va davolash" },
    { id: "meds", label: "Dorilar", count: data.medications ? data.medications.filter((m) => !m.stopped_at).length : 1 },
    { id: "monitoring", label: "Kuzatuv", count: data.checkins.length },
    { id: "epicrisis", label: "Epikriz va AI xulosa", count: data.discharges.length },
    { id: "tasks", label: "Tashriflar va vazifalar", count: data.tasks.length },
    { id: "alerts", label: "Ogohlantirishlar", count: activeAlerts },
    { id: "contact", label: "Bemor bilan aloqa", count: data.callbacks.length },
  ];

  async function completeTreatment() {
    if (!confirm("Bu davolanishni yakunlangan deb belgilaysizmi?")) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/patients/${patient.id}/complete`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Xatolik yuz berdi");
      await load();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function assignNurse(nurseId: string) {
    if (!nurseId) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/patients/${patient.id}/assign-nurse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nurseId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Xatolik yuz berdi");
      await load();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveContact(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/patients/${patient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_contact",
          phone: contact.phone.replace(/\D/g, "").length > 3 ? contact.phone : null,
          address: contact.address,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Xatolik yuz berdi");
      setEditingContact(false);
      await load();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-5">
      <BackButton fallbackHref={backHref} />

      {/* Header */}
      <div className={`mt-4 rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${s.card}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 text-lg font-bold text-white shadow-sm">
                {patient.full_name.charAt(0)}
              </div>
              <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${s.dot}`} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">{patient.full_name}</h1>
              <p className="text-sm text-gray-500">
                {patient.diagnosis} · {patient.tuman}, {patient.village}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Pill className={s.badge}>
              {s.label}
              {s.pct !== null ? ` · ${s.pct}%` : ""}
            </Pill>
            {done && <Pill className="bg-slate-100 text-slate-600">Yakunlangan</Pill>}
            {activeAlerts > 0 && <Pill className="bg-red-100 text-red-700">⚠️ {activeAlerts} ogohlantirish</Pill>}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              Davolanish: {Math.min(progress.day, progress.total)}-kun / {progress.total} kun
            </span>
            <span>{progress.pct}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-teal-500" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>

        {isDoctor && !done && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={completeTreatment} className={BTN_GHOST}>
              ✅ Yakunlash
            </button>
          </div>
        )}
        {actionError && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {actionError}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="-mx-4 mt-4 overflow-x-auto px-4" role="tablist" aria-label="Bemor boʻlimlari">
        <div className="flex min-w-max gap-1.5 pb-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-10 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition ${
                tab === t.id ? "bg-teal-600 text-white shadow-sm" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
              }`}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${
                    tab === t.id ? "bg-white/25 text-white" : t.id === "alerts" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-4" role="tabpanel">
        {tab === "overview" && (
          <>
            <Card
              title="Shaxsiy maʼlumotlar"
              action={
                isDoctor && !editingContact ? (
                  <button
                    type="button"
                    className="min-h-9 rounded-lg px-2 text-xs font-semibold text-teal-700 hover:bg-teal-50"
                    onClick={() => {
                      setContact({ phone: patient.phone ?? "", address: patient.address ?? "" });
                      setEditingContact(true);
                    }}
                  >
                    ✎ Tahrirlash
                  </button>
                ) : undefined
              }
            >
              {editingContact ? (
                <form onSubmit={saveContact} className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                    Telefon
                    <input
                      type="tel"
                      inputMode="tel"
                      className={INPUT}
                      value={contact.phone}
                      onChange={(e) => setContact({ ...contact, phone: formatUzPhone(e.target.value) })}
                      placeholder="+998 90 123 45 67"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                    Manzil
                    <input className={INPUT} value={contact.address} onChange={(e) => setContact({ ...contact, address: e.target.value })} />
                  </label>
                  <div className="flex gap-2 sm:col-span-2">
                    <button type="submit" disabled={busy} className={BTN_PRIMARY}>
                      {busy ? "Saqlanmoqda..." : "Saqlash"}
                    </button>
                    <button type="button" className={BTN_GHOST} onClick={() => setEditingContact(false)}>
                      Bekor qilish
                    </button>
                  </div>
                </form>
              ) : (
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  <Field label="F.I.Sh.">{patient.full_name}</Field>
                  <Field label="Tugʻilgan sana">{patient.birth_date ? fmtDate(patient.birth_date) : "—"}</Field>
                  <Field label="PINFL">{patient.pinfl_last4 ? `••••••••••${patient.pinfl_last4}` : "—"}</Field>
                  <Field label="Telefon">
                    {patient.phone ? (
                      <a className="text-teal-700 underline" href={`tel:${patient.phone}`}>
                        {patient.phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </Field>
                  <Field label="Hudud">
                    {patient.tuman}, {patient.village}
                  </Field>
                  <Field label="Manzil">{patient.address || "—"}</Field>
                  <Field label="Shaxsiy kabinet">{patient.has_account ? "Faol" : "Ulanmagan"}</Field>
                </dl>
              )}
            </Card>

            <Card title="Davolanish">
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Field label="Chiqarilgan sana">{fmtDate(patient.discharge_date)}</Field>
                <Field label="Muddat">{patient.expected_days} kun</Field>
                <Field label="Tashxis">{patient.diagnosis}</Field>
                <Field label="Dorilar">
                  {patient.drug_name || "—"}
                  {patient.dosage ? ` (${patient.dosage})` : ""}
                </Field>
              </dl>
            </Card>

            <Card
              title="Biriktirilgan hamshira"
              action={
                nurse?.phone ? (
                  <a href={`tel:${nurse.phone}`} className="text-xs font-semibold text-teal-700 underline">
                    📞 {nurse.phone}
                  </a>
                ) : undefined
              }
            >
              {nurse ? (
                <p className="text-sm text-gray-800">
                  👩‍⚕️ <span className="font-semibold">{nurse.full_name}</span>
                  <span className="text-gray-500">
                    {" "}
                    · {nurse.tuman}, {nurse.village}
                  </span>
                </p>
              ) : (
                <p className="text-sm font-medium text-amber-700">⚠️ Hamshira biriktirilmagan</p>
              )}
              {isDoctor && !done && (
                <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-gray-600">
                  {nurse ? "Boshqa hamshiraga oʻtkazish" : "Hamshira tanlash"}
                  <select
                    className={INPUT}
                    disabled={busy}
                    value=""
                    onChange={(e) => assignNurse(e.target.value)}
                  >
                    <option value="">Tanlang...</option>
                    {nurses
                      .filter((n) => n.is_active && n.id !== nurse?.id)
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.full_name} — {n.tuman}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </Card>
          </>
        )}

        {tab === "treatment" && (
          <>
            <Card title="Tashxis">
              <p className="text-sm text-gray-800">{patient.diagnosis}</p>
            </Card>
            <Card title="Kutilgan trayektoriya">
              {patient.expected_trajectory ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{patient.expected_trajectory}</p>
              ) : (
                <p className="text-sm text-gray-500">AI trayektoriya hali yaratilmagan.</p>
              )}
            </Card>
            {patient.medication_plan?.generalAdvice && (
              <Card title="Umumiy tavsiyalar">
                <p className="text-sm text-gray-700">{patient.medication_plan.generalAdvice}</p>
              </Card>
            )}
          </>
        )}

        {tab === "meds" && <MedicationsSection data={data} canEdit={isDoctor} onChanged={load} />}
        {tab === "monitoring" && <MonitoringSection checkins={data.checkins} />}
        {tab === "epicrisis" && <EpicrisisSection data={data} canSubmit={isDoctor && !done} onChanged={load} />}
        {tab === "tasks" && <TasksSection data={data} />}
        {tab === "alerts" && <AlertsSection data={data} canResolve={isDoctor} onChanged={load} />}
        {tab === "contact" && <ContactSection data={data} canRemind={isDoctor} />}
      </div>
    </div>
  );
}
