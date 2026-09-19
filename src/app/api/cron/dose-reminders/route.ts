import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToProfiles } from "@/lib/push";
import type { MedicationPlan } from "@/types/db";

// Daily server-side reminder listing today's doses (Vercel cron). Exact
// per-dose alarms are scheduled on the phone itself by the app, since Hobby
// cron jobs only run once per day.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Ruxsat yoʻq" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: patients, error } = await supabase
    .from("patients")
    .select("id, profile_id, discharge_date, expected_days, medication_plan")
    .is("completed_at", null)
    .not("profile_id", "is", null)
    .not("medication_plan", "is", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const today = new Date();
  let sent = 0;
  let skipped = 0;

  for (const p of patients ?? []) {
    const plan = p.medication_plan as MedicationPlan;
    const start = new Date(p.discharge_date);
    const dayIndex = Math.floor((today.getTime() - start.getTime()) / 86400000);
    const dueItems = plan.items.filter((item) => dayIndex >= 0 && dayIndex < item.durationDays);
    if (dueItems.length === 0) {
      skipped++;
      continue;
    }

    const lines = dueItems
      .flatMap((item) => item.times.map((t) => `${t} — ${item.drug} ${item.dosage}`))
      .sort()
      .join("\n");

    sent += await sendPushToProfiles([p.profile_id as string], {
      title: "Bugungi dorilar",
      body: lines,
      url: "/patient",
    });
  }

  return NextResponse.json({ ok: true, patients: (patients ?? []).length, sent, skipped });
}
