import type { SupabaseClient } from "@supabase/supabase-js";
import type { Severity } from "@/types/db";

export interface SlaConfig {
  hours: Record<Severity, number>;
  /** Speed multiplier: 1 = real time, 60 = demo mode (1 real minute counts as 1 hour). */
  scale: number;
}

export const DEFAULT_SLA: SlaConfig = { hours: { routine: 24, urgent: 8, critical: 4 }, scale: 1 };

const positive = (raw: string | undefined, fallback: number) => {
  const n = Number.parseFloat(raw ?? "");
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Reads the SLA settings; any missing or invalid row falls back to the defaults.
export async function loadSlaConfig(supabase: SupabaseClient): Promise<SlaConfig> {
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["sla_routine_hours", "sla_urgent_hours", "sla_critical_hours", "sla_time_scale"]);
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));
  return {
    hours: {
      routine: positive(map.get("sla_routine_hours"), DEFAULT_SLA.hours.routine),
      urgent: positive(map.get("sla_urgent_hours"), DEFAULT_SLA.hours.urgent),
      critical: positive(map.get("sla_critical_hours"), DEFAULT_SLA.hours.critical),
    },
    scale: positive(map.get("sla_time_scale"), DEFAULT_SLA.scale),
  };
}

export function slaDeadline(severity: Severity, config: SlaConfig = DEFAULT_SLA, from: Date = new Date()): Date {
  const minutes = (config.hours[severity] * 60) / config.scale;
  return new Date(from.getTime() + minutes * 60 * 1000);
}
