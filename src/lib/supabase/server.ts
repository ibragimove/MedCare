import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cookie-aware client for Server Components / Route Handlers — resolves the
// signed-in user from the session cookie. Use createAdminClient (admin.ts)
// for privileged writes; use this one to find out WHO is calling.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component render — proxy.ts refreshes the
            // session cookie on the next request, so this is safe to ignore.
          }
        },
      },
    },
  );
}
