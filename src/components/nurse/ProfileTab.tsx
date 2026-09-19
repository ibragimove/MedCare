"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ErrorBanner, callApi } from "@/components/nurse/shared";
import { Card, Field, Pill, BTN_GHOST } from "@/components/patient-detail/ui";
import type { NurseProfileResponse } from "@/types/nurse";

export default function ProfileTab() {
  const router = useRouter();
  const [profile, setProfile] = useState<NurseProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const load = useCallback(async () => {
    try {
      setProfile(await callApi<NurseProfileResponse>("/api/nurse/profile"));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
  }, [load]);

  async function logout() {
    setLoggingOut(true);
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (insecure context); the command stays visible to type by hand.
    }
  }

  if (error && !profile) return <ErrorBanner message={error} onRetry={() => void load()} />;
  if (!profile) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Yuklanmoqda">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-100" />
        ))}
      </div>
    );
  }

  const linkCommand = profile.telegram.linkPhone ? `/link ${profile.telegram.linkPhone}` : null;

  return (
    <div className="space-y-4">
      <Card title="Shaxsiy maʼlumotlar">
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 text-xl font-bold text-white" aria-hidden="true">
            {profile.full_name.charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-gray-900">{profile.full_name}</p>
            <p className="text-sm text-gray-500">Hamshira</p>
          </div>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Telefon">{profile.phone ?? "—"}</Field>
          <Field label="Email">{profile.email ?? "—"}</Field>
          <Field label="Tuman">{profile.tuman || "—"}</Field>
        </dl>
      </Card>

      <Card title={`Xizmat koʻrsatadigan mahallalar (${profile.villages.length})`}>
        {profile.villages.length === 0 ? (
          <p className="text-sm text-gray-500">Mahalla biriktirilmagan. Menejerga murojaat qiling.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {profile.villages.map((v) => (
              <li key={v} className="rounded-full bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-800">
                {v}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-gray-400">Hududni faqat menejer oʻzgartira oladi.</p>
      </Card>

      <Card
        title="Telegram"
        action={
          profile.telegram.connected ? (
            <Pill className="bg-green-100 text-green-700">✅ Ulangan</Pill>
          ) : (
            <Pill className="bg-amber-100 text-amber-700">Ulanmagan</Pill>
          )
        }
      >
        {profile.telegram.connected ? (
          <p className="text-sm text-gray-600">Yangi vazifalar va eslatmalar Telegram orqali ham keladi.</p>
        ) : (
          <div className="space-y-3 text-sm text-gray-700">
            <p>
              Vazifalarni Telegramda ham olish uchun botni oching
              {profile.telegram.botUsername ? (
                <>
                  {" "}
                  <a
                    className="font-semibold text-teal-700 underline"
                    href={`https://t.me/${profile.telegram.botUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    @{profile.telegram.botUsername}
                  </a>
                </>
              ) : (
                " (bot nomini menejerdan soʻrang)"
              )}{" "}
              va quyidagi buyruqni yuboring:
            </p>
            {linkCommand ? (
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-lg bg-gray-100 px-3 py-2 font-mono text-sm text-gray-800">{linkCommand}</code>
                <button type="button" onClick={() => void copy(linkCommand)} className={BTN_GHOST}>
                  {copied ? "Nusxalandi ✓" : "Nusxalash"}
                </button>
              </div>
            ) : (
              <p className="text-amber-700">Profilingizda telefon raqami yoʻq. Menejerga murojaat qiling.</p>
            )}
          </div>
        )}
      </Card>

      <Card
        title="Push bildirishnomalar"
        action={
          profile.push.devices > 0 ? (
            <Pill className="bg-green-100 text-green-700">✅ Faol</Pill>
          ) : (
            <Pill className="bg-amber-100 text-amber-700">Ulanmagan</Pill>
          )
        }
      >
        <p className="text-sm text-gray-600">
          {profile.push.devices > 0
            ? `${profile.push.devices} ta qurilma ulangan.`
            : "Bildirishnomalarni olish uchun MedCare Android ilovasida bildirishnomalarga ruxsat bering."}
        </p>
      </Card>

      <button
        type="button"
        onClick={() => void logout()}
        disabled={loggingOut}
        className="min-h-12 w-full rounded-2xl border border-red-200 bg-white px-4 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
      >
        {loggingOut ? "Chiqilmoqda..." : "Chiqish"}
      </button>
    </div>
  );
}
