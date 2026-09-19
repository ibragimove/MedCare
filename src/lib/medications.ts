// Pure helpers for multi-drug patients (no server-only imports: the form validates with them too).
import type { MedicationPlan, MedicationPlanItem } from "@/types/db";

export interface MedicationInput {
  drugName: string;
  dosage: string;
  timesPerDay?: number | null;
  durationDays?: number | null;
  note?: string | null;
}

export const MAX_MEDICATIONS = 10;

const TIMES_BY_FREQUENCY: Record<number, string[]> = {
  1: ["08:00"],
  2: ["08:00", "20:00"],
  3: ["08:00", "14:00", "20:00"],
  4: ["08:00", "12:00", "16:00", "20:00"],
};

const key = (s: string) => s.trim().toLocaleLowerCase("uz");

export function timesForFrequency(timesPerDay: number | null | undefined): string[] {
  return TIMES_BY_FREQUENCY[timesPerDay ?? 1] ?? TIMES_BY_FREQUENCY[1];
}

// "ovqatdan keyin / ovqat bilan" → true, "ovqatdan oldin / och qoringa" → false, otherwise unknown.
function foodFromNote(note: string | null | undefined): boolean | null {
  if (!note) return null;
  const n = note.toLocaleLowerCase("uz");
  if (/(ovqat(dan)?\s*(keyin|bilan|paytida)|ovqatlanish(dan)?\s*(keyin|bilan))/.test(n)) return true;
  if (/(ovqat(dan)?\s*oldin|och\s*qoringa|och\s*qoʻrsoq)/.test(n)) return false;
  return null;
}

export function validateMedications(
  raw: unknown,
): { ok: true; medications: MedicationInput[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "Kamida bitta dori kiriting" };
  if (raw.length > MAX_MEDICATIONS) return { ok: false, error: `Dorilar soni ${MAX_MEDICATIONS} tadan oshmasligi kerak` };

  const seen = new Set<string>();
  const medications: MedicationInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i] as Partial<MedicationInput>;
    const drugName = String(m.drugName ?? "").trim();
    const dosage = String(m.dosage ?? "").trim();
    const row = `${i + 1}-dori`;
    if (!drugName) return { ok: false, error: `${row}: dori nomini kiriting` };
    if (!dosage) return { ok: false, error: `${row}: dozasini kiriting` };
    if (seen.has(key(drugName))) return { ok: false, error: `"${drugName}" dori ikki marta kiritilgan` };
    seen.add(key(drugName));

    const timesPerDay = m.timesPerDay == null || (m.timesPerDay as unknown) === "" ? null : Number(m.timesPerDay);
    if (timesPerDay !== null && (!Number.isInteger(timesPerDay) || timesPerDay < 1 || timesPerDay > 4)) {
      return { ok: false, error: `${row}: kuniga 1 dan 4 martagacha boʻlishi kerak` };
    }
    const durationDays = m.durationDays == null || (m.durationDays as unknown) === "" ? null : Number(m.durationDays);
    if (durationDays !== null && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365)) {
      return { ok: false, error: `${row}: davomiyligi 1 dan 365 kungacha boʻlishi kerak` };
    }
    medications.push({
      drugName,
      dosage,
      timesPerDay,
      durationDays,
      note: String(m.note ?? "").trim() || null,
    });
  }
  return { ok: true, medications };
}

// Legacy screens still read patients.drug_name / dosage: keep them as joined lists.
export function joinedDrugNames(meds: MedicationInput[]): string {
  return meds.map((m) => m.drugName).join(", ");
}
export function joinedDosages(meds: MedicationInput[]): string {
  return meds.map((m) => m.dosage).join(", ");
}

// One item per drug built only from what the doctor typed — used when the AI is unavailable.
export function fallbackPlanItem(med: MedicationInput, expectedDays: number): MedicationPlanItem {
  return {
    drug: med.drugName,
    dosage: med.dosage,
    times: timesForFrequency(med.timesPerDay),
    withFood: foodFromNote(med.note) ?? false,
    durationDays: med.durationDays ?? expectedDays,
    instructions: med.note ?? "Shifokor koʻrsatmasiga muvofiq qabul qiling.",
  };
}

export function fallbackPlan(meds: MedicationInput[], expectedDays: number): MedicationPlan {
  return {
    items: meds.map((m) => fallbackPlanItem(m, expectedDays)),
    generalAdvice:
      meds.length > 1
        ? "Dorilarni shifokor belgilagan vaqtlarda qabul qiling. Bir nechta dori birga ichilayotgani uchun qoʻshimcha savollaringiz boʻlsa, shifokor yoki hamshiraga murojaat qiling."
        : "Dorini shifokor belgilagan vaqtlarda qabul qiling.",
  };
}

// AI output is advisory: the doctor's own values always win, and one bad AI item falls back
// to the deterministic item instead of failing the plan.
export function mergePlan(
  meds: MedicationInput[],
  expectedDays: number,
  ai: Partial<MedicationPlan> | null | undefined,
): MedicationPlan {
  const aiItems = Array.isArray(ai?.items) ? (ai!.items as Partial<MedicationPlanItem>[]) : [];
  const items = meds.map((med, i) => {
    const base = fallbackPlanItem(med, expectedDays);
    const found = aiItems.find((a) => a?.drug && key(a.drug) === key(med.drugName)) ?? aiItems[i];
    if (!found) return base;

    const aiTimes = Array.isArray(found.times)
      ? found.times.filter((t): t is string => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t))
      : [];
    const times = med.timesPerDay ? base.times : aiTimes.length > 0 ? aiTimes : base.times;
    const noteFood = foodFromNote(med.note);
    return {
      drug: med.drugName,
      dosage: med.dosage,
      times,
      withFood: noteFood ?? (typeof found.withFood === "boolean" ? found.withFood : base.withFood),
      durationDays: med.durationDays ?? base.durationDays,
      instructions: med.note ?? (found.instructions?.trim() || base.instructions),
    } satisfies MedicationPlanItem;
  });

  const advice = ai?.generalAdvice?.trim();
  return { items, generalAdvice: advice || fallbackPlan(meds, expectedDays).generalAdvice };
}
