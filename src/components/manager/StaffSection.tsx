"use client";

import { useCallback, useEffect, useState } from "react";
import TerritoryPicker from "@/components/TerritoryPicker";
import { Card, Empty, Pill, INPUT, BTN_PRIMARY, BTN_GHOST } from "@/components/patient-detail/ui";
import { formatUzPhone } from "@/lib/phone";
import type { NurseSummary } from "@/types/db";

interface Doctor {
  id: string;
  full_name: string;
  created_at: string;
}

interface Credentials {
  name: string;
  email?: string;
  password: string;
}

const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

// 10 characters, no look-alikes (0/O, 1/l/I), from the browser's CSPRNG.
function newPassword() {
  const bytes = new Uint32Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join("");
}

function CopyButton({ text, label = "Nusxalash" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          // clipboard can be blocked (insecure origin) — the value stays visible to copy by hand
        }
      }}
      className="min-h-11 shrink-0 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-teal-700 hover:bg-teal-50"
    >
      {done ? "Nusxalandi ✓" : label}
    </button>
  );
}

function CredentialsBanner({ creds, onClose }: { creds: Credentials; onClose: () => void }) {
  return (
    <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <p className="text-sm font-bold text-emerald-900">{creds.name} uchun kirish maʼlumotlari</p>
      <p className="mt-0.5 text-xs text-emerald-800">Parol faqat hozir koʻrsatiladi — saqlab qoʻying va hamshiraga bering.</p>
      <div className="mt-3 space-y-2">
        {creds.email && (
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2.5 text-sm">{creds.email}</code>
            <CopyButton text={creds.email} />
          </div>
        )}
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2.5 font-mono text-sm tracking-wider">{creds.password}</code>
          <CopyButton text={creds.password} />
        </div>
      </div>
      <button type="button" onClick={onClose} className="mt-3 min-h-11 text-sm font-semibold text-emerald-800 underline">
        Yopish
      </button>
    </div>
  );
}

interface FormState {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  tuman: string;
  territoryIds: string[];
}

const emptyForm = (): FormState => ({ fullName: "", phone: "", email: "", password: newPassword(), tuman: "", territoryIds: [] });

