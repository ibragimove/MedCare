import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isDoctorRoute = pathname.startsWith("/doctor");
  const isNurseRoute = pathname.startsWith("/nurse");
  const isPatientRoute = pathname.startsWith("/patient");
  const isFamilyRoute = pathname.startsWith("/family");
  const isManagerRoute = pathname.startsWith("/manager");
  const isAdminRoute = pathname.startsWith("/admin");
  const isLoginRoute = pathname === "/login";
  const role = user?.user_metadata?.role as string | undefined;

  const roleHome =
    role === "nurse" ? "/nurse"
    : role === "patient" ? "/patient"
    : role === "manager" ? "/manager"
    : role === "admin" ? "/admin"
    : "/doctor";

  const protectedRoutes = isDoctorRoute || isNurseRoute || isPatientRoute || isFamilyRoute || isManagerRoute || isAdminRoute;

  if (!user && (protectedRoutes || pathname === "/")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user) {
    if (isLoginRoute || pathname === "/") {
      return NextResponse.redirect(new URL(roleHome, request.url));
    }
    if (isDoctorRoute && role !== "doctor") {
      return NextResponse.redirect(new URL(roleHome, request.url));
    }
    if (isNurseRoute && role !== "nurse") {
      return NextResponse.redirect(new URL(roleHome, request.url));
    }
    if (isPatientRoute && role !== "patient") {
      return NextResponse.redirect(new URL(roleHome, request.url));
    }
    if (isFamilyRoute) {
      return NextResponse.redirect(new URL("/nurse", request.url));
    }
    if (isManagerRoute && role !== "manager" && role !== "admin") {
      return NextResponse.redirect(new URL(roleHome, request.url));
    }
    if (isAdminRoute && role !== "admin") {
      return NextResponse.redirect(new URL(roleHome, request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/", "/login", "/doctor/:path*", "/nurse/:path*", "/patient/:path*", "/family/:path*", "/manager/:path*", "/admin/:path*"],
};
