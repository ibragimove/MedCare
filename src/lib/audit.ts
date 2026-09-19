import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Best-effort audit trail: a failed log write must never fail the user's action.
export async function writeAudit(
  supabase: SupabaseClient,
  entry: {
    actorId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    meta?: Record<string, unknown>;
  },
) {
  try {
    await supabase.from("audit_logs").insert({
      actor_id: entry.actorId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      meta: entry.meta ?? null,
    });
  } catch (err) {
    console.error("audit log failed:", (err as Error).message);
  }
}
