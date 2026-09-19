import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";

export async function POST(request: Request) {
  const { user, response: authError } = await requireUser();
  if (authError) return authError;

  const { token, platform } = (await request.json()) as { token?: string; platform?: string };
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Token talab etiladi" }, { status: 400 });
  }

  const { error } = await createAdminClient()
    .from("device_tokens")
    .upsert(
      { profile_id: user.id, token, platform: platform === "ios" ? "ios" : "android" },
      { onConflict: "token" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { user, response: authError } = await requireUser();
  if (authError) return authError;

  const { token } = (await request.json()) as { token?: string };
  if (!token) return NextResponse.json({ error: "Token talab etiladi" }, { status: 400 });

  await createAdminClient().from("device_tokens").delete().eq("token", token).eq("profile_id", user.id);
  return NextResponse.json({ ok: true });
}
