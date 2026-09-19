import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { transitionTask } from "@/lib/task-state-machine";
import type { TaskStatus } from "@/types/db";

// PATCH /api/care-tasks/:id — transition task status
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, response: authErr } = await requireUser();
  if (authErr) return authErr;

  const { id } = await params;
  const body = (await req.json()) as { status: TaskStatus; visit_notes?: string };

  if (!body.status) {
    return NextResponse.json({ error: "status majburiy" }, { status: 400 });
  }

  // If confirming a visit, save notes
  if (body.status === "confirmed" && body.visit_notes) {
    const supabase = await createClient();
    await supabase.from("care_tasks").update({ visit_notes: body.visit_notes }).eq("id", id);
  }

  const result = await transitionTask(id, body.status, user!.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

// GET /api/care-tasks/:id — get single task with full detail
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response: authErr } = await requireUser();
  if (authErr) return authErr;

  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("care_tasks")
    .select(`
      *,
      patients(*),
      discharges(*, ai_summaries(*))
    `)
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
