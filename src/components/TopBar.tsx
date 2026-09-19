"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import BackButton from "@/components/BackButton";
import type { UserRole } from "@/types/db";

const ROLE_CONFIG = {
  doctor: { label: "Shifokor", icon: "🩺", color: "bg-blue-500/20 text-blue-100 border-blue-400/30" },
  nurse: { label: "Hamshira", icon: "💊", color: "bg-teal-500/20 text-teal-100 border-teal-400/30" },
  patient: { label: "Bemor", icon: "🏥", color: "bg-violet-500/20 text-violet-100 border-violet-400/30" },
  manager: { label: "Menejer", icon: "📊", color: "bg-orange-500/20 text-orange-100 border-orange-400/30" },
  admin: { label: "Admin", icon: "⚙️", color: "bg-red-500/20 text-red-100 border-red-400/30" },
};

interface TopBarProps {
  /** Unresolved alert count — shows bell badge when > 0 */
  notificationCount?: number;
  /** Called when the bell button is clicked */
  onNotificationClick?: () => void;
  /** Show a prominent "Orqaga" button; this path is used when there is no in-app history. */
  backHref?: string;
  showBack?: boolean;
}

// Remembered across client-side navigations so the header doesn't flash
// "..." on every page change while the user is re-fetched.
let cachedIdentity: { name: string | null; role: UserRole | null } | null = null;

export default function TopBar({ notificationCount, onNotificationClick, backHref, showBack }: TopBarProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState<string | null>(cachedIdentity?.name ?? null);
  const [role, setRole] = useState<UserRole | null>(cachedIdentity?.role ?? null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const nextName = (data.user?.user_metadata?.full_name as string | undefined) ?? data.user?.email ?? null;
      const nextRole = (data.user?.user_metadata?.role as UserRole | undefined) ?? null;
      cachedIdentity = { name: nextName, role: nextRole };
      setName(nextName);
      setRole(nextRole);
    });
  }, [supabase]);

  async function handleLogout() {
    cachedIdentity = null;
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initials = name
    ? name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";
  const cfg = role ? ROLE_CONFIG[role as keyof typeof ROLE_CONFIG] ?? null : null;
  const showBell = notificationCount !== undefined && onNotificationClick !== undefined;

  return (
    <header
      className="sticky top-0 z-50 bg-gradient-to-r from-teal-700 via-teal-600 to-cyan-600 shadow-lg"
      style={{ paddingTop: "var(--safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto flex max-w-full items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          {(showBack || backHref) && <BackButton fallbackHref={backHref ?? "/"} tone="dark" />}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-sm">
            <Image src="/logo.png" alt="MedCare" width={28} height={28} className="h-full w-full object-contain" priority />
          </div>
          <div className="hidden min-[400px]:block">
            <p className="text-sm font-bold leading-tight text-white">MedCare</p>
            <p className="text-[10px] font-medium leading-tight text-teal-200">Aktiv Patronaj Tizimi</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {cfg && (
            <span className={`hidden rounded-full border px-2.5 py-1 text-xs font-semibold sm:inline-flex ${cfg.color}`}>
              {cfg.icon} {cfg.label}
            </span>
          )}
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white">
            {initials}
          </div>

          {/* Notification bell */}
          {showBell && (
            <button
              onClick={onNotificationClick}
              className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/90 transition hover:bg-white/20"
              title="Bildirishnomalar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {notificationCount! > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow">
                  {notificationCount! > 9 ? "9+" : notificationCount}
                </span>
              )}
            </button>
          )}

          <button
            onClick={handleLogout}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 transition hover:bg-white/20"
          >
            Chiqish
          </button>
        </div>
      </div>
    </header>
  );
}