function NurseForm({
  nurse,
  onDone,
  onCancel,
}: {
  nurse: NurseSummary | null;
  onDone: (result: { creds?: Credentials }) => void;
  onCancel: () => void;
}) {
  const editing = Boolean(nurse);
  const [form, setForm] = useState<FormState>(() =>
    nurse
      ? {
          fullName: nurse.full_name,
          phone: nurse.phone ? formatUzPhone(nurse.phone) : "",
          email: nurse.email ?? "",
          password: "",
          tuman: nurse.tuman,
          territoryIds: nurse.territories.map((t) => t.id),
        }
      : emptyForm(),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // After the first load of a new tuman's list, preselect every mahalla — the manager unticks what doesn't apply.
  const [autoSelected, setAutoSelected] = useState<string | null>(editing ? nurse!.tuman : null);
  useEffect(() => {
    if (!form.tuman || autoSelected === form.tuman) return;
    let cancelled = false;
    fetch(`/api/territories?tuman=${encodeURIComponent(form.tuman)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json: { villages?: { id: string }[] }) => {
        if (cancelled) return;
        setAutoSelected(form.tuman);
        setForm((f) => (f.tuman === form.tuman ? { ...f, territoryIds: (json.villages ?? []).map((v) => v.id) } : f));
      })
      .catch(() => {
        // picker shows its own error state
      });
    return () => {
      cancelled = true;
    };
  }, [form.tuman, autoSelected]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch(editing ? `/api/nurses/${nurse!.id}` : "/api/nurses", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing
            ? { fullName: form.fullName, phone: form.phone || null, tuman: form.tuman, territoryIds: form.territoryIds }
            : { fullName: form.fullName, phone: form.phone, email: form.email, password: form.password, tuman: form.tuman, territoryIds: form.territoryIds },
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Saqlab boʻlmadi");
      onDone(editing ? {} : { creds: { name: form.fullName, email: json.credentials?.email ?? form.email, password: json.credentials?.password ?? form.password } });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-teal-100 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="text-base font-bold text-gray-900">{editing ? "Hamshirani tahrirlash" : "Yangi hamshira qoʻshish"}</h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
          Toʻliq ism
          <input required className={INPUT} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Masalan: Gulnora Karimova" autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
          Telefon
          <input
            type="tel"
            inputMode="tel"
            className={INPUT}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: formatUzPhone(e.target.value) })}
            placeholder="+998 90 123 45 67"
          />
        </label>
        {!editing && (
          <>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
              Email (login)
              <input required type="email" className={INPUT} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="hamshira@example.uz" autoComplete="off" />
            </label>
            <div className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
              Vaqtinchalik parol
              <div className="flex gap-2">
                <input
                  readOnly
                  type={showPassword ? "text" : "password"}
                  className={`${INPUT} font-mono tracking-wider`}
                  value={form.password}
                  aria-label="Vaqtinchalik parol"
                />
                <button type="button" onClick={() => setShowPassword((s) => !s)} className="min-h-11 shrink-0 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                  {showPassword ? "Yashirish" : "Koʻrsatish"}
                </button>
                <CopyButton text={form.password} />
              </div>
              <button type="button" onClick={() => setForm({ ...form, password: newPassword() })} className="self-start text-xs font-semibold text-teal-700 hover:underline">
                Yangi parol yaratish
              </button>
            </div>
          </>
        )}
      </div>

      <TerritoryPicker
        multiple
        required
        tuman={form.tuman}
        onTumanChange={(tuman) => setForm((f) => ({ ...f, tuman }))}
        villageIds={form.territoryIds}
        onVillagesChange={(ids) => setForm((f) => ({ ...f, territoryIds: ids }))}
        tumanLabel="Xizmat koʻrsatadigan tuman"
        disabled={pending}
      />

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending || !form.tuman || form.territoryIds.length === 0} className={BTN_PRIMARY}>
          {pending ? "Saqlanmoqda..." : editing ? "Saqlash" : "Hamshira yaratish"}
        </button>
        <button type="button" onClick={onCancel} disabled={pending} className={BTN_GHOST}>
          Bekor qilish
        </button>
      </div>
    </form>
  );
}

export default function StaffSection() {
  const [nurses, setNurses] = useState<NurseSummary[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [migrated, setMigrated] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"list" | "create" | { edit: NurseSummary }>("list");
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [n, d] = await Promise.all([
        fetch("/api/nurses", { cache: "no-store" }),
        fetch("/api/manager/doctors", { cache: "no-store" }),
      ]);
      const nj = await n.json();
      if (!n.ok) throw new Error(nj.error ?? "Xodimlarni yuklab boʻlmadi");
      setNurses(nj.nurses ?? []);
      setMigrated(nj.migrated !== false);
      if (d.ok) setDoctors((await d.json()).doctors ?? []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
  }, [load]);

  async function patchNurse(nurse: NurseSummary, body: Record<string, unknown>) {
    setBusyId(nurse.id);
    setRowError(null);
    try {
      const res = await fetch(`/api/nurses/${nurse.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Amalni bajarib boʻlmadi");
      if (json.credentials?.password) setCreds({ name: nurse.full_name, password: json.credentials.password, email: nurse.email ?? undefined });
      await load();
    } catch (err) {
      setRowError(`${nurse.full_name}: ${(err as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

  if (mode === "create" || (typeof mode === "object" && "edit" in mode)) {
    return (
      <NurseForm
        key={typeof mode === "object" ? mode.edit.id : "new"}
        nurse={typeof mode === "object" ? mode.edit : null}
        onCancel={() => setMode("list")}
        onDone={(r) => {
          setMode("list");
          if (r.creds) setCreds(r.creds);
          void load();
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      {creds && <CredentialsBanner creds={creds} onClose={() => setCreds(null)} />}
      {!migrated && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Maʼlumotlar bazasi yangilanmagan — <code>migration_008_polish.sql</code> ni Supabase SQL Editor&apos;da ishga tushiring.
        </p>
      )}

      <Card
        title={`Hamshiralar (${nurses.length})`}
        action={
          <button type="button" onClick={() => setMode("create")} className={BTN_PRIMARY}>
            + Hamshira qoʻshish
          </button>
        }
      >
        {loading ? (
          <p className="py-8 text-center text-sm text-gray-400">Yuklanmoqda...</p>
        ) : error ? (
          <p className="rounded-xl bg-red-50 px-3 py-3 text-sm text-red-700">{error}</p>
        ) : nurses.length === 0 ? (
          <Empty icon="🩺" text="Hozircha hamshira yoʻq. Birinchi hamshirani qoʻshing." />
        ) : (
          <ul className="divide-y divide-gray-100">
            {nurses.map((n) => {
              const busy = busyId === n.id;
              const villages = n.territories.map((t) => t.village);
              return (
                <li key={n.id} className={`py-4 ${n.is_active ? "" : "opacity-70"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-gray-900">
                        {n.full_name}
                        <Pill className={n.is_active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}>{n.is_active ? "Faol" : "Nofaol"}</Pill>
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {n.phone ?? "Telefon yoʻq"} · {n.email ?? "Email yoʻq"}
                      </p>
                      <p className="mt-1 text-sm text-gray-700">
                        <span className="font-medium">{n.tuman}</span>
                        {villages.length > 0 ? (
                          <span className="text-gray-500">
                            {" — "}
                            {villages.slice(0, 4).join(", ")}
                            {villages.length > 4 && ` va yana ${villages.length - 4} ta`}
                          </span>
                        ) : (
                          <span className="text-amber-600"> — mahalla biriktirilmagan</span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Faol bemorlar: <strong className="text-gray-800">{n.active_patients}</strong>
                        {villages.length > 0 && <> · Mahallalar: <strong className="text-gray-800">{villages.length}</strong></>}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy} onClick={() => { setRowError(null); setMode({ edit: n }); }} className={BTN_GHOST}>
                        Tahrirlash
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`${n.full_name} uchun yangi vaqtinchalik parol yaratilsinmi? Eski parol ishlamay qoladi.`)) {
                            void patchNurse(n, { resetPassword: true });
                          }
                        }}
                        className={BTN_GHOST}
                      >
                        Parolni tiklash
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (!n.is_active || window.confirm(`${n.full_name} nofaol qilinsinmi? U tizimga kira olmaydi va yangi bemorlar unga biriktirilmaydi.`)) {
                            void patchNurse(n, { isActive: !n.is_active });
                          }
                        }}
                        className={`${BTN_GHOST} ${n.is_active ? "text-red-600" : "text-teal-700"}`}
                      >
                        {n.is_active ? "Nofaol qilish" : "Faollashtirish"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {rowError && (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {rowError}
          </p>
        )}
      </Card>

      <Card title={`Shifokorlar (${doctors.length})`}>
        {doctors.length === 0 ? (
          <Empty icon="👨‍⚕️" text="Shifokorlar topilmadi" />
        ) : (
          <ul className="divide-y divide-gray-100">
            {doctors.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="font-medium text-gray-800">{d.full_name}</span>
                <span className="text-xs text-gray-400">Qoʻshilgan: {new Date(d.created_at).toLocaleDateString("uz-UZ")}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
