// Pure nurse auto-assignment (shared by the patient API and the patient form preview).
import type { NurseSummary } from "@/types/db";

const norm = (s: string | null | undefined) => (s ?? "").trim().toLocaleLowerCase("uz");

// Least-loaded nurse first.
function leastLoaded(list: NurseSummary[]): NurseSummary | null {
  return [...list].sort((a, b) => a.active_patients - b.active_patients)[0] ?? null;
}

// Auto-assignment: an active nurse serving this exact mahalla (fewest active patients wins),
// else any active nurse of the same tuman, else nobody.
export function pickNurseFor(
  nurses: NurseSummary[],
  target: { territoryId?: string | null; tuman: string; village?: string | null },
): { nurse: NurseSummary | null; exact: boolean } {
  const active = nurses.filter((n) => n.is_active);

  if (target.territoryId) {
    const exact = leastLoaded(active.filter((n) => n.territories.some((t) => t.id === target.territoryId)));
    if (exact) return { nurse: exact, exact: true };
  }

  const sameTuman = active.filter((n) => norm(n.tuman) === norm(target.tuman));
  if (!target.territoryId && target.village) {
    // Legacy nurses without nurse_territories rows: match on the free-text village.
    const legacy = leastLoaded(sameTuman.filter((n) => norm(n.village) === norm(target.village)));
    if (legacy) return { nurse: legacy, exact: true };
  }
  return { nurse: leastLoaded(sameTuman), exact: false };
}
