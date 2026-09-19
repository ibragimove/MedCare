import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { startOfTodayTashkent } from "@/lib/nurse-tasks";

const COLUMNS = `
  id, patient_id, nurse_id, status, severity, sla_deadline,
  accepted_at, confirmed_at, overdue_at, escalated_at,
  patients(id, full_name, tuman, village, address, phone, diagnosis)
`;

// GET /api/care-tasks — a nurse gets only her own tasks (open ones plus today's confirmed);
// doctors, managers and admins get all of them. The raw epicrisis is never included.
export async function GET(req: NextRequest) {
  const { user, role, response: authErr } = await requireAnyRole(["nurse", "doctor", "manager", "admin"]);
  if (authErr) return authErr;

  const supabase = createAdminClient();
  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const limit = Math.min(Math.max(Number.parseInt(searchParams.get("limit") ?? "100", 10) || 100, 1), 200);

  let query = supabase.from("care_tasks").select(COLUMNS).order("sla_deadline", { ascending: true }).limit(limit);

  if (role === "nurse") {
    query = query
      .eq("nurse_id", user!.id)
      .or(`status.neq.confirmed,confirmed_at.gte.${startOfTodayTashkent().toISOString()}`);
  }
  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tasks: data ?? [], serverNow: new Date().toISOString() });
}
