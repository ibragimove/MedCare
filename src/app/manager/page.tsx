"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TopBar from "@/components/TopBar";
import AppSidebar, { SidebarIcons, type SidebarSection } from "@/components/AppSidebar";
import DashboardSection from "@/components/manager/DashboardSection";
import StaffSection from "@/components/manager/StaffSection";
import TerritoriesSection from "@/components/manager/TerritoriesSection";
import ReportsSection from "@/components/manager/ReportsSection";
import SettingsSection from "@/components/manager/SettingsSection";
import AuditSection from "@/components/manager/AuditSection";

type View = "dashboard" | "staff" | "territories" | "reports" | "settings" | "audit";

const VIEW_TITLES: Record<View, { title: string; subtitle: string }> = {
  dashboard: { title: "Menejer paneli", subtitle: "Vazifalar, SLA va eskalatsiyalar holati" },
  staff: { title: "Xodimlar", subtitle: "Hamshiralarni qoʻshish, tahrirlash va hududlarga biriktirish" },
  territories: { title: "Hududlar", subtitle: "Tuman va mahallalar, hamshira qamrovi" },
  reports: { title: "Hisobotlar", subtitle: "SLA bajarilishi va javob vaqtlari" },
  settings: { title: "Sozlamalar", subtitle: "SLA muddatlari va tasdiqlash qoidalari" },
  audit: { title: "Audit jurnali", subtitle: "Muhim amallar tarixi" },
};

export default function ManagerPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [view, setView] = useState<View>("dashboard");
  const [name, setName] = useState("Menejer");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setName((data.user?.user_metadata?.full_name as string | undefined) ?? "Menejer");
    });
  }, [supabase]);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const sections: SidebarSection[] = [
    {
      heading: "Boshqaruv",
      items: [
        { id: "dashboard", label: "Boshqaruv paneli", icon: SidebarIcons.grid },
        { id: "staff", label: "Xodimlar", icon: SidebarIcons.users },
        { id: "territories", label: "Hududlar", icon: SidebarIcons.home },
        { id: "reports", label: "Hisobotlar", icon: SidebarIcons.fileText },
      ],
    },
    {
      heading: "Tizim",
      items: [
        { id: "settings", label: "Sozlamalar", icon: SidebarIcons.settings },
        { id: "audit", label: "Audit jurnali", icon: SidebarIcons.shield },
      ],
    },
  ];

  const header = VIEW_TITLES[view];

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <div className="relative z-50 shrink-0">
        <TopBar />
      </div>
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar
          userName={name}
          roleLabel="Menejer"
          sections={sections}
          activeSection={view}
          onSectionChange={(id) => setView(id as View)}
          onLogout={logout}
        />
        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5 sm:py-6">
          <div className="mb-5">
            <h1 className="text-xl font-bold text-gray-900">{header.title}</h1>
            <p className="text-sm text-gray-500">{header.subtitle}</p>
          </div>
          {view === "dashboard" && <DashboardSection onOpenStaff={() => setView("staff")} />}
          {view === "staff" && <StaffSection />}
          {view === "territories" && <TerritoriesSection />}
          {view === "reports" && <ReportsSection />}
          {view === "settings" && <SettingsSection />}
          {view === "audit" && <AuditSection />}
        </main>
      </div>
    </div>
  );
}
