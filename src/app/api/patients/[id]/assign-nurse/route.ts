import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response: authError } = await requireRole("doctor");
  if (authError) return authError;

  const { id } = await params;
  const { nurseId } = (await request.json()) as { nurseId: string };

  if (!nurseId) {
    return NextResponse.json({ error: "Hamshira tanlanmadi" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: nurse } = await supabase.from("nurses").select("id").eq("id", nurseId).maybeSingle();
  if (!nurse) {
    return NextResponse.json({ error: "Hamshira topilmadi" }, { status: 404 });
  }

  const { data: patient, error } = await supabase
    .from("patients")
    .update({ assigned_nurse_id: nurseId })
    .eq("id", id)
    .select("*, nurses(full_name, village)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ patient });
}
