import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAnyRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { validateTerritories, joinVillages, generatePassword } from "@/lib/nurses";
import { isMissingSchema, MIGRATION_HINT } from "@/lib/db-errors";
import { normalizeUzPhone } from "@/lib/phone";

// PATCH /api/nurses/[id] — manager/admin edits a nurse, (de)activates her, or resets her password.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response: authError } = await requireAnyRole(["manager", "admin"]);
  if (authError) return authError;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    fullName?: string;
    phone?: string | null;
    tuman?: string;
    territoryIds?: string[];
    isActive?: boolean;
    resetPassword?: boolean;
  };

  const supabase = createAdminClient();
  const { data: existing, error: findError } = await supabase
    .from("nurses")
    .select("id, full_name, tuman, village")
    .eq("id", id)
    .maybeSingle();
  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Hamshira topilmadi" }, { status: 404 });

  const updates: Record<string, unknown> = {};
  const profileUpdates: Record<string, unknown> = {};
  const actions: string[] = [];

  if (body.fullName !== undefined) {
    const name = body.fullName.trim();
    if (name.length < 3) return NextResponse.json({ error: "Toʻliq ismni kiriting" }, { status: 400 });
    updates.full_name = name;
    profileUpdates.full_name = name;
    actions.push("edited");
  }

  if (body.phone !== undefined) {
    const raw = body.phone?.trim() ?? "";
    const phone = raw ? normalizeUzPhone(raw) : null;
    if (raw && !phone) {
      return NextResponse.json({ error: "Telefon raqami toʻliq emas (+998 XX XXX XX XX)" }, { status: 400 });
    }
    updates.phone = phone;
    profileUpdates.phone = phone;
    actions.push("edited");
  }

  let newTerritoryIds: string[] | null = null;
  if (body.territoryIds !== undefined || body.tuman !== undefined) {
    const tuman = (body.tuman ?? existing.tuman).trim();
    const ids = body.territoryIds ?? [];
    if (!tuman) return NextResponse.json({ error: "Tumanni tanlang" }, { status: 400 });
    if (ids.length === 0) return NextResponse.json({ error: "Kamida bitta mahallani tanlang" }, { status: 400 });
    const checked = await validateTerritories(supabase, tuman, ids);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    updates.tuman = tuman;
    updates.village = joinVillages(tuman, checked.villages);
    profileUpdates.village = updates.village;
    newTerritoryIds = [...new Set(ids)];
    actions.push("territories");
  }

  if (body.isActive !== undefined) {
    updates.is_active = body.isActive;
    actions.push(body.isActive ? "activated" : "deactivated");
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("nurses").update(updates).eq("id", id);
    if (error) {
      return NextResponse.json(
        { error: isMissingSchema(error) ? MIGRATION_HINT : "Saqlab boʻlmadi. Qayta urinib koʻring" },
        { status: isMissingSchema(error) ? 503 : 500 },
      );
    }
    if (Object.keys(profileUpdates).length > 0) {
      await supabase.from("profiles").update(profileUpdates).eq("id", id);
    }
  }

  if (newTerritoryIds) {
    const { error: delError } = await supabase.from("nurse_territories").delete().eq("nurse_id", id);
    if (delError) {
      return NextResponse.json(
        { error: isMissingSchema(delError) ? MIGRATION_HINT : "Mahallalarni yangilab boʻlmadi" },
        { status: isMissingSchema(delError) ? 503 : 500 },
      );
    }
    const { error: insError } = await supabase
      .from("nurse_territories")
      .insert(newTerritoryIds.map((territory_id) => ({ nurse_id: id, territory_id })));
    if (insError) return NextResponse.json({ error: "Mahallalarni yangilab boʻlmadi" }, { status: 500 });
  }

  // Deactivated nurses must not be able to sign in either.
  if (body.isActive !== undefined) {
    await supabase.auth.admin.updateUserById(id, { ban_duration: body.isActive ? "none" : "876000h" });
  }
  if (body.fullName !== undefined) {
    await supabase.auth.admin.updateUserById(id, {
      user_metadata: { role: "nurse", full_name: updates.full_name },
    });
  }

  let credentials: { password: string } | undefined;
  if (body.resetPassword) {
    const password = generatePassword();
    const { error } = await supabase.auth.admin.updateUserById(id, { password });
    if (error) {
      return NextResponse.json(
        { error: "Hamshira hisobi topilmadi — bu hamshira hali tizimga kira olmaydi" },
        { status: 409 },
      );
    }
    credentials = { password };
    actions.push("password_reset");
  }

  if (actions.length === 0) return NextResponse.json({ error: "Oʻzgartirish kiritilmadi" }, { status: 400 });

  await writeAudit(supabase, {
    actorId: user!.id,
    action: `nurse.${actions[0]}`,
    entityType: "nurses",
    entityId: id,
    meta: { actions },
  });

  return NextResponse.json({ ok: true, credentials });
}
