import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAnyRole, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { XORAZM_TUMANS, sortUz } from "@/lib/territories";

const CACHE = { "Cache-Control": "private, max-age=300" };
const NO_CACHE = { "Cache-Control": "no-store" };

const clean = (s: unknown) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ") : "");

// GET /api/territories            → { tumans: string[] }
// GET /api/territories?tuman=Xiva → { villages: { id, village }[] }
// GET /api/territories?all=1      → { territories: { id, tuman, village }[] } (fresh, for the manager screens)
export async function GET(request: Request) {
  const { response: authError } = await requireUser();
  if (authError) return authError;

  const supabase = createAdminClient();
  const params = new URL(request.url).searchParams;
  const tuman = params.get("tuman")?.trim();

  if (params.get("all")) {
    const { data, error } = await supabase.from("territories").select("id, tuman, village");
    if (error) return NextResponse.json({ error: "Hududlarni yuklab boʻlmadi" }, { status: 500 });
    const territories = (data ?? []).sort(
      (a, b) => a.tuman.localeCompare(b.tuman, "uz") || a.village.localeCompare(b.village, "uz"),
    );
    return NextResponse.json({ territories, tumans: sortUz([...new Set([...XORAZM_TUMANS, ...territories.map((t) => t.tuman)])]) }, { headers: NO_CACHE });
  }

  if (tuman) {
    const { data, error } = await supabase
      .from("territories")
      .select("id, village")
      .eq("tuman", tuman);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const villages = (data ?? []).sort((a, b) => a.village.localeCompare(b.village, "uz"));
    return NextResponse.json({ villages }, { headers: CACHE });
  }

  const { data, error } = await supabase.from("territories").select("tuman");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const tumans = sortUz([...new Set([...XORAZM_TUMANS, ...(data ?? []).map((r) => r.tuman)])]);
  return NextResponse.json({ tumans }, { headers: CACHE });
}

// POST /api/territories { tuman, village } or { tuman, villages: string[] } — manager/admin adds mahallas.
export async function POST(request: Request) {
  const { user, response: authError } = await requireAnyRole(["manager", "admin"]);
  if (authError) return authError;

  const body = (await request.json().catch(() => ({}))) as { tuman?: unknown; village?: unknown; villages?: unknown };
  const tuman = clean(body.tuman);
  const names = [
    ...new Set(
      (Array.isArray(body.villages) ? body.villages : [body.village]).map(clean).filter((v) => v.length > 0),
    ),
  ];

  if (!tuman) return NextResponse.json({ error: "Tumanni tanlang" }, { status: 400 });
  if (names.length === 0) return NextResponse.json({ error: "Mahalla nomini kiriting" }, { status: 400 });
  if (names.length > 300) return NextResponse.json({ error: "Bir vaqtda 300 tadan ortiq mahalla qoʻshib boʻlmaydi" }, { status: 400 });
  if (names.some((n) => n.length < 2 || n.length > 100)) {
    return NextResponse.json({ error: "Mahalla nomi 2–100 belgidan iborat boʻlishi kerak" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: existing } = await supabase.from("territories").select("village").eq("tuman", tuman);
  const have = new Set((existing ?? []).map((r) => r.village.toLocaleLowerCase("uz")));
  const fresh = names.filter((n) => !have.has(n.toLocaleLowerCase("uz")));
  if (fresh.length === 0) {
    return NextResponse.json({ error: "Bu mahalla(lar) allaqachon mavjud" }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("territories")
    .insert(fresh.map((village) => ({ tuman, village })))
    .select("id, tuman, village");
  if (error) return NextResponse.json({ error: "Mahallani qoʻshib boʻlmadi. Qayta urinib koʻring" }, { status: 500 });

  await writeAudit(supabase, {
    actorId: user!.id,
    action: "territory.created",
    entityType: "territories",
    entityId: data![0].id,
    meta: { tuman, count: fresh.length, villages: fresh.slice(0, 20) },
  });

  return NextResponse.json({ territories: data, skipped: names.length - fresh.length }, { status: 201 });
}

// PATCH /api/territories { id, village } — rename a mahalla.
export async function PATCH(request: Request) {
  const { user, response: authError } = await requireAnyRole(["manager", "admin"]);
  if (authError) return authError;

  const body = (await request.json().catch(() => ({}))) as { id?: unknown; village?: unknown };
  const id = clean(body.id);
  const village = clean(body.village);
  if (!id) return NextResponse.json({ error: "Mahalla topilmadi" }, { status: 400 });
  if (village.length < 2 || village.length > 100) {
    return NextResponse.json({ error: "Mahalla nomi 2–100 belgidan iborat boʻlishi kerak" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: current } = await supabase.from("territories").select("id, tuman, village").eq("id", id).maybeSingle();
  if (!current) return NextResponse.json({ error: "Mahalla topilmadi" }, { status: 404 });

  const { data: dup } = await supabase.from("territories").select("id, village").eq("tuman", current.tuman);
  if ((dup ?? []).some((r) => r.id !== id && r.village.toLocaleLowerCase("uz") === village.toLocaleLowerCase("uz"))) {
    return NextResponse.json({ error: "Bu tumanda shu nomli mahalla allaqachon bor" }, { status: 409 });
  }

  const { error } = await supabase.from("territories").update({ village }).eq("id", id);
  if (error) return NextResponse.json({ error: "Nomni oʻzgartirib boʻlmadi" }, { status: 500 });

  // Patients keep a copy of the mahalla name for older screens.
  await supabase.from("patients").update({ village }).eq("territory_id", id);

  await writeAudit(supabase, {
    actorId: user!.id,
    action: "territory.renamed",
    entityType: "territories",
    entityId: id,
    meta: { tuman: current.tuman, from: current.village, to: village },
  });
  return NextResponse.json({ ok: true });
}

// DELETE /api/territories?id=… — blocked while patients or nurses still reference the mahalla.
export async function DELETE(request: Request) {
  const { user, response: authError } = await requireAnyRole(["manager", "admin"]);
  if (authError) return authError;

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Mahalla topilmadi" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: current } = await supabase.from("territories").select("id, tuman, village").eq("id", id).maybeSingle();
  if (!current) return NextResponse.json({ error: "Mahalla topilmadi" }, { status: 404 });

  const [{ count: patientCount }, { count: nurseCount }] = await Promise.all([
    supabase.from("patients").select("id", { count: "exact", head: true }).eq("territory_id", id),
    supabase.from("nurse_territories").select("nurse_id", { count: "exact", head: true }).eq("territory_id", id),
  ]);
  if ((patientCount ?? 0) > 0 || (nurseCount ?? 0) > 0) {
    const parts = [
      (patientCount ?? 0) > 0 ? `${patientCount} ta bemor` : null,
      (nurseCount ?? 0) > 0 ? `${nurseCount} ta hamshira` : null,
    ].filter(Boolean);
    return NextResponse.json(
      { error: `Oʻchirib boʻlmaydi: bu mahallaga ${parts.join(" va ")} biriktirilgan` },
      { status: 409 },
    );
  }

  const { error } = await supabase.from("territories").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Oʻchirib boʻlmadi" }, { status: 500 });

  await writeAudit(supabase, {
    actorId: user!.id,
    action: "territory.deleted",
    entityType: "territories",
    entityId: id,
    meta: { tuman: current.tuman, village: current.village },
  });
  return NextResponse.json({ ok: true });
}
