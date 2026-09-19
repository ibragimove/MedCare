"use client";

import { useEffect, useState, useCallback } from "react";
import TopBar from "@/components/TopBar";

interface Stats {
  slaPercent: number;
  total: number;
  confirmed: number;
  overdue: number;
  escalated: number;
  active: number;
  medianMinutes: number;
  byStatus: Record<string, number>;
  activeTasks: Array<{
    id: string;
    status: string;
    severity: string;
    sla_deadline: string;
    patients?: { full_name: string; tuman: string };
  }>;
  recentEscalations: Array<{
    id: string;
    reason: string;
    created_at: string;
    resolved_at: string | null;
    care_tasks?: { patients?: { full_name: string } };
  }>;
}

const STATUS_LABEL: Record<string, string> = {
  new: "Yangi",
  accepted: "Qabul qilindi",
  confirmed: "Tasdiqlandi",
  overdue: "Kechikdi",
  escalated: "Eskalatsia",
  reassigned: "Qayta tayinlandi",
};
const STATUS_COLOR: Record<string, string> = {
  new: "bg-blue-100 text-blue-700",
  accepted: "bg-teal-100 text-teal-700",
  confirmed: "bg-green-100 text-green-700",
  overdue: "bg-orange-100 text-orange-700",
  escalated: "bg-red-100 text-red-700",
  reassigned: "bg-purple-100 text-purple-700",
};
const SEVERITY_COLOR: Record<string, string> = {
  routine: "bg-gray-100 text-gray-600",
  urgent: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

function Kpi({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className={`rounded-2xl p-4 shadow-sm ${color ?? "bg-white"}`}>
      <p className="text-xs font-semibold uppercase text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-800">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

export default function ManagerPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/manager/stats");
    if (res.ok) setStats(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const interval = setInterval(() => { void load(); }, 60000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading || !stats) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <TopBar />
        <div className="flex flex-1 items-center justify-center text-gray-400">Yuklanmoqda...</div>
      </div>
    );
  }

  const medianDisplay =
    stats.medianMinutes < 60
      ? `${stats.medianMinutes} daqiqa`
      : `${Math.round(stats.medianMinutes / 60)} soat`;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <TopBar />
      <div className="mx-auto w-full max-w-4xl p-4">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">Menejer paneli</h1>
          <button
            onClick={load}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-teal-600 shadow-sm hover:bg-teal-50"
          >
            Yangilash
          </button>
        </div>

        {/* KPI Cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi
            label="SLA bajarilishi"
            value={`${stats.slaPercent}%`}
            sub={`${stats.confirmed} / ${stats.total} vazifa`}
            color={stats.slaPercent >= 80 ? "bg-green-50" : stats.slaPercent >= 60 ? "bg-yellow-50" : "bg-red-50"}
          />
          <Kpi
            label="O'rtacha vaqt"
            value={medianDisplay}
            sub="tasdiqlash davri"
          />
          <Kpi
            label="Kechikdi"
            value={stats.overdue}
            sub="hozirgi kechiktirilgan"
            color={stats.overdue > 0 ? "bg-orange-50" : "bg-white"}
          />
          <Kpi
            label="Eskalatsia"
            value={stats.escalated}
            sub="e'tibor talab qiladi"
            color={stats.escalated > 0 ? "bg-red-50" : "bg-white"}
          />
        </div>

        {/* Active Tasks Table */}
        <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase text-gray-500">Faol vazifalar ({stats.activeTasks.length})</h2>
          {stats.activeTasks.length === 0 ? (
            <p className="text-sm text-gray-400">Faol vazifalar yoʻq</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase text-gray-400">
                    <th className="pb-2 pr-4">Bemor</th>
                    <th className="pb-2 pr-4">Tuman</th>
                    <th className="pb-2 pr-4">Holat</th>
                    <th className="pb-2 pr-4">Muhimlik</th>
                    <th className="pb-2">SLA muddati</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.activeTasks.map((t) => {
                    const isOverdue = new Date(t.sla_deadline) < new Date();
                    return (
                      <tr key={t.id} className="border-t border-gray-100">
                        <td className="py-2 pr-4 font-medium text-gray-800">{t.patients?.full_name ?? "—"}</td>
                        <td className="py-2 pr-4 text-gray-500">{t.patients?.tuman ?? "—"}</td>
                        <td className="py-2 pr-4">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[t.status] ?? ""}`}>
                            {STATUS_LABEL[t.status] ?? t.status}
                          </span>
                        </td>
                        <td className="py-2 pr-4">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SEVERITY_COLOR[t.severity] ?? ""}`}>
                            {t.severity}
                          </span>
                        </td>
                        <td className={`py-2 text-xs ${isOverdue ? "font-semibold text-red-500" : "text-gray-500"}`}>
                          {isOverdue ? "⚠️ Kechikdi" : new Date(t.sla_deadline).toLocaleString("uz-UZ")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Escalation Log */}
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase text-gray-500">Eskalatsia jurnali</h2>
          {stats.recentEscalations.length === 0 ? (
            <p className="text-sm text-gray-400">Eskalatsiyalar yoʻq</p>
          ) : (
            <div className="space-y-3">
              {stats.recentEscalations.map((e) => (
                <div key={e.id} className={`rounded-xl p-3 ${e.resolved_at ? "bg-gray-50" : "bg-red-50"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        {e.care_tasks?.patients?.full_name ?? "—"}
                      </p>
                      <p className="text-xs text-gray-500">{e.reason}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${e.resolved_at ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>
                        {e.resolved_at ? "Hal qilindi" : "Faol"}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(e.created_at).toLocaleString("uz-UZ")}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status breakdown */}
        <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase text-gray-500">Holat boʻyicha</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {Object.entries(stats.byStatus).map(([status, count]) => (
              <div key={status} className="rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-xl font-bold text-gray-800">{count}</p>
                <p className="text-xs text-gray-500">{STATUS_LABEL[status] ?? status}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
