import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";

export async function GET() {
  const { response: authError } = await requireRole("doctor");
  if (authError) return authError;

  const supabase = createAdminClient();
  const { data: nurses, error } = await supabase
    .from("nurses")
    .select("id, full_name, tuman, village")
    .order("tuman", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ nurses });
}

export async function POST(request: Request) {
  const { response: authError } = await requireRole("doctor");
  if (authError) return authError;

  const body = await request.json();
  const { fullName, tuman, village } = body as {
    fullName: string;
    tuman: string;
    village: string;
  };

  if (!fullName?.trim() || !tuman?.trim() || !village?.trim()) {
    return NextResponse.json(
      { error: "Ismi, tumani va mahalla/qishlogʻi toʻldirilishi shart" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { data: nurse, error } = await supabase
    .from("nurses")
    .insert({ full_name: fullName.trim(), tuman: tuman.trim(), village: village.trim() })
    .select("id, full_name, tuman, village")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ nurse });
}
