import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAnyRole } from "@/lib/auth";

// GET /api/manager/audit?action=&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=100
// → { entries: {...}[], actions: string[] }
export async function GET(request: Request) {
  const { response: authError } = await requireAnyRole(["manager", "admin"]);
  if (authError) return authError;

  const params = new URL(request.url).searchParams;
  const action = params.get("action")?.trim();
  const from = params.get("from")?.trim();
  const to = params.get("to")?.trim();
  const limit = Math.min(Math.max(Number(params.get("limit")) || 100, 1), 300);
  const dateOk = (s: string | undefined) => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s));

  const supabase = createAdminClient();
  let query = supabase
    .from("audit_logs")
    .select("id, actor_id, action, entity_type, entity_id, meta, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (action) query = query.eq("action", action);
  if (dateOk(from)) query = query.gte("created_at", `${from}T00:00:00`);
  if (dateOk(to)) query = query.lte("created_at", `${to}T23:59:59.999`);

  const [{ data, error }, { data: actionRows }] = await Promise.all([
    query,
    supabase.from("audit_logs").select("action").order("created_at", { ascending: false }).limit(1000),
  ]);
  if (error) return NextResponse.json({ error: "Jurnalni yuklab boʻlmadi" }, { status: 500 });

  const actorIds = [...new Set((data ?? []).map((e) => e.actor_id).filter((v): v is string => Boolean(v)))];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
    for (const p of profiles ?? []) names.set(p.id, p.full_name);
  }

  return NextResponse.json(
    {
      entries: (data ?? []).map((e) => ({ ...e, actor_name: e.actor_id ? (names.get(e.actor_id) ?? null) : null })),
      actions: [...new Set((actionRows ?? []).map((r) => r.action as string))].sort(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
