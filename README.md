# MedCare (Aktiv Patronaj)

Hackathon MVP: when a hospital discharges a severe patient, this app automatically hands them off
to the rural nurse/family doctor covering their village, generates an AI expected-recovery
trajectory and daily check-in questions, scores the nurse's daily answers against that trajectory,
and alerts the doctor when a patient deviates. All user-facing and AI-generated text is Uzbek.

## Stack

Next.js 15 (App Router, TypeScript, Tailwind) · Supabase (Postgres + Realtime) · Google Gemini API
(free tier) · Telegram Bot API.

## One-time setup

1. **Supabase**: create a project at [supabase.com](https://supabase.com). In the SQL Editor, run
   [`supabase/schema.sql`](supabase/schema.sql), then [`supabase/seed.sql`](supabase/seed.sql) to
   populate demo patients. Copy `Project URL`, `anon public` key, and `service_role` key from
   Project Settings → API.
2. **Gemini**: get a free API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (Google account, no credit card required for the free tier).
3. **Telegram**: message `@BotFather` → `/newbot` to get a bot token. Message your new bot once,
   then visit `https://api.telegram.org/bot<TOKEN>/getUpdates` to find your `chat.id`.
4. Copy `.env.example` to `.env.local` and fill in all five values.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Pick "Men shifokorman" to discharge a patient (this calls Claude to
generate the trajectory + questions), or "Men hamshiraman" to run a daily check-in on a seeded
patient (this calls Claude to score it and, on deviation, files an alert visible on the doctor
dashboard in realtime).

## Demo golden path

1. Doctor discharges a new patient → AI generates trajectory + questions → auto-assigned to the
   nurse in that village.
2. Switch to nurse view → open that patient → answer the daily check-in → AI scores it.
3. Switch back to doctor dashboard → the patient's card updates live (Supabase realtime, no
   refresh) with a color-coded match score; a low score also raises an alert banner.
4. Click "📨 Dam olish kuni eslatmasini yuborish" on any patient to simulate the weekend Telegram
   reminder to a relative.

## Deliberately out of scope for this MVP

Offline sync, real role-based auth, real SMS gateway, and a real cron scheduler for weekend
reminders — all replaced with a manual trigger button or noted as roadmap items in the pitch.
