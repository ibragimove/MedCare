"use client";

import { useState } from "react";
import { MAX_MEDICATIONS } from "@/lib/medications";
import { fmtDate, treatmentDay } from "@/lib/patient-status";
import type { PatientDetailData } from "@/types/patient-detail";
import { BTN_GHOST, BTN_PRIMARY, Card, Empty, INPUT, Pill } from "./ui";

interface Props {
  data: PatientDetailData;
  canEdit: boolean;
  onChanged: () => void;
}

// Taken / expected doses over the last 14 days (dose_logs only stores doses that were taken).
function adherence(data: PatientDetailData, drug: string): { taken: number; expected: number; pct: number | null } {
  const item = data.patient.medication_plan?.items.find((i) => i.drug.trim().toLowerCase() === drug.trim().toLowerCase());
  if (!item || item.times.length === 0) return { taken: 0, expected: 0, pct: null };

  const { day } = treatmentDay(data.patient.discharge_date, data.patient.expected_days);
  const days = Math.min(14, day, data.patient.expected_days);
  const now = new Date();
  const nowHm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const passedToday = item.times.filter((t) => t <= nowHm).length;
  const expected = item.times.length * Math.max(0, days - 1) + passedToday;

  const taken = data.doseLogs.filter((l) => l.drug.trim().toLowerCase() === drug.trim().toLowerCase() && l.taken_at).length;
  if (expected === 0) return { taken, expected, pct: null };
  return { taken, expected, pct: Math.min(100, Math.round((taken / expected) * 100)) };
}

const emptyDraft = { drugName: "", dosage: "", timesPerDay: "", durationDays: "", note: "" };

export default function MedicationsSection({ data, canEdit, onChanged }: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = data.medications;
  const active = rows?.filter((m) => !m.stopped_at) ?? [];
  const stopped = rows?.filter((m) => m.stopped_at) ?? [];
  const plan = data.patient.medication_plan;

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/patients/${data.patient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Xatolik yuz berdi");
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addMedication(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const ok = await patch({
      action: "add_medication",
      medication: {
        drugName: draft.drugName,
        dosage: draft.dosage,
        timesPerDay: draft.timesPerDay ? Number(draft.timesPerDay) : null,
        durationDays: draft.durationDays ? Number(draft.durationDays) : null,
        note: draft.note,
      },
    });
    if (ok) {
      setDraft(emptyDraft);
      setAdding(false);
      onChanged();
    }
  }

  async function stopMedication(id: string, name: string) {
    if (!confirm(`“${name}” dorisini toʻxtatasizmi?`)) return;
    if (await patch({ action: "stop_medication", medicationId: id })) onChanged();
  }

  const addDisabled = rows === null || active.length >= MAX_MEDICATIONS || Boolean(data.patient.completed_at);

  return (
    <div className="space-y-4">
      <Card
        title={`Dorilar (${rows === null ? 1 : active.length})`}
        action={
          canEdit && (
            <button type="button" className={BTN_GHOST} disabled={addDisabled} onClick={() => setAdding((v) => !v)}>
              {adding ? "Bekor qilish" : "+ Dori qoʻshish"}
            </button>
          )
        }
      >
        {rows === null && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Bir nechta dorini boshqarish uchun maʼlumotlar bazasini yangilash kerak (migration_008_polish.sql).
          </p>
        )}

        {adding && (
          <form onSubmit={addMedication} className="mb-4 grid gap-3 rounded-xl border border-teal-100 bg-teal-50/40 p-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              Dori nomi
              <input required className={INPUT} value={draft.drugName} onChange={(e) => setDraft({ ...draft, drugName: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              Dozasi
              <input required className={INPUT} value={draft.dosage} onChange={(e) => setDraft({ ...draft, dosage: e.target.value })} placeholder="500 mg" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              Kuniga necha marta
              <select className={INPUT} value={draft.timesPerDay} onChange={(e) => setDraft({ ...draft, timesPerDay: e.target.value })}>
                <option value="">AI belgilaydi</option>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} marta
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              Davomiyligi (kun)
              <input type="number" min={1} max={365} className={INPUT} value={draft.durationDays} onChange={(e) => setDraft({ ...draft, durationDays: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 sm:col-span-2">
              Izoh
              <input className={INPUT} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Masalan: ovqatdan keyin" />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" disabled={busy} className={BTN_PRIMARY}>
                {busy ? "Saqlanmoqda..." : "Dorini qoʻshish"}
              </button>
            </div>
          </form>
        )}

        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {rows === null ? (
          <div className="rounded-xl border border-gray-100 p-3">
            <p className="font-semibold text-gray-800">{data.patient.drug_name || "—"}</p>
            <p className="text-sm text-gray-500">{data.patient.dosage}</p>
          </div>
        ) : active.length === 0 ? (
          <Empty icon="💊" text="Faol dorilar yoʻq" />
        ) : (
          <ul className="space-y-3">
            {active.map((m) => {
              const a = adherence(data, m.drug_name);
              return (
                <li key={m.id} className="rounded-xl border border-gray-100 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-800">{m.drug_name}</p>
                      <p className="text-sm text-gray-500">
                        {m.dosage}
                        {m.frequency ? ` · ${m.frequency}` : ""}
                        {m.duration_days ? ` · ${m.duration_days} kun` : ""}
                      </p>
                      {m.instructions && <p className="mt-0.5 text-xs text-gray-500">📝 {m.instructions}</p>}
                    </div>
                    {canEdit && !data.patient.completed_at && (
                      <button
                        type="button"
                        disabled={busy || active.length <= 1}
                        title={active.length <= 1 ? "Oxirgi faol dorini toʻxtatib boʻlmaydi" : undefined}
                        onClick={() => stopMedication(m.id, m.drug_name)}
                        className="min-h-9 rounded-lg px-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        Toʻxtatish
                      </button>
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Oxirgi 14 kun: qabul qilish</span>
                      <span className="font-semibold text-gray-700">
                        {a.pct === null ? "maʼlumot yoʻq" : `${a.pct}% (${a.taken}/${a.expected})`}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${a.pct === null ? "bg-gray-200" : a.pct >= 80 ? "bg-emerald-500" : a.pct >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${a.pct ?? 0}%` }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {stopped.length > 0 && (
          <div className="mt-4">
            <p className="mb-1 text-xs font-semibold uppercase text-gray-400">Toʻxtatilgan</p>
            <ul className="space-y-1">
              {stopped.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                  <span className="line-through">{m.drug_name}</span>
                  <span>· {m.dosage}</span>
                  <Pill className="bg-gray-100 text-gray-500">{fmtDate(m.stopped_at)}</Pill>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {plan && plan.items.length > 0 && (
        <Card title="Kunlik jadval">
          <ul className="space-y-2">
            {plan.items.map((item) => (
              <li key={item.drug} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium text-gray-800">{item.drug}</span>
                <span className="text-gray-500">
                  {item.times.join(", ")} · {item.withFood ? "ovqat bilan" : "ovqatsiz"}
                </span>
              </li>
            ))}
          </ul>
          {plan.generalAdvice && <p className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-800">{plan.generalAdvice}</p>}
        </Card>
      )}
    </div>
  );
}
