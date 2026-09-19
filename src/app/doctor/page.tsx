"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TopBar from "@/components/TopBar";
import AppSidebar, { SidebarIcons, type SidebarSection } from "@/components/AppSidebar";
import NotificationPanel from "@/components/doctor/NotificationPanel";
import PatientCard from "@/components/doctor/PatientCard";
import PatientForm from "@/components/doctor/PatientForm";
import { fmtDate, LEVEL_RANK, statusBadge, timeAgo } from "@/lib/patient-status";
import type { Alert, Checkin, NurseSummary, Patient } from "@/types/db";

type View = "dashboard" | "patients" | "vitals";
type CheckinRow = Checkin & { patients?: Pick<Patient, "full_name" | "tuman" | "village"> | null };

const CONTROL =
  "min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100";

const VIEW_TITLES: Record<View, { title: string; subtitle: string }> = {
  dashboard: { title: "Shifokor paneli", subtitle: "Statsionardan chiqarilgan bemorlar monitoringi" },
  patients: { title: "Bemorlar", subtitle: "Barcha bemorlar roʻyxati — batafsil maʼlumot uchun bemorni bosing" },
  vitals: { title: "Vital belgilar", subtitle: "Bemorlarning oxirgi check-in natijalari — eʼtibor talab qilganlar birinchi" },
};

