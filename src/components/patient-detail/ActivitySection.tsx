"use client";

import { useState } from "react";
import {
  fmtDateTime,
  SEVERITY_LABEL,
  SEVERITY_STYLE,
  TASK_STATUS_LABEL,
  TASK_STATUS_STYLE,
  timeAgo,
} from "@/lib/patient-status";
import type { PatientDetailData } from "@/types/patient-detail";
import { BTN_GHOST, Card, Empty, Pill } from "./ui";

// Visits and care tasks.
export function TasksSection({ data }: { data: PatientDetailData }) {
  if (data.tasks.length === 0) {
    return (
      <Card title="Tashriflar va vazifalar">
        <Empty icon="🩺" text="Hali vazifa yoki tashrif yoʻq" />
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {data.tasks.map((t) => (
        <Card
          key={t.id}
          title={`Vazifa · ${fmtDateTime(t.created_at)}`}
          action={
            <span className="flex flex-wrap gap-1.5">
              <Pill className={SEVERITY_STYLE[t.severity]}>{SEVERITY_LABEL[t.severity]}</Pill>
              <Pill className={TASK_STATUS_STYLE[t.status]}>{TASK_STATUS_LABEL[t.status]}</Pill>
            </span>
          }
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
            <dt>Muddat (SLA)</dt>
            <dd className="text-right text-gray-700">{fmtDateTime(t.sla_deadline)}</dd>
            <dt>Qabul qilindi</dt>
            <dd className="text-right text-gray-700">{fmtDateTime(t.accepted_at)}</dd>
            <dt>Tasdiqlandi</dt>
            <dd className="text-right text-gray-700">{fmtDateTime(t.confirmed_at)}</dd>
          </dl>
          {t.visit_notes && <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">📝 {t.visit_notes}</p>}
          {t.visits.length > 0 && (
            <ul className="mt-3 space-y-2 border-t border-gray-100 pt-3">
              {t.visits.map((v) => (
                <li key={v.id} className="text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-gray-800">🏠 Tashrif · {fmtDateTime(v.visited_at)}</span>
                    <Pill className={v.otp_verified ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}>
                      {v.otp_verified ? "OTP tasdiqlangan" : "OTP yoʻq"}
                    </Pill>
                  </div>
                  {v.checklist_done && v.checklist_done.length > 0 && (
                    <p className="mt-0.5 text-xs text-gray-500">Bajarilgan: {v.checklist_done.length} ta band</p>
                  )}
                  {v.notes && <p className="mt-0.5 text-xs text-gray-600">{v.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}

// Alerts, with resolve for the doctor.
export function AlertsSection({ data, canResolve, onChanged }: { data: PatientDetailData; canResolve: boolean; onChanged: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/alerts/${id}/resolve`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Xatolik yuz berdi");
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (data.alerts.length === 0) {
    return (
      <Card title="Ogohlantirishlar">
        <Empty icon="✅" text="Ogohlantirishlar yoʻq" />
      </Card>
    );
  }
  return (
    <Card title={`Ogohlantirishlar (${data.alerts.filter((a) => !a.resolved).length} ta faol)`}>
      {error && <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <ul className="space-y-2">
        {data.alerts.map((a) => (
          <li
            key={a.id}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 ${
              a.resolved ? "border-gray-100 bg-gray-50 text-gray-500" : "border-red-200 bg-red-50"
            }`}
          >
            <div>
              <p className={`text-sm font-medium ${a.resolved ? "" : "text-red-900"}`}>{a.reason}</p>
              <p className="text-xs text-gray-400">
                {timeAgo(a.created_at)} · {a.resolved ? "yopilgan" : "faol"}
              </p>
            </div>
            {canResolve && !a.resolved && (
              <button type="button" disabled={busyId === a.id} onClick={() => resolve(a.id)} className={BTN_GHOST}>
                ✓ Yopish
              </button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// Contact details and callback requests.
export function ContactSection({ data, canRemind }: { data: PatientDetailData; canRemind: boolean }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { patient, nurse } = data;

  async function remind() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/telegram/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: patient.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Xatolik yuz berdi");
      setNotice("Telegram orqali eslatma yuborildi ✅");
    } catch (err) {
      setNotice(`Xatolik: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Aloqa">
        <div className="flex flex-wrap gap-2">
          {patient.phone ? (
            <a href={`tel:${patient.phone}`} className={`${BTN_GHOST} inline-flex items-center`}>
              📞 Bemor: {patient.phone}
            </a>
          ) : (
            <span className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-500">Bemor telefoni kiritilmagan</span>
          )}
          {nurse?.phone && (
            <a href={`tel:${nurse.phone}`} className={`${BTN_GHOST} inline-flex items-center`}>
              👩‍⚕️ Hamshira: {nurse.phone}
            </a>
          )}
          {canRemind && (
            <button type="button" disabled={busy} onClick={remind} className={BTN_GHOST}>
              {busy ? "Yuborilmoqda..." : "📨 Telegram eslatma"}
            </button>
          )}
        </div>
        {notice && <p className="mt-2 text-sm text-gray-600">{notice}</p>}
      </Card>

      <Card title={`Qayta qoʻngʻiroq soʻrovlari (${data.callbacks.length})`}>
        {data.callbacks.length === 0 ? (
          <Empty icon="📞" text="Bemor hali qoʻngʻiroq soʻramagan" />
        ) : (
          <ul className="space-y-2">
            {data.callbacks.map((c) => (
              <li key={c.id} className="rounded-xl border border-gray-100 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-gray-800">{c.note || "Izohsiz"}</span>
                  <Pill className="bg-gray-100 text-gray-600">{c.status}</Pill>
                </div>
                <p className="mt-0.5 text-xs text-gray-400">{fmtDateTime(c.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
