"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

// SVG icon components
function IconGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconBell() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
function IconActivity() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}
function IconFileText() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
    </svg>
  );
}
function IconHome() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function IconLogOut() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
function IconChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: collapsed ? "rotate(180deg)" : "none", transition: "transform 0.25s" }}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

interface SidebarProps {
  doctorName: string;
  patientCount: number;
  alertCount: number;
  activeSection: string;
  onSectionChange: (s: string) => void;
  onLogout: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  comingSoon?: boolean;
}

const SECTIONS: { heading: string; items: NavItem[] }[] = [
  {
    heading: "KLINIK",
    items: [
      { id: "dashboard", label: "Shifokor Paneli", icon: <IconGrid /> },
      { id: "patients", label: "Bemorlar", icon: <IconUsers /> },
      { id: "alerts", label: "Ogohlantirishlar", icon: <IconBell /> },
      { id: "vitals", label: "Vital Ko'rsatkichlar", icon: <IconActivity />, comingSoon: true },
    ],
  },
  {
    heading: "ADMIN",
    items: [
      { id: "reports", label: "Hisobotlar", icon: <IconFileText />, comingSoon: true },
      { id: "wards", label: "Hududlar", icon: <IconHome />, comingSoon: true },
      { id: "staff", label: "Xodimlar", icon: <IconShield />, comingSoon: true },
    ],
  },
  {
    heading: "TIZIM",
    items: [
      { id: "settings", label: "Sozlamalar", icon: <IconSettings />, comingSoon: true },
    ],
  },
];

export default function DoctorSidebar({ doctorName, patientCount, alertCount, activeSection, onSectionChange, onLogout }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Start collapsed on phone-sized screens so the sidebar doesn't eat the
  // whole viewport; expand again automatically when rotated/resized wider.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync to viewport on mount
    setCollapsed(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setCollapsed(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const badgeFor = (id: string) => {
    if (id === "patients") return patientCount || undefined;
    if (id === "alerts") return alertCount || undefined;
    return undefined;
  };

  return (
    <aside
      className="relative flex h-full flex-col border-r border-gray-100 bg-white shadow-sm transition-all duration-300"
      style={{ width: collapsed ? 68 : 240, minWidth: collapsed ? 68 : 240 }}
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute -right-3 top-20 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm text-gray-400 hover:text-gray-700"
      >
        <IconChevron collapsed={collapsed} />
      </button>

      {/* Logo */}
      <div className={`flex items-center gap-2.5 border-b border-gray-100 px-4 py-4 ${collapsed ? "justify-center" : ""}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
          <Image src="/logo.png" alt="MedCare" width={28} height={28} className="h-full w-full object-contain p-0.5" priority />
        </div>
        {!collapsed && (
          <div>
            <p className="text-sm font-bold text-gray-900">MedCare</p>
            <p className="text-[10px] text-gray-400">Aktiv Patronaj AI</p>
          </div>
        )}
      </div>

      {/* Doctor profile */}
      <div className={`border-b border-gray-100 px-3 py-3 ${collapsed ? "flex justify-center" : ""}`}>
        {collapsed ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-400 text-xs font-bold text-white">
            {doctorName.charAt(0)}
          </div>
        ) : (
          <div className="flex items-center gap-2.5 rounded-xl bg-teal-50 px-3 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-400 text-xs font-bold text-white">
              {doctorName.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-teal-900">{doctorName}</p>
              <p className="text-[10px] text-teal-600">Oilaviy Shifokor</p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3">
        {SECTIONS.map((section) => (
          <div key={section.heading} className="mb-2">
            {!collapsed && (
              <p className="mb-1 px-4 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {section.heading}
              </p>
            )}
            {section.items.map((item) => {
              const badge = badgeFor(item.id);
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => !item.comingSoon && onSectionChange(item.id)}
                  title={collapsed ? item.label : undefined}
                  className={`group relative flex w-full items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? "bg-teal-50 text-teal-700 font-semibold"
                      : item.comingSoon
                        ? "cursor-default text-gray-300"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  } ${collapsed ? "justify-center" : ""}`}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-teal-600" />
                  )}

                  <span className={`shrink-0 ${isActive ? "text-teal-600" : ""}`}>{item.icon}</span>

                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate text-left">{item.label}</span>
                      {badge !== undefined && badge > 0 && (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          item.id === "alerts" ? "bg-red-100 text-red-600" : "bg-teal-100 text-teal-700"
                        }`}>
                          {badge}
                        </span>
                      )}
                      {item.comingSoon && (
                        <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-400">
                          breve
                        </span>
                      )}
                    </>
                  )}

                  {/* Collapsed badge dot */}
                  {collapsed && badge !== undefined && badge > 0 && (
                    <span className={`absolute right-1.5 top-1.5 h-4 w-4 rounded-full text-center text-[9px] font-bold leading-4 ${
                      item.id === "alerts" ? "bg-red-500 text-white" : "bg-teal-500 text-white"
                    }`}>
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Logout */}
      <div className="border-t border-gray-100 p-3">
        <button
          onClick={onLogout}
          title={collapsed ? "Chiqish" : undefined}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-500 transition hover:bg-red-50 hover:text-red-600 ${collapsed ? "justify-center" : ""}`}
        >
          <IconLogOut />
          {!collapsed && <span>Chiqish</span>}
        </button>
      </div>
    </aside>
  );
}
