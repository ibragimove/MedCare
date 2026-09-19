"use client";

import { useMemo, useState } from "react";
import TerritoryPicker from "@/components/TerritoryPicker";
import { pickNurseFor } from "@/lib/nurse-routing";
import { MAX_MEDICATIONS, validateMedications } from "@/lib/medications";
import { formatUzPhone } from "@/lib/phone";
import type { NurseSummary } from "@/types/db";

const FIELD =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100";

interface MedRow {
  key: number;
  drugName: string;
  dosage: string;
  timesPerDay: string;
  durationDays: string;
  note: string;
}

let rowKey = 0;
const newRow = (): MedRow => ({ key: ++rowKey, drugName: "", dosage: "", timesPerDay: "", durationDays: "", note: "" });

interface PatientFormProps {
  nurses: NurseSummary[];
  onCreated: (notice: string | null) => void;
  onCancel: () => void;
}

export default function PatientForm({ nurses, onCreated, onCancel }: PatientFormProps) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [expectedDays, setExpectedDays] = useState("");
  const [tuman, setTuman] = useState("");
  const [territoryId, setTerritoryId] = useState("");
  const [village, setVillage] = useState("");
  const [nurseId, setNurseId] = useState("");
  const [meds, setMeds] = useState<MedRow[]>(() => [newRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const auto = useMemo(
    () => (tuman ? pickNurseFor(nurses, { territoryId: territoryId || null, tuman, village }) : null),
    [nurses, tuman, territoryId, village],
  );
  const tumanNurses = useMemo(
    () =>
      nurses.filter(
        (n) => n.is_active && n.tuman.trim().toLocaleLowerCase("uz") === tuman.trim().toLocaleLowerCase("uz"),
      ),
    [nurses, tuman],
  );
  const chosenNurse = nurseId ? nurses.find((n) => n.id === nurseId) : null;

  const duplicateKeys = useMemo(() => {
    const seen = new Map<string, number>();
    const dup = new Set<number>();
    for (const m of meds) {
      const k = m.drugName.trim().toLocaleLowerCase("uz");
      if (!k) continue;
      const first = seen.get(k);
      if (first !== undefined) {
        dup.add(m.key);
        dup.add(first);
      } else seen.set(k, m.key);
    }
    return dup;
  }, [meds]);

  function updateMed(key: number, patch: Partial<MedRow>) {
    setMeds((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const checked = validateMedications(
      meds.map((m) => ({
        drugName: m.drugName,
        dosage: m.dosage,
        timesPerDay: m.timesPerDay ? Number(m.timesPerDay) : undefined,
        durationDays: m.durationDays ? Number(m.durationDays) : undefined,
        note: m.note,
      })),
    );
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    if (!territoryId) {
      setError("Tuman va mahallani tanlang");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          phone: phone.replace(/\D/g, "").length > 3 ? phone : undefined,
          address: address || undefined,
          diagnosis,
          expectedDays: Number(expectedDays),
          territoryId,
          nurseId: nurseId || undefined,
          medications: checked.medications,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Xatolik yuz berdi");
      onCreated((data.warning as string | undefined) ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-5 rounded-2xl border border-teal-100 bg-white p-4 shadow-md sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-500 text-sm text-white">
          🏥
        </div>
        <h2 className="text-base font-bold text-gray-800">Bemorni chiqarish</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
          Bemor F.I.Sh.
          <input required className={FIELD} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
          Telefon (ixtiyoriy)
          <input
            type="tel"
            inputMode="tel"
            className={FIELD}
            value={phone}
            onChange={(e) => setPhone(formatUzPhone(e.target.value))}
            placeholder="+998 90 123 45 67"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
          Tashxis
          <input
            required
            className={FIELD}
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            placeholder="Masalan: Qandli diabet"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
          Davolanish muddati (kun)
          <input
            required
            type="number"
            min={1}
            className={FIELD}
            value={expectedDays}
            onChange={(e) => setExpectedDays(e.target.value)}
          />
        </label>
      </div>

      <TerritoryPicker
        required
        className="mt-4"
        tuman={tuman}
        onTumanChange={(t) => {
          setTuman(t);
          setNurseId("");
        }}
        villageId={territoryId}
        onVillageChange={(id, name) => {
          setTerritoryId(id);
          setVillage(name);
          setNurseId("");
        }}
      />

      <label className="mt-4 flex flex-col gap-1.5 text-sm font-medium text-gray-700">
        Manzil (koʻcha, uy — ixtiyoriy)
        <input className={FIELD} value={address} onChange={(e) => setAddress(e.target.value)} />
      </label>

      {/* Nurse routing */}
      <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-3">
        <p className="text-xs font-semibold uppercase text-gray-500">Biriktiriladigan hamshira</p>
        {!tuman ? (
          <p className="mt-1 text-sm text-gray-500">Avval tuman va mahallani tanlang.</p>
        ) : chosenNurse ? (
          <p className="mt-1 text-sm font-medium text-teal-700">
            ✓ Qoʻlda tanlandi: {chosenNurse.full_name}
            {chosenNurse.phone ? ` · ${chosenNurse.phone}` : ""}
          </p>
        ) : auto?.nurse ? (
          <p className="mt-1 text-sm font-medium text-emerald-700">
            ✓ {auto.exact ? "Shu mahallaga xizmat qiladigan hamshira:" : "Tumandagi hamshira:"} {auto.nurse.full_name}
            {auto.nurse.phone ? ` · ${auto.nurse.phone}` : ""}
          </p>
        ) : (
          <p className="mt-1 text-sm font-medium text-amber-700">
            ⚠️ Bu hudud uchun hamshira biriktirilmagan. Bemor keyin menejer tomonidan biriktiriladi.
          </p>
        )}
        {tuman && tumanNurses.length > 0 && (
          <label className="mt-2 flex flex-col gap-1 text-xs font-medium text-gray-600">
            Boshqa hamshirani tanlash (ixtiyoriy)
            <select className={FIELD} value={nurseId} onChange={(e) => setNurseId(e.target.value)}>
              <option value="">Avtomatik</option>
              {tumanNurses.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.full_name} — {n.active_patients} ta bemor
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Medications */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-800">
            Dorilar{" "}
            <span className="ml-1 rounded-full bg-teal-100 px-2 py-0.5 text-xs text-teal-700">{meds.length}</span>
          </h3>
          <button
            type="button"
            disabled={meds.length >= MAX_MEDICATIONS}
            onClick={() => setMeds((rows) => [...rows, newRow()])}
            className="min-h-10 rounded-xl border border-teal-200 bg-teal-50 px-3 text-sm font-semibold text-teal-700 transition hover:bg-teal-100 disabled:opacity-50"
          >
            + Dori qoʻshish
          </button>
        </div>

        <div className="space-y-3">
          {meds.map((m, index) => (
            <div key={m.key} className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-gray-500">{index + 1}-dori</span>
                {meds.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setMeds((rows) => rows.filter((r) => r.key !== m.key))}
                    className="min-h-9 rounded-lg px-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                    aria-label={`${index + 1}-dorini oʻchirish`}
                  >
                    ✕ Oʻchirish
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                  Dori nomi
                  <input
                    required
                    className={`${FIELD} ${duplicateKeys.has(m.key) ? "border-red-300" : ""}`}
                    value={m.drugName}
                    onChange={(e) => updateMed(m.key, { drugName: e.target.value })}
                    placeholder="Masalan: Metformin"
                  />
                  {duplicateKeys.has(m.key) && <span className="text-red-600">Bu dori roʻyxatda takrorlangan</span>}
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                  Dozasi
                  <input
                    required
                    className={FIELD}
                    value={m.dosage}
                    onChange={(e) => updateMed(m.key, { dosage: e.target.value })}
                    placeholder="500 mg"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                  Kuniga necha marta
                  <select
                    className={FIELD}
                    value={m.timesPerDay}
                    onChange={(e) => updateMed(m.key, { timesPerDay: e.target.value })}
                  >
                    <option value="">AI belgilaydi</option>
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n} marta
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                  Davomiyligi (kun)
                  <input
                    type="number"
                    min={1}
                    max={365}
                    className={FIELD}
                    value={m.durationDays}
                    onChange={(e) => updateMed(m.key, { durationDays: e.target.value })}
                    placeholder="Umumiy muddat"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 sm:col-span-2">
                  Izoh
                  <input
                    className={FIELD}
                    value={m.note}
                    onChange={(e) => updateMed(m.key, { note: e.target.value })}
                    placeholder="Masalan: ovqatdan keyin"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-500 px-6 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-60"
        >
          {submitting ? "⏳ AI trayektoriya yaratilmoqda..." : "Chiqarish va hamshiraga biriktirish →"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="min-h-11 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
        >
          Bekor qilish
        </button>
      </div>
    </form>
  );
}
