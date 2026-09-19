import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/db";

// RLS is off (hackathon demo), so API routes enforce role access themselves.
export async function requireRole(role: UserRole) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userRole = user?.user_metadata?.role as UserRole | undefined;

  if (!user || userRole !== role) {
    return {
      user: null,
      response: NextResponse.json({ error: "Ruxsat yoʻq" }, { status: 403 }),
    };
  }
  return { user, response: null };
}

// One of several roles (e.g. doctor and manager both manage nurses).
export async function requireAnyRole(roles: UserRole[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userRole = user?.user_metadata?.role as UserRole | undefined;

  if (!user || !userRole || !roles.includes(userRole)) {
    return {
      user: null,
      role: null,
      response: NextResponse.json({ error: "Ruxsat yoʻq" }, { status: 403 }),
    };
  }
  return { user, role: userRole, response: null };
}

// Any signed-in user, regardless of role (e.g. registering a push token).
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Ruxsat yoʻq" }, { status: 403 }),
    };
  }
  return { user, response: null };
}
