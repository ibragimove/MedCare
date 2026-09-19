import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NurseProfileResponse } from "@/types/nurse";

// GET /api/nurse/profile — the signed-in nurse's own profile (read-only).
export async function GET() {
  const { user, response: authErr } = await requireRole("nurse");
  if (authErr) return authErr;

  const supabase = createAdminClient();
  const [nurseRes, profileRes, terrRes, devicesRes] = await Promise.all([
    supabase.from("nurses").select("*").eq("id", user!.id).maybeSingle(),
    supabase.from("profiles").select("full_name, phone, telegram_chat_id").eq("id", user!.id).maybeSingle(),
    supabase.from("nurse_territories").select("territories(village)").eq("nurse_id", user!.id),
    supabase.from("device_tokens").select("id", { count: "exact", head: true }).eq("profile_id", user!.id),
  ]);

  const nurse = nurseRes.data as Record<string, unknown> | null;
  const profile = profileRes.data;

  const territories = (terrRes.data ?? []) as unknown as Array<{
    territories: { village: string } | { village: string }[] | null;
  }>;
  const villages = territories
    .map((row) => (Array.isArray(row.territories) ? row.territories[0] : row.territories)?.village)
    .filter((v): v is string => Boolean(v))
    .sort((a, b) => a.localeCompare(b, "uz"));
  // Legacy nurses have a single free-text village instead of territory links.
  if (villages.length === 0 && typeof nurse?.village === "string" && nurse.village) villages.push(nurse.village);

  const phone = (profile?.phone as string | null | undefined) ?? (nurse?.phone as string | null | undefined) ?? null;

  const body: NurseProfileResponse = {
    full_name:
      (profile?.full_name as string | undefined) ??
      (nurse?.full_name as string | undefined) ??
      (user!.user_metadata?.full_name as string | undefined) ??
      "Hamshira",
    email: user!.email ?? null,
    phone,
    tuman: (nurse?.tuman as string | undefined) ?? "",
    villages,
    telegram: {
      connected: Boolean(profile?.telegram_chat_id),
      linkPhone: phone,
      botUsername: process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") || null,
    },
    push: { devices: devicesRes.count ?? 0 },
  };
  return NextResponse.json(body);
}