export default function DoctorPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [nurses, setNurses] = useState<NurseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [doctorName, setDoctorName] = useState("Shifokor");
  const [view, setView] = useState<View>("dashboard");
  const [showForm, setShowForm] = useState(false);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [reminderNotice, setReminderNotice] = useState<string | null>(null);

  // Patients-view filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "completed" | "all">("active");
  const [levelFilter, setLevelFilter] = useState<"all" | "risk" | "watch" | "good" | "pending">("all");
  const [tumanFilter, setTumanFilter] = useState("all");
  const [sort, setSort] = useState<"newest" | "risk" | "name">("newest");

  const loadData = useCallback(async () => {
    const [p, a, c] = await Promise.all([
      supabase.from("patients").select("*, nurses(id, full_name, tuman, village)").order("created_at", { ascending: false }).limit(500),
      supabase.from("alerts").select("*, patients(full_name, tuman, village)").eq("resolved", false).order("created_at", { ascending: false }),
      supabase.from("checkins").select("*, patients(full_name, tuman, village)").order("created_at", { ascending: false }).limit(300),
    ]);
    if (p.error) {
      setLoadError("Bemorlarni yuklab boʻlmadi. Internetni tekshirib, qayta urinib koʻring.");
    } else {
      setLoadError(null);
      setPatients((p.data as Patient[]) ?? []);
    }
    setAlerts((a.data as Alert[]) ?? []);
    setCheckins((c.data as CheckinRow[]) ?? []);
    setLoading(false);
  }, [supabase]);

  const loadNurses = useCallback(async () => {
    try {
      const res = await fetch("/api/nurses");
      const data = await res.json();
      setNurses((data.nurses as NurseSummary[]) ?? []);
    } catch {
      // best-effort — the nurse override select just stays empty
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
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, loadData]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function resolveAlert(id: string) {
    await fetch(`/api/alerts/${id}/resolve`, { method: "POST" });
    loadData();
  }

  async function sendReminder(patientId: string) {
    setRemindingId(patientId);
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
      setRemindingId(null);
    }
  }

  const activePatients = useMemo(() => patients.filter((p) => !p.completed_at), [patients]);
  const completedCount = patients.length - activePatients.length;

  const sections: SidebarSection[] = [
    {
      heading: "Klinik",
      items: [
        { id: "dashboard", label: "Bosh sahifa", icon: SidebarIcons.grid },
        { id: "patients", label: "Bemorlar", icon: SidebarIcons.users, badge: activePatients.length },
        { id: "vitals", label: "Vital belgilar", icon: SidebarIcons.activity },
      ],
    },
  ];

  function changeView(next: string) {
    setView(next as View);
    setShowForm(false);
  }

  const avgScore = (() => {
    const scored = activePatients.filter((p) => p.last_match_percent !== null);
    if (scored.length === 0) return null;
    return Math.round(scored.reduce((sum, p) => sum + (p.last_match_percent ?? 0), 0) / scored.length);
  })();
  const onTrackCount = activePatients.filter((p) => p.last_match_percent !== null && p.last_match_percent >= 70).length;
  const riskCount = activePatients.filter((p) => statusBadge(p).level === "risk").length;

  // Patients view
  const tumans = useMemo(() => [...new Set(patients.map((p) => p.tuman))].sort((a, b) => a.localeCompare(b)), [patients]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = patients.filter((p) => {
      if (statusFilter === "active" && p.completed_at) return false;
      if (statusFilter === "completed" && !p.completed_at) return false;
      if (levelFilter !== "all" && statusBadge(p).level !== levelFilter) return false;
      if (tumanFilter !== "all" && p.tuman !== tumanFilter) return false;
      if (q && !`${p.full_name} ${p.diagnosis} ${p.village} ${p.tuman}`.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sort === "risk") {
      list.sort(
        (a, b) =>
          LEVEL_RANK[statusBadge(a).level] - LEVEL_RANK[statusBadge(b).level] ||
          (a.last_match_percent ?? 101) - (b.last_match_percent ?? 101),
      );
    } else if (sort === "name") {
      list.sort((a, b) => a.full_name.localeCompare(b.full_name));
    }
    return list;
  }, [patients, search, statusFilter, levelFilter, tumanFilter, sort]);

  // Vitals view: the latest check-in per patient, attention-first
  const vitals = useMemo(() => {
    const latest = new Map<string, CheckinRow>();
    for (const c of checkins) if (!latest.has(c.patient_id)) latest.set(c.patient_id, c);
    const rows = activePatients.map((p) => ({ patient: p, checkin: latest.get(p.id) ?? null }));
    rows.sort((a, b) => {
      // no check-in yet sits between "risk" and "good": it needs a nudge, but is not an emergency
      const rank = (r: (typeof rows)[number]) => (r.checkin ? r.checkin.match_percent : 80);
      return rank(a) - rank(b);
    });
    return rows;
  }, [checkins, activePatients]);

  const header = VIEW_TITLES[view];

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <div className="relative z-50 shrink-0">
        <TopBar notificationCount={alerts.length} onNotificationClick={() => setShowNotifications((s) => !s)} />
        {showNotifications && (
          <div className="absolute right-4 top-full">
            <NotificationPanel
              alerts={alerts}
              onResolve={async (id) => {
                await resolveAlert(id);
              }}
              onClose={() => setShowNotifications(false)}
            />
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <AppSidebar
          userName={doctorName}
          roleLabel="Shifokor"
          sections={sections}
          activeSection={view}
          onSectionChange={changeView}
          onLogout={handleLogout}
        />

        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5 sm:py-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{header.title}</h1>
              <p className="text-sm text-gray-500">{header.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowForm((s) => !s);
                if (view === "vitals") setView("patients");
              }}
              className="min-h-11 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-500 px-4 text-sm font-semibold text-white shadow-md transition hover:from-teal-700 hover:to-cyan-600"
            >
              {showForm ? "✕ Bekor" : "+ Yangi bemor"}
            </button>
          </div>

          {formNotice && (
            <p role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {formNotice}
            </p>
          )}

          {showForm && (
            <PatientForm
              nurses={nurses}
              onCancel={() => setShowForm(false)}
              onCreated={(notice) => {
                setShowForm(false);
                setFormNotice(notice);
                setView("patients");
                loadData();
                loadNurses();
              }}
            />
          )}

          {loadError && (
            <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <span>{loadError}</span>
              <button type="button" onClick={loadData} className="min-h-9 rounded-lg border border-red-200 bg-white px-3 font-semibold">
                Qayta urinish
              </button>
            </div>
          )}

          {/* ── Dashboard ── */}
          {view === "dashboard" && (
            <>
              {!loading && (
                <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Faol bemorlar", value: activePatients.length, color: "text-gray-800" },
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

              <section className="mb-6">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-red-700">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-sm">⚠️</span>
                  Faol ogohlantirishlar
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs">{alerts.length}</span>
                </h2>
                {alerts.length === 0 ? (
                  <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    ✅ Hozircha faol ogohlantirishlar yoʻq
                  </p>
                ) : (
                  <div className="space-y-2">
                    {alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-4 shadow-sm"
                      >
                        <Link href={`/doctor/patients/${alert.patient_id}`} className="min-w-0 flex-1">
                          <p className="font-semibold text-red-900">
                            {alert.patients?.full_name} — {alert.patients?.village}
                          </p>
                          <p className="text-sm text-red-700">{alert.reason}</p>
                          <p className="text-xs text-red-400">{timeAgo(alert.created_at)}</p>
                        </Link>
                        <button
                          type="button"
                          onClick={() => resolveAlert(alert.id)}
                          className="min-h-10 rounded-lg border border-red-200 bg-white px-3 text-sm font-medium text-red-700 transition hover:bg-red-50"
                        >
                          ✓ Yopish
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-gray-800">
                    Eʼtibor talab qiladigan bemorlar
                    {riskCount > 0 && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">{riskCount} xavfli</span>}
                  </h2>
                  <button type="button" onClick={() => setView("patients")} className="text-sm font-semibold text-teal-700 hover:underline">
                    Barchasi →
                  </button>
                </div>
                {loading ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-40 animate-pulse rounded-2xl bg-gray-100" />
                    ))}
                  </div>
                ) : activePatients.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-gray-200 p-10 text-center">
                    <p className="text-4xl">🏥</p>
                    <p className="mt-2 font-medium text-gray-600">Hozircha bemorlar yoʻq</p>
                    <p className="text-sm text-gray-400">“+ Yangi bemor” tugmasini bosing</p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[...activePatients]
                      .sort((a, b) => LEVEL_RANK[statusBadge(a).level] - LEVEL_RANK[statusBadge(b).level])
                      .slice(0, 4)
                      .map((p) => (
                        <PatientCard key={p.id} patient={p} href={`/doctor/patients/${p.id}`} onRemind={sendReminder} reminding={remindingId === p.id} />
                      ))}
                  </div>
                )}
                {reminderNotice && <p className="mt-3 text-sm text-gray-600">{reminderNotice}</p>}
              </section>
            </>
          )}

          {/* ── Patients ── */}
          {view === "patients" && (
            <section>
              <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Ism, tashxis yoki hudud boʻyicha qidirish"
                  aria-label="Qidirish"
                  className={`${CONTROL} sm:col-span-2 lg:col-span-2`}
                />
                <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value as typeof levelFilter)} className={CONTROL} aria-label="Holat boʻyicha">
                  <option value="all">Barcha holatlar</option>
                  <option value="risk">Xavfli</option>
                  <option value="watch">Kuzatuvda</option>
                  <option value="good">Yaxshi</option>
                  <option value="pending">Kutilmoqda</option>
                </select>
                <select value={tumanFilter} onChange={(e) => setTumanFilter(e.target.value)} className={CONTROL} aria-label="Hudud boʻyicha">
                  <option value="all">Barcha tumanlar</option>
                  {tumans.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={CONTROL} aria-label="Saralash">
                  <option value="newest">Yangilari birinchi</option>
                  <option value="risk">Xavfli birinchi</option>
                  <option value="name">Ism boʻyicha</option>
                </select>
              </div>

              <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Bemorlar holati">
                {(
                  [
                    { id: "active", label: "Faol", count: activePatients.length },
                    { id: "completed", label: "Yakunlangan", count: completedCount },
                    { id: "all", label: "Hammasi", count: patients.length },
                  ] as const
                ).map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setStatusFilter(chip.id)}
                    aria-pressed={statusFilter === chip.id}
                    className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${
                      statusFilter === chip.id ? "bg-teal-600 text-white shadow-sm" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {chip.label} <span className="opacity-70">{chip.count}</span>
                  </button>
                ))}
              </div>

              {reminderNotice && <p className="mb-3 text-sm text-gray-600">{reminderNotice}</p>}

              {loading ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-44 animate-pulse rounded-2xl bg-gray-100" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-gray-200 p-10 text-center">
                  <p className="text-4xl">🔍</p>
                  <p className="mt-2 font-medium text-gray-600">
                    {patients.length === 0 ? "Hozircha bemorlar yoʻq" : "Filtrga mos bemor topilmadi"}
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {filtered.map((p) => (
                    <PatientCard key={p.id} patient={p} href={`/doctor/patients/${p.id}`} onRemind={sendReminder} reminding={remindingId === p.id} />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ── Vitals ── */}
          {view === "vitals" && (
            <section>
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />
                  ))}
                </div>
              ) : vitals.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-gray-200 p-10 text-center">
                  <p className="text-4xl">📈</p>
                  <p className="mt-2 font-medium text-gray-600">Faol bemorlar yoʻq</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {vitals.map(({ patient, checkin }) => {
                    const pct = checkin?.match_percent ?? null;
                    const tone =
                      pct === null ? "bg-slate-100 text-slate-600" : pct >= 90 ? "bg-emerald-100 text-emerald-700" : pct >= 70 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
                    return (
                      <li key={patient.id}>
                        <Link
                          href={`/doctor/patients/${patient.id}`}
                          className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition hover:shadow-md"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-gray-800">{patient.full_name}</p>
                            <p className="truncate text-xs text-gray-500">
                              {patient.tuman}, {patient.village} · {patient.diagnosis}
                            </p>
                            <p className="mt-1 line-clamp-1 text-xs text-gray-600">
                              {checkin ? checkin.ai_recommendation || "Tavsiya yoʻq" : "Hali check-in topshirilmagan"}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
                              {pct === null ? "Kutilmoqda" : `${pct}%`}
                            </span>
                            {checkin && <p className="mt-1 text-[11px] text-gray-400">{fmtDate(checkin.date)}</p>}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
