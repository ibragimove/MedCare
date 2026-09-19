import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskStatus } from "@/types/db";

// Shared by the nurse-facing task routes. RLS is off, so every one of them must call
// loadOwnedTask() before it reads or changes a task.

export interface OwnedTask {
  id: string;
  patient_id: string;
  discharge_id: string | null;
  nurse_id: string | null;
  status: TaskStatus;
  severity: "routine" | "urgent" | "critical";
  sla_deadline: string;
  accepted_at: string | null;
  confirmed_at: string | null;
  overdue_at: string | null;
  visit_notes: string | null;
  checklist_done?: string[] | null;
}

// A task that does not exist and one that belongs to another nurse look the same to the caller.
export async function loadOwnedTask(
  supabase: SupabaseClient,
  taskId: string,
  nurseId: string,
): Promise<{ task: OwnedTask; response: null } | { task: null; response: NextResponse }> {
  const notFound = () =>
    ({ task: null, response: NextResponse.json({ error: "Vazifa topilmadi" }, { status: 404 }) }) as const;

  if (!/^[0-9a-f-]{36}$/i.test(taskId)) return notFound();
  const { data, error } = await supabase.from("care_tasks").select("*").eq("id", taskId).maybeSingle();
  if (error) {
    return { task: null, response: NextResponse.json({ error: error.message }, { status: 500 }) };
  }
  if (!data || data.nurse_id !== nurseId) return notFound();
  return { task: data as OwnedTask, response: null };
}

// Tashkent is UTC+5 all year; "confirmed today" means since local midnight there.
export function startOfTodayTashkent(now: Date = new Date()): Date {
  const offset = 5 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offset);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offset);
}

// How long a visit code stays valid (settings.otp_expiry_minutes, default 30).
export async function loadOtpExpiryMinutes(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase.from("settings").select("value").eq("key", "otp_expiry_minutes").maybeSingle();
  const n = Number.parseInt((data?.value as string | undefined) ?? "", 10);
  return Number.isFinite(n) && n >= 1 && n <= 1440 ? n : 30;
}
