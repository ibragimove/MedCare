"use client";

import { useEffect, useState } from "react";
import { Card, INPUT, BTN_PRIMARY } from "@/components/patient-detail/ui";
import { SETTING_KEYS, SETTING_SPECS, type SettingKey } from "@/lib/settings-spec";

type Values = Record<SettingKey, string>;

// Same rules as the API, so the manager sees the problem before submitting.
function validate(key: SettingKey, raw: string): string | null {
  const spec = SETTING_SPECS[key];
  const num = Number(raw.trim().replace(",", "."));
  if (raw.trim() === "" || !Number.isFinite(num)) return "Son kiriting";
  if (num < spec.min || num > spec.max) return `${spec.min} dan ${spec.max} gacha boʻlishi kerak`;
  if (spec.integer && !Number.isInteger(num)) return "Butun son kiriting";
  return null;
}

export default function SettingsSection() {
  const [saved, setSaved] = useState<Values | null>(null);
  const [values, setValues] = useState<Values | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/manager/settings", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Sozlamalarni yuklab boʻlmadi");
        setSaved(json.settings);
        setValues(json.settings);
      })
      .catch((err: Error) => setLoadError(err.message));
  }, []);

  if (loadError) return <p className="rounded-2xl bg-red-50 p-5 text-sm text-red-700">{loadError}</p>;
  if (!values || !saved) return <p className="py-16 text-center text-sm text-gray-400">Yuklanmoqda...</p>;

  const errors = Object.fromEntries(SETTING_KEYS.map((k) => [k, validate(k, values[k])])) as Record<SettingKey, string | null>;
  const changed = SETTING_KEYS.filter((k) => values[k].trim() !== saved[k]);
  const invalid = SETTING_KEYS.some((k) => errors[k]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pending || invalid || changed.length === 0 || !values || !saved) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/manager/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(changed.map((k) => [k, values[k].trim()]))),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Saqlab boʻlmadi");
      setSaved({ ...saved, ...Object.fromEntries(changed.map((k) => [k, String(Number(values[k].trim().replace(",", ".")))])) });
      setValues((v) => (v ? { ...v, ...Object.fromEntries(changed.map((k) => [k, String(Number(v[k].trim().replace(",", ".")))])) } : v));
      setNotice("Sozlamalar saqlandi ✅ Yangi qiymatlar keyingi vazifalarga qoʻllanadi.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  const group = (title: string, keys: SettingKey[]) => (
    <Card title={title}>
      <div className="grid gap-4 sm:grid-cols-2">
        {keys.map((k) => (
          <label key={k} className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
            {SETTING_SPECS[k].label}
            <input
              inputMode="decimal"
              className={`${INPUT} ${errors[k] ? "border-red-300 bg-red-50" : ""}`}
              value={values[k]}
              onChange={(e) => {
                setNotice(null);
                setValues({ ...values, [k]: e.target.value });
              }}
            />
            {errors[k] ? (
              <span className="text-xs font-normal text-red-600">{errors[k]}</span>
            ) : (
              <span className="text-xs font-normal text-gray-400">{SETTING_SPECS[k].hint}</span>
            )}
          </label>
        ))}
      </div>
    </Card>
  );

  return (
    <form onSubmit={save} className="space-y-5">
      {group("SLA muddatlari", ["sla_routine_hours", "sla_urgent_hours", "sla_critical_hours", "sla_time_scale"])}
      {group("Tasdiqlash va tekshiruv", ["otp_expiry_minutes", "random_verify_percent"])}
      {notice && <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</p>}
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={pending || invalid || changed.length === 0} className={BTN_PRIMARY}>
        {pending ? "Saqlanmoqda..." : changed.length > 0 ? `Saqlash (${changed.length})` : "Saqlash"}
      </button>
    </form>
  );
}
