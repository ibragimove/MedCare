"use client";

import { useRouter, useSearchParams } from "next/navigation";
import TopBar from "@/components/TopBar";
import TasksTab from "@/components/nurse/TasksTab";
import PatientsTab from "@/components/nurse/PatientsTab";
import ProfileTab from "@/components/nurse/ProfileTab";

type Tab = "tasks" | "patients" | "profile";

const TABS: { id: Tab; label: string; title: string; icon: React.ReactNode }[] = [
  {
    id: "tasks",
    label: "Vazifalar",
    title: "Bugungi vazifalar",
    icon: (
      <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    ),
  },
  {
    id: "patients",
    label: "Bemorlarim",
    title: "Bemorlarim",
    icon: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
  },
  {
    id: "profile",
    label: "Profil",
    title: "Profil",
    icon: (
      <>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
  },
];

// The tab lives in ?tab= so "Orqaga" from a patient or task lands on the same tab.
export default function NurseHome() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("tab");
  const tab: Tab = requested === "patients" || requested === "profile" ? requested : "tasks";
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 pb-24">
      <TopBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4 sm:px-6">
        <h1 className="mb-3 text-xl font-bold text-gray-900">{current.title}</h1>
        {tab === "tasks" && <TasksTab />}
        {tab === "patients" && <PatientsTab />}
        {tab === "profile" && <ProfileTab />}
      </main>

      <nav
        aria-label="Asosiy boʻlimlar"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <div className="mx-auto grid max-w-2xl grid-cols-3">
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => router.replace(t.id === "tasks" ? "/nurse" : `/nurse?tab=${t.id}`, { scroll: false })}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold outline-none transition focus-visible:bg-teal-50 ${
                  active ? "text-teal-700" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.6 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {t.icon}
                </svg>
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
