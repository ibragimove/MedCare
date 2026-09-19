import { redirect } from "next/navigation";

// proxy.ts already redirects "/" based on auth state; this is just a
// defensive fallback in case a request somehow bypasses it.
export default function Home() {
  redirect("/login");
}
