"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

const DEMO_ACCOUNTS = [
  { role: "Shifokor", icon: "🩺", email: "shifokor@demo.uz", color: "from-blue-500 to-blue-600" },
  { role: "Hamshira", icon: "💊", email: "hamshira@demo.uz", color: "from-teal-500 to-teal-600" },
  { role: "Bemor", icon: "🏥", email: "bemor@demo.uz", color: "from-violet-500 to-violet-600" },
  { role: "Menejer", icon: "📊", email: "menejer@demo.uz", color: "from-orange-500 to-orange-600" },
];

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError("Email yoki parol notoʻgʻri");
      setSubmitting(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const role = user?.user_metadata?.role as string | undefined;
    router.push(
      role === "nurse" ? "/nurse"
      : role === "patient" ? "/patient"
      : role === "manager" ? "/manager"
      : role === "admin" ? "/admin"
      : "/doctor"
    );
    router.refresh();
  }

  function quickLogin(acc: typeof DEMO_ACCOUNTS[0]) {
    setEmail(acc.email);
    setPassword("Demo1234!");
  }

  return (
    <main
      className="flex min-h-screen flex-col bg-gradient-to-br from-teal-900 via-teal-700 to-cyan-500"
      style={{ paddingTop: "var(--safe-area-inset-top, 0px)" }}
    >
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-white p-2.5 shadow-xl">
            <Image src="/logo.png" alt="MedCare" width={60} height={60} className="h-full w-full object-contain" priority />
          </div>
          <h1 className="text-2xl font-bold text-white">MedCare</h1>
          <p className="mt-1 text-sm text-teal-200">Aktiv Patronaj Tizimi — Xorazm viloyati</p>
        </div>

        {/* Login card */}
        <div className="w-full max-w-sm">
          <div className="rounded-3xl bg-white/95 p-7 shadow-2xl backdrop-blur-sm">
            <h2 className="mb-5 text-xl font-bold text-gray-800">Tizimga kirish</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
                <input
                  required
                  type="email"
                  autoComplete="username"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@demo.uz"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Parol</label>
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-gradient-to-r from-teal-600 to-cyan-500 px-4 py-3 font-semibold text-white shadow-md transition hover:from-teal-700 hover:to-cyan-600 disabled:opacity-60"
              >
                {submitting ? "Kirilmoqda..." : "Kirish →"}
              </button>
            </form>
          </div>

          {/* Demo accounts */}
          <div className="mt-4 rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-teal-200">
              Demo hisoblar — bosing va kiring
            </p>
            <div className="space-y-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  onClick={() => quickLogin(acc)}
                  className="flex w-full items-center gap-3 rounded-xl bg-white/10 px-4 py-2.5 text-left transition hover:bg-white/20"
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-sm ${acc.color} text-white`}>
                    {acc.icon}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{acc.role}</p>
                    <p className="text-xs text-teal-200">{acc.email}</p>
                  </div>
                  <span className="ml-auto text-xs text-teal-300">→</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-teal-300">Parol: Demo1234!</p>
          </div>
        </div>
      </div>
    </main>
  );
}
