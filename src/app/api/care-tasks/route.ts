import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// GET /api/care-tasks — list tasks for the current nurse or all (manager)
export async function GET(req: NextRequest) {
  const { user, response: authErr } = await requireUser();
  if (authErr) return authErr;

  const supabase = await createClient();
  const role = user!.user_metadata?.role as string;
  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") ?? "50");

  let query = supabase
    .from("care_tasks")
    .select(`
      *,
      patients(id, full_name, tuman, village, diagnosis, phone),
      discharges(id, severity, epicrisis_raw, ai_summaries(*))
    `)
    .order("sla_deadline", { ascending: true })
    .limit(limit);

  if (role === "nurse") {
    query = query.eq("nurse_id", user!.id);
  }
  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
