"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Empty, BTN_GHOST } from "@/components/patient-detail/ui";
import type { ReportRow } from "@/types/reports";

interface Report {
  days: number;
  overall: ReportRow;
  byNurse: ReportRow[];
  byTuman: ReportRow[];
}

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
const mins = (v: number | null) => (v === null ? "—" : v < 60 ? `${v} daq` : `${Math.round((v / 60) * 10) / 10} soat`);

function tone(v: number | null) {
  if (v === null) return "text-gray-400";
  return v >= 80 ? "text-green-600" : v >= 60 ? "text-amber-600" : "text-red-600";
}

function Table({ title, firstColumn, rows }: { title: string; firstColumn: string; rows: ReportRow[] }) {
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <Empty text="Bu davrda vazifalar yoʻq" />
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase text-gray-400">
                <th className="pb-2 pr-3">{firstColumn}</th>
                <th className="pb-2 pr-3 text-right">Vazifalar</th>
                <th className="pb-2 pr-3 text-right">SLA</th>
                <th className="pb-2 pr-3 text-right">Qabul qilish</th>
                <th className="pb-2 pr-3 text-right">Kechikkan</th>
                <th className="pb-2 text-right">Eskalatsiya</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-gray-100">
                  <td className="py-2.5 pr-3 font-medium text-gray-800">{r.label}</td>
                  <td className="py-2.5 pr-3 text-right">{r.tasks}</td>
                  <td className={`py-2.5 pr-3 text-right font-semibold ${tone(r.slaPercent)}`}>{pct(r.slaPercent)}</td>
                  <td className="py-2.5 pr-3 text-right text-gray-600">{mins(r.medianAcceptMinutes)}</td>
                  <td className="py-2.5 pr-3 text-right">{r.overdue}</td>
                  <td className="py-2.5 text-right">{r.escalated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// Quote a CSV cell; a leading = + - @ would be run as a formula by spreadsheet apps, so it is neutralised.
const csvCell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

function downloadCsv(report: Report) {
  const header = ["Boʻlim", "Nomi", "Vazifalar", "SLA %", "Qabul qilish (daq)", "Kechikkan", "Eskalatsiya"];
  const rows: (string | number | null)[][] = [];
  const add = (section: string, list: ReportRow[]) =>
    list.forEach((r) => rows.push([section, r.label, r.tasks, r.slaPercent, r.medianAcceptMinutes, r.overdue, r.escalated]));
  add("Jami", [report.overall]);
  add("Hamshira", report.byNurse);
  add("Tuman", report.byTuman);
  const text = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  // BOM so Excel reads the Uzbek letters as UTF-8
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `hisobot-${report.days}-kun-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsSection() {
  const [days, setDays] = useState<7 | 30>(7);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/manager/reports?days=${d}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Hisobotni yuklab boʻlmadi");
      setReport(json);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch when the period changes
    void load(days);
  }, [days, load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition ${days === d ? "bg-teal-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
            >
              {d} kun
            </button>
          ))}
        </div>
        <button type="button" disabled={!report || loading} onClick={() => report && downloadCsv(report)} className={BTN_GHOST}>
          ⬇ CSV yuklab olish
        </button>
      </div>

      {error && <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {loading && !report && <p className="py-12 text-center text-sm text-gray-400">Yuklanmoqda...</p>}

      {report && (
        <div className={`space-y-5 transition-opacity ${loading ? "opacity-50" : ""}`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Vazifalar", value: report.overall.tasks },
              { label: "SLA bajarilishi", value: pct(report.overall.slaPercent), cls: tone(report.overall.slaPercent) },
              { label: "Qabul qilish (median)", value: mins(report.overall.medianAcceptMinutes) },
              { label: "Kechikkan / eskalatsiya", value: `${report.overall.overdue} / ${report.overall.escalated}` },
            ].map((k) => (
              <div key={k.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{k.label}</p>
                <p className={`mt-1 text-2xl font-bold ${k.cls ?? "text-gray-900"}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <Table title="Hamshiralar boʻyicha" firstColumn="Hamshira" rows={report.byNurse} />
          <Table title="Tumanlar boʻyicha" firstColumn="Tuman" rows={report.byTuman} />
        </div>
      )}
    </div>
  );
}
