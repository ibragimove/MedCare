import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAnyRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { SETTING_KEYS, SETTING_SPECS, type SettingKey } from "@/lib/settings-spec";

const KEYS = SETTING_KEYS;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

// GET /api/manager/settings → { settings: Record<key, string> } (defaults fill missing rows)
export async function GET() {
  const { response: authError } = await requireAnyRole(["manager", "admin"]);
  if (authError) return authError;

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("settings").select("key, value").in("key", KEYS);
  if (error) return NextResponse.json({ error: "Sozlamalarni yuklab boʻlmadi" }, { status: 500 });

  const settings = Object.fromEntries(KEYS.map((k) => [k, SETTING_SPECS[k].fallback])) as Record<SettingKey, string>;
  for (const row of data ?? []) settings[row.key as SettingKey] = row.value;
  return NextResponse.json({ settings }, { headers: { "Cache-Control": "no-store" } });
}

// PATCH /api/manager/settings { key: value, … } — validated, upserted, audited.
export async function PATCH(request: Request) {
  const { user, response: authError } = await requireAnyRole(["manager", "admin"]);
  if (authError) return authError;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Notoʻgʻri soʻrov" }, { status: 400 });

  const changes: { key: SettingKey; value: string }[] = [];
  for (const [key, raw] of Object.entries(body)) {
    if (!KEYS.includes(key as SettingKey)) return NextResponse.json({ error: `Nomaʼlum sozlama: ${key}` }, { status: 400 });
    const spec = SETTING_SPECS[key as SettingKey];
    const num = typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
    if (!Number.isFinite(num) || String(raw).trim() === "") {
      return NextResponse.json({ error: `${spec.label}: son kiriting` }, { status: 400 });
    }
    if (num < spec.min || num > spec.max) {
      return NextResponse.json({ error: `${spec.label}: ${spec.min} dan ${spec.max} gacha boʻlishi kerak` }, { status: 400 });
    }
    if (spec.integer && !Number.isInteger(num)) {
      return NextResponse.json({ error: `${spec.label}: butun son kiriting` }, { status: 400 });
    }
    changes.push({ key: key as SettingKey, value: String(num) });
  }
  if (changes.length === 0) return NextResponse.json({ error: "Oʻzgartirish kiritilmadi" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: before } = await supabase.from("settings").select("key, value").in("key", changes.map((c) => c.key));
  const previous = new Map((before ?? []).map((r) => [r.key as string, r.value as string]));

  const { error } = await supabase
    .from("settings")
    .upsert(changes.map((c) => ({ ...c, updated_at: new Date().toISOString() })), { onConflict: "key" });
  if (error) return NextResponse.json({ error: "Saqlab boʻlmadi. Qayta urinib koʻring" }, { status: 500 });

  for (const c of changes) {
    if (previous.get(c.key) === c.value) continue;
    await writeAudit(supabase, {
      actorId: user!.id,
      action: "settings.updated",
      entityType: "settings",
      entityId: NIL_UUID,
      meta: { key: c.key, from: previous.get(c.key) ?? SETTING_SPECS[c.key].fallback, to: c.value },
    });
  }
  return NextResponse.json({ ok: true });
}
