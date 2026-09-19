"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, Empty, Pill } from "@/components/patient-detail/ui";

interface Stats {
  slaPercent: number;
  total: number;
  confirmed: number;
  overdue: number;
  escalated: number;
  active: number;
  unassignedPatients: number;
  medianMinutes: number;
  byStatus: Record<string, number>;
  activeTasks: Array<{
    id: string;
    patient_id: string;
    status: string;
    severity: string;
    sla_deadline: string;
    patients?: { full_name: string; tuman: string } | null;
  }>;
  recentEscalations: Array<{
    id: string;
    reason: string;
    created_at: string;
    resolved_at: string | null;
    care_tasks?: { patient_id?: string; patients?: { full_name: string } | null } | null;
  }>;
}

const STATUS_LABEL: Record<string, string> = {
  new: "Yangi",
  accepted: "Qabul qilindi",
  confirmed: "Tasdiqlandi",
  overdue: "Kechikdi",
  escalated: "Eskalatsiya",
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
  reopened: "bg-amber-100 text-amber-700",
};
const SEVERITY_LABEL: Record<string, string> = { routine: "Oddiy", urgent: "Shoshilinch", critical: "Kritik" };
const SEVERITY_COLOR: Record<string, string> = {
  routine: "bg-gray-100 text-gray-600",
  urgent: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

function Kpi({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <div className={`rounded-2xl border border-gray-100 p-4 shadow-sm ${tone ?? "bg-white"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

const formatMinutes = (m: number) => (m < 60 ? `${m} daqiqa` : `${Math.round((m / 60) * 10) / 10} soat`);

export default function DashboardSection({ onOpenStaff }: { onOpenStaff: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/manager/stats", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setStats(await res.json());
      setError(null);
    } catch {
      setError("Maʼlumotlarni yuklab boʻlmadi. Internetni tekshirib, qayta urinib koʻring.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
    const id = setInterval(() => void load(), 60000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) return <p className="py-16 text-center text-sm text-gray-400">Yuklanmoqda...</p>;
  if (!stats) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">
        {error}
        <button type="button" onClick={() => { setLoading(true); void load(); }} className="ml-3 min-h-11 font-semibold underline">
          Qayta urinish
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && <p className="rounded-xl bg-amber-50 px-4 py-2 text-xs text-amber-700">{error}</p>}

      {stats.unassignedPatients > 0 && (
        <button
          type="button"
          onClick={onOpenStaff}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-800 transition hover:bg-amber-100"
        >
          <span>
            <strong>{stats.unassignedPatients} ta bemor</strong> uchun hamshira biriktirilmagan — bu hudud uchun hamshira qoʻshing.
          </span>
          <span className="shrink-0 font-semibold">Xodimlar →</span>
        </button>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="SLA bajarilishi"
          value={`${stats.slaPercent}%`}
          sub={`${stats.confirmed} / ${stats.total} vazifa`}
          tone={stats.slaPercent >= 80 ? "bg-green-50" : stats.slaPercent >= 60 ? "bg-yellow-50" : "bg-red-50"}
        />
        <Kpi label="Oʻrtacha vaqt" value={formatMinutes(stats.medianMinutes)} sub="tasdiqlash davri" />
        <Kpi label="Kechikkan" value={stats.overdue} sub="hozirgi vazifalar" tone={stats.overdue > 0 ? "bg-orange-50" : undefined} />
        <Kpi label="Eskalatsiya" value={stats.escalated} sub="eʼtibor talab qiladi" tone={stats.escalated > 0 ? "bg-red-50" : undefined} />
      </div>

      <Card title={`Faol vazifalar (${stats.activeTasks.length})`}>
        {stats.activeTasks.length === 0 ? (
          <Empty icon="✅" text="Faol vazifalar yoʻq" />
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[560px] text-sm">
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
                  const late = new Date(t.sla_deadline) < new Date();
                  return (
                    <tr key={t.id} className="border-t border-gray-100 transition hover:bg-teal-50/40">
                      <td className="py-1 pr-4 font-medium text-gray-800">
                        <Link href={`/manager/patients/${t.patient_id}`} className="flex min-h-11 items-center hover:text-teal-700 hover:underline">
                          {t.patients?.full_name ?? "—"}
                        </Link>
                      </td>
                      <td className="py-1 pr-4 text-gray-500">{t.patients?.tuman ?? "—"}</td>
                      <td className="py-1 pr-4">
                        <Pill className={STATUS_COLOR[t.status] ?? "bg-gray-100 text-gray-600"}>{STATUS_LABEL[t.status] ?? t.status}</Pill>
                      </td>
                      <td className="py-1 pr-4">
                        <Pill className={SEVERITY_COLOR[t.severity] ?? "bg-gray-100 text-gray-600"}>{SEVERITY_LABEL[t.severity] ?? t.severity}</Pill>
                      </td>
                      <td className={`py-1 text-xs ${late ? "font-semibold text-red-600" : "text-gray-500"}`}>
                        {late ? "Muddat oʻtdi" : new Date(t.sla_deadline).toLocaleString("uz-UZ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Eskalatsiya jurnali">
        {stats.recentEscalations.length === 0 ? (
          <Empty icon="🟢" text="Eskalatsiyalar yoʻq" />
        ) : (
          <ul className="space-y-2">
            {stats.recentEscalations.map((e) => {
              const patientId = e.care_tasks?.patient_id;
              const body = (
                <div className={`flex items-start justify-between gap-3 rounded-xl p-3 ${e.resolved_at ? "bg-gray-50" : "bg-red-50"}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-800">{e.care_tasks?.patients?.full_name ?? "—"}</p>
                    <p className="text-xs text-gray-500">{e.reason}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Pill className={e.resolved_at ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                      {e.resolved_at ? "Hal qilindi" : "Faol"}
                    </Pill>
                    <span className="text-xs text-gray-400">{new Date(e.created_at).toLocaleString("uz-UZ")}</span>
                  </div>
                </div>
              );
              return (
                <li key={e.id}>
                  {patientId ? (
                    <Link href={`/manager/patients/${patientId}`} className="block transition hover:opacity-90">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Holat boʻyicha">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {Object.entries(stats.byStatus).map(([status, count]) => (
            <div key={status} className="rounded-xl bg-gray-50 p-3 text-center">
              <p className="text-xl font-bold text-gray-800">{count}</p>
              <p className="text-xs text-gray-500">{STATUS_LABEL[status] ?? status}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
