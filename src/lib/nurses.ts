import "server-only";
import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NurseSummary } from "@/types/db";
import { isMissingSchema } from "@/lib/db-errors";

const norm = (s: string | null | undefined) => (s ?? "").trim().toLocaleLowerCase("uz");

// Nurses with their mahallas and active-patient count. Works before migration_008 is applied
// (phone/email/is_active and nurse_territories are then simply empty / defaulted).
export async function listNurses(
  supabase: SupabaseClient,
): Promise<{ nurses: NurseSummary[]; migrated: boolean }> {
  let migrated = true;
  let res: { data: unknown[] | null; error: { code?: string; message: string } | null } = await supabase
    .from("nurses")
    .select("id, full_name, tuman, village, phone, email, is_active, created_at")
    .order("tuman", { ascending: true })
    .order("full_name", { ascending: true });
  if (res.error && isMissingSchema(res.error)) {
    migrated = false;
    res = await supabase
      .from("nurses")
      .select("id, full_name, tuman, village, created_at")
      .order("tuman", { ascending: true })
      .order("full_name", { ascending: true });
  }
  if (res.error) throw new Error(res.error.message);

  const rows = (res.data ?? []) as unknown as Array<Record<string, unknown>>;

  const territoriesByNurse = new Map<string, { id: string; village: string }[]>();
  const links = await supabase
    .from("nurse_territories")
    .select("nurse_id, territories(id, village)");
  if (!links.error) {
    for (const row of (links.data ?? []) as unknown as Array<{
      nurse_id: string;
      territories: { id: string; village: string } | { id: string; village: string }[] | null;
    }>) {
      const t = Array.isArray(row.territories) ? row.territories[0] : row.territories;
      if (!t) continue;
      const list = territoriesByNurse.get(row.nurse_id) ?? [];
      list.push(t);
      territoriesByNurse.set(row.nurse_id, list);
    }
  }

  const activeCount = new Map<string, number>();
  const patients = await supabase
    .from("patients")
    .select("assigned_nurse_id")
    .is("completed_at", null)
    .not("assigned_nurse_id", "is", null);
  for (const p of patients.data ?? []) {
    const id = p.assigned_nurse_id as string;
    activeCount.set(id, (activeCount.get(id) ?? 0) + 1);
  }

  const nurses = rows.map((r) => {
    const id = r.id as string;
    return {
      id,
      full_name: r.full_name as string,
      tuman: r.tuman as string,
      village: r.village as string,
      phone: (r.phone as string | null | undefined) ?? null,
      email: (r.email as string | null | undefined) ?? null,
      is_active: (r.is_active as boolean | undefined) ?? true,
      created_at: r.created_at as string,
      territories: (territoriesByNurse.get(id) ?? []).sort((a, b) => a.village.localeCompare(b.village, "uz")),
      active_patients: activeCount.get(id) ?? 0,
    } satisfies NurseSummary;
  });

  return { nurses, migrated };
}

// Every territory id must exist and belong to `tuman`.
export async function validateTerritories(
  supabase: SupabaseClient,
  tuman: string,
  ids: string[],
): Promise<{ ok: true; villages: string[] } | { ok: false; error: string }> {
  const unique = [...new Set(ids)];
  const { data, error } = await supabase.from("territories").select("id, tuman, village").in("id", unique);
  if (error) return { ok: false, error: error.message };
  const rows = data ?? [];
  if (rows.length !== unique.length) return { ok: false, error: "Tanlangan mahallalardan biri topilmadi" };
  if (rows.some((r) => norm(r.tuman) !== norm(tuman))) {
    return { ok: false, error: "Mahallalar tanlangan tumanga tegishli emas" };
  }
  return { ok: true, villages: rows.map((r) => r.village).sort((a, b) => a.localeCompare(b, "uz")) };
}

// nurses.village is a legacy single-text column: keep it meaningful for older screens.
export function joinVillages(tuman: string, villages: string[]): string {
  if (villages.length === 0) return tuman;
  if (villages.length === 1) return villages[0];
  return `${villages.length} ta mahalla`;
}

// 10+ chars, upper + lower + digit, no look-alike characters (0/O, 1/l/I).
export function generatePassword(length = 10): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(upper), pick(lower), pick(digits)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
