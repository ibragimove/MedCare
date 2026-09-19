import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAnyRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { listNurses, validateTerritories, joinVillages, generatePassword } from "@/lib/nurses";
import { isMissingSchema, MIGRATION_HINT } from "@/lib/db-errors";
import { normalizeUzPhone } from "@/lib/phone";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// GET /api/nurses — doctors, managers and admins read the roster (with mahallas + load).
export async function GET() {
  const { response: authError } = await requireAnyRole(["doctor", "manager", "admin"]);
  if (authError) return authError;

  try {
    const { nurses, migrated } = await listNurses(createAdminClient());
    return NextResponse.json({ nurses, migrated });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST /api/nurses — manager/admin creates a nurse who can immediately log in.
export async function POST(request: Request) {
  const { user, response: authError } = await requireAnyRole(["manager", "admin"]);
  if (authError) return authError;

  const body = (await request.json().catch(() => ({}))) as {
    fullName?: string;
    phone?: string;
    email?: string;
    password?: string;
    tuman?: string;
    territoryIds?: string[];
  };

  const fullName = body.fullName?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const tuman = body.tuman?.trim() ?? "";
  const territoryIds = Array.isArray(body.territoryIds) ? body.territoryIds : [];
  const password = body.password?.trim() || generatePassword();
  const phone = body.phone?.trim() ? normalizeUzPhone(body.phone) : null;

  if (fullName.length < 3) return NextResponse.json({ error: "Toʻliq ismni kiriting" }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Email notoʻgʻri kiritilgan" }, { status: 400 });
  if (body.phone?.trim() && !phone) {
    return NextResponse.json({ error: "Telefon raqami toʻliq emas (+998 XX XXX XX XX)" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Parol kamida 8 belgidan iborat boʻlishi kerak" }, { status: 400 });
  }
  if (!tuman) return NextResponse.json({ error: "Tumanni tanlang" }, { status: 400 });
  if (territoryIds.length === 0) return NextResponse.json({ error: "Kamida bitta mahallani tanlang" }, { status: 400 });

  const supabase = createAdminClient();

  const checked = await validateTerritories(supabase, tuman, territoryIds);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  // The nurse tables must be migrated before we create an auth user we would have to undo.
  const probe = await supabase.from("nurse_territories").select("nurse_id").limit(1);
  if (probe.error && isMissingSchema(probe.error)) {
    return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: "nurse", full_name: fullName },
  });
  if (createError || !created.user) {
    const msg = createError?.message ?? "";
    const duplicate = /already|registered|exists/i.test(msg) || createError?.code === "email_exists";
    return NextResponse.json(
      { error: duplicate ? "Bu email allaqachon roʻyxatdan oʻtgan" : "Hisob yaratib boʻlmadi. Keyinroq urinib koʻring" },
      { status: duplicate ? 409 : 500 },
    );
  }
  const nurseId = created.user.id;

  // Any failure below removes what was created so the email can be reused on retry.
  async function rollback() {
    await supabase.from("nurse_territories").delete().eq("nurse_id", nurseId);
    await supabase.from("profiles").delete().eq("id", nurseId);
    await supabase.from("nurses").delete().eq("id", nurseId);
    await supabase.auth.admin.deleteUser(nurseId);
  }

  try {
    const { error: nurseError } = await supabase.from("nurses").insert({
      id: nurseId,
      full_name: fullName,
      tuman,
      village: joinVillages(tuman, checked.villages),
      phone,
      email,
    });
    if (nurseError) throw nurseError;

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: nurseId,
      role: "nurse",
      full_name: fullName,
      village: joinVillages(tuman, checked.villages),
      nurse_id: nurseId,
      phone,
    });
    if (profileError) throw profileError;

    const { error: linkError } = await supabase
      .from("nurse_territories")
      .insert([...new Set(territoryIds)].map((territory_id) => ({ nurse_id: nurseId, territory_id })));
    if (linkError) throw linkError;
  } catch (err) {
    await rollback();
    const e = err as { code?: string; message?: string };
    return NextResponse.json(
      { error: isMissingSchema(e) ? MIGRATION_HINT : "Hamshirani saqlab boʻlmadi. Qayta urinib koʻring" },
      { status: isMissingSchema(e) ? 503 : 500 },
    );
  }

  await writeAudit(supabase, {
    actorId: user!.id,
    action: "nurse.created",
    entityType: "nurses",
    entityId: nurseId,
    meta: { tuman, territories: territoryIds.length },
  });

  return NextResponse.json({
    nurse: { id: nurseId, full_name: fullName, tuman, phone, email },
    credentials: { email, password },
  });
}
