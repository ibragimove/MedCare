"use client";

import { useState } from "react";
import { fmtDateTime, SEVERITY_LABEL, SEVERITY_STYLE } from "@/lib/patient-status";
import type { Severity } from "@/types/db";
import type { PatientDetailData } from "@/types/patient-detail";
import { BTN_GHOST, BTN_PRIMARY, Card, Empty, Pill } from "./ui";

interface Props {
  data: PatientDetailData;
  canSubmit: boolean;
  onChanged: () => void;
}

const riskStyle = (score: number) =>
  score >= 80 ? "bg-red-100 text-red-700" : score >= 50 ? "bg-orange-100 text-orange-700" : "bg-emerald-100 text-emerald-700";

export default function EpicrisisSection({ data, canSubmit, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [severity, setSeverity] = useState<Severity>("routine");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/discharges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: data.patient.id, epicrisis_raw: text, severity }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Xatolik yuz berdi");
      setText("");
      setOpen(false);
      setNotice("Epikriz yuborildi. AI xulosa va hamshira vazifasi yaratilmoqda…");
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {canSubmit && (
        <Card
          title="Yangi epikriz"
          action={
            <button type="button" className={BTN_GHOST} onClick={() => setOpen((v) => !v)}>
              {open ? "Bekor qilish" : "📋 Epikriz yuborish"}
            </button>
          }
        >
          {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✅ {notice}</p>}
          {open && (
            <form onSubmit={submit} className="space-y-3">
              <textarea
                required
                rows={5}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Kasallik tarixi matni (epikriz)..."
                className="w-full rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-400"
              />
              <div className="flex flex-wrap gap-2">
                {(["routine", "urgent", "critical"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeverity(s)}
                    className={`min-h-10 rounded-lg px-3 text-xs font-semibold transition ${
                      severity === s
                        ? s === "critical"
                          ? "bg-red-500 text-white"
                          : s === "urgent"
                            ? "bg-orange-500 text-white"
                            : "bg-teal-600 text-white"
                        : "border border-gray-200 bg-white text-gray-600"
                    }`}
                  >
                    {SEVERITY_LABEL[s]}
                  </button>
                ))}
              </div>
              {error && (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
              <button type="submit" disabled={busy || !text.trim()} className={BTN_PRIMARY}>
                {busy ? "Yuborilmoqda..." : "Epikrizni yuborish →"}
              </button>
            </form>
          )}
          {!open && !notice && (
            <p className="text-sm text-gray-500">Epikriz yuborilgach hamshiraga avtomatik vazifa yaratiladi.</p>
          )}
        </Card>
      )}

      {data.discharges.length === 0 ? (
        <Card title="Epikriz va AI xulosa">
          <Empty icon="📋" text="Hali epikriz yuborilmagan" />
        </Card>
      ) : (
        data.discharges.map((d) => {
          const ai = d.ai_summaries[0];
          return (
            <Card
              key={d.id}
              title={`Epikriz · ${fmtDateTime(d.created_at)}`}
              action={<Pill className={SEVERITY_STYLE[d.severity]}>{SEVERITY_LABEL[d.severity]}</Pill>}
            >
              {d.icd10_code && <p className="mb-2 text-xs text-gray-500">MKB-10: {d.icd10_code}</p>}
              {d.epicrisis_raw && (
                <details className="mb-3">
                  <summary className="cursor-pointer text-sm font-medium text-teal-700">Epikriz matni</summary>
                  <p className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                    {d.epicrisis_raw}
                  </p>
                </details>
              )}
              {ai ? (
                <div className="space-y-3 rounded-xl bg-teal-50/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase text-teal-700">AI xulosa</p>
                    {ai.risk_score !== null && (
                      <Pill className={riskStyle(ai.risk_score)}>Xavf bali: {ai.risk_score}/100</Pill>
                    )}
                  </div>
                  {ai.brief_uz && <p className="text-sm text-gray-800">{ai.brief_uz}</p>}
                  {ai.main_concerns && ai.main_concerns.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500">Asosiy xavotirlar</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-gray-700">
                        {ai.main_concerns.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {ai.checklist_uz && ai.checklist_uz.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500">Hamshira uchun tekshiruv roʻyxati</p>
                      <ul className="mt-1 space-y-0.5 text-sm text-gray-700">
                        {ai.checklist_uz.map((c) => (
                          <li key={c}>☐ {c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">AI xulosa hali tayyor emas.</p>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
