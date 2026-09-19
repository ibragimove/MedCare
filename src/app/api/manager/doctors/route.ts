import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAnyRole } from "@/lib/auth";

// GET /api/manager/doctors — read-only list of doctors for the Xodimlar section.
export async function GET() {
  const { response: authError } = await requireAnyRole(["manager", "admin"]);
  if (authError) return authError;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, created_at")
    .eq("role", "doctor")
    .order("full_name", { ascending: true });
  if (error) return NextResponse.json({ error: "Shifokorlarni yuklab boʻlmadi" }, { status: 500 });
  return NextResponse.json({ doctors: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
