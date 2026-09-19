"use client";

import { useRouter } from "next/navigation";

interface BackButtonProps {
  /** Where to go when there is no in-app history (deep link, refresh). */
  fallbackHref: string;
  label?: string;
  /** "dark" for use on the teal header, "light" on white/gray pages. */
  tone?: "dark" | "light";
  /** Overrides the default history/fallback navigation (e.g. clearing a selected task). */
  onClick?: () => void;
  className?: string;
}

// Deliberately large and high-contrast: a 44px+ touch target with a text label,
// not a thin arrow icon.
export default function BackButton({
  fallbackHref,
  label = "Orqaga",
  tone = "light",
  onClick,
  className = "",
}: BackButtonProps) {
  const router = useRouter();

  function handleClick() {
    if (onClick) {
      onClick();
      return;
    }
    // Client-side navigations keep the original referrer, so a same-origin
    // referrer plus history depth means the previous entry is inside the app.
    const hasAppHistory =
      window.history.length > 1 && document.referrer.startsWith(window.location.origin);
    if (hasAppHistory) router.back();
    else router.push(fallbackHref);
  }

  const palette =
    tone === "dark"
      ? "border border-white/40 bg-white/20 text-white hover:bg-white/30 focus-visible:ring-white"
      : "bg-teal-600 text-white shadow-sm hover:bg-teal-700 focus-visible:ring-teal-300";

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      className={`inline-flex min-h-11 min-w-24 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold outline-none transition focus-visible:ring-4 active:scale-95 ${palette} ${className}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
      <span>{label}</span>
    </button>
  );
}
