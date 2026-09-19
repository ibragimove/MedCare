# Prompt: Add the missing "Continuity of Care" MVP features to MedCare

Source: "Continuity of Care — MVP reja (11-muammo)" (14 pages, 2026-09-17).
Paste everything below the line into your AI coding tool.

---

You are extending **MedCare**, a working, deployed hackathon MVP, to match the official
MVP plan for problem #11 ("Continuity of Care"). The plan's core promise — the ONE thing
the MVP must prove — is:

> A severely ill patient is discharged → the local family doctor is notified immediately →
> the system **proves** the patient was seen within an SLA (24 h) → if not, it escalates.
> Existing systems store data; this one **closes responsibility**: every discharged patient
> has a named person, a deadline, and proof of confirmation.

The plan's pipeline: `discharge event → AI reads epicrisis (risk + brief) → route by address
to a family doctor → care task + SLA timer → Telegram notification with "Qabul qildim" →
visit confirmed with patient OTP → if late: escalation → manager dashboard`, and if the
visit finds the patient in bad condition an alert flows **back** to the hospital doctor.

Scope rule from the plan: *one flow working end to end without errors beats ten half
features.* Build in the priority order at the bottom. Everything user-facing is **Uzbek
(Latin script, `ʻ` in words like `oʻzbek`)**; code, comments, commits in English.

## Stack — adapt the plan, do NOT switch stacks

The plan assumes Laravel/Vue/MySQL/Redis. This project is already built and live on:
Next.js 16 App Router (TypeScript, Tailwind; `params` are Promises; middleware is
`src/proxy.ts`), Supabase Postgres + Realtime + Auth (cookie sessions via `@supabase/ssr`,
role in `user_metadata.role`, RLS OFF — authorization lives in API routes via
`requireRole()` in `src/lib/auth.ts`), Google Gemini (`src/lib/gemini.ts`, model
`gemini-3.5-flash-lite`, JSON `responseSchema`, retry wrapper), Telegram Bot API, Vercel
(https://continuitycare-ai.vercel.app), Capacitor Android app (`android/`). Read
`node_modules/next/dist/docs/` before using any Next.js API — this version has breaking
changes.

Translate the plan like this:

| Plan says | Use here |
|-----------|----------|
| Laravel Policy / Form Request | Route-handler guards (`requireRole`, new `requireScope`) + zod-style validation helpers |
| MySQL migrations | New numbered Supabase SQL files (`supabase/migration_006_*.sql` …); every new table gets `alter table … disable row level security;`; add tables to the `supabase_realtime` publication when the UI subscribes |
| Redis queue + Horizon | Not available. Run slow work (LLM, notifications) **after responding** with `after()` from `next/server`, or as idempotent steps triggered by the tick job below |
| `schedule:run` every minute | `POST /api/cron/sla-tick` (Bearer `CRON_SECRET`), called every minute by **Supabase `pg_cron` + `pg_net`** (free) or cron-job.org — Vercel Hobby cron is only daily, so `vercel.json` alone is NOT enough. Provide the exact SQL/setup in `docs/` |
| `SLA_TIME_SCALE=60` | Env var read in one helper `slaMs(hours)`; `1 min = 1 h` when set. Must be in the code from the first commit and adjustable without redeploy for demos (also allow a runtime override row in a `settings` table) |
| Sanctum tokens | Existing Supabase auth. Integration endpoint uses API key + HMAC signature instead |
| Reverb realtime | Supabase Realtime (already used on `/doctor`) |
| Vue PWA | Existing Next.js PWA + Android shell; keep them |
| `php artisan demo:reset` | `npm run demo:reset` (Node script using the service-role key) |

## What already exists — preserve and reuse, do not break

- Roles: `doctor` (discharges patients, receives alerts, adds nurses), `nurse`
  (assigned patients, daily yes/no check-ins scored by AI), `patient` (medication
  schedule, dose tracking, streaming AI chat, callback request). Demo accounts
  `shifokor@demo.uz`, `hamshira@demo.uz`, `bemor@demo.uz` / `Demo1234!`.
- Tables: `nurses(tuman, village)`, `patients`, `checkins`, `alerts`, `profiles`,
  `dose_logs`, `chat_messages`, `callback_requests`, `device_tokens`.
- Discharge form with auto-routing to the nearest nurse by tuman/mahalla; AI trajectory +
  medication plan; Telegram reminder + doctor alerts (`src/lib/telegram.ts`); FCM push
  (`src/lib/push.ts`); realtime doctor dashboard; Android app.

**Role mapping (keep old logins working):** existing `doctor` = the plan's
`hospital_doctor` (statsionar shifokor); existing `nurse` = the plan's `family_doctor`
(the assignee who visits/calls the patient). Add roles `manager` (poliklinika mudiri /
tuman rahbari — one account per level) and `admin`. Extend `UserRole`, `proxy.ts`
routing, and `TopBar` role labels accordingly. Do not rename DB values that existing rows
use; add new ones.

## Gap analysis (what the plan requires that is missing)

| # | Plan requirement | Priority | State today |
|---|------------------|----------|-------------|
| 1 | Discharge form with **epicrisis text** (free text) + "og'ir" flag, 1-minute form | Must | Form has diagnosis/drug fields only, no epicrisis |
| 2 | **Territories** routing mahalla → family doctor with backup doctor; fallback "unassigned" to polyclinic manager | Must | Nurse matched by tuman/village text; no backup, no fallback task |
| 3 | **`care_tasks`** with status machine + risk-based `due_at` (red 12 h / yellow 24 h / green 48 h) | Must | None |
| 4 | **Telegram bot**: `/start` phone linking, task message (risk colour, age, mahalla, 2 brief lines, deadline) with **"Qabul qildim"** + "To'liq ko'rish" buttons, secret-token webhook | Must | Send-only messages to one test chat |
| 5 | **AI layer**: de-identification → structured JSON extraction → rule-based risk score → 5-line Uzbek brief → 4–6 item checklist → human override with audit; validation + 1 retry + fallback | Must | Only free-text trajectory/med-plan |
| 6 | **Visit confirmation**: checklist + ≥3 vitals + condition (yaxshi/o'zgarishsiz/yomon) + **patient 4-digit OTP** | Must | Nurse yes/no check-in only |
| 7 | **Escalation chain** (levels 1–2, reassign to backup, reminders at 2 h / 18 h) | Must | None |
| 8 | **Manager dashboard**: SLA %, median time to first contact, overdue list, risk distribution, doctor ranking, escalation log | Must | Doctor dashboard shows patients/alerts only |
| 9 | Alert **back to hospital doctor** when visit says "yomon" (task → `reopened`) | Must | Only nurse→doctor deviation alert |
| 10 | **audit_logs** (who viewed/changed which patient) | Must | None |
| 11 | Integration endpoint `POST /api/integrations/discharges` (FHIR-like Encounter+Patient JSON, API key + signature) | Must (pitch proof) | None |
| 12 | Privacy: PINFL encrypted + masked (`****1234`), Telegram messages without full name/diagnosis, facility-scoped access | Must | Nothing masked or scoped |
| 13 | Anti-fake-confirmation: OTP + mandatory content + **10 % random patient verification** ("Ha/Yo'q" → reopen) + "close without code" reason needing manager approval (counted separately) | Must | None |
| 14 | Patient SMS/Telegram notice (mock SMS allowed) | Should | Push/Telegram to doctor only |
| 15 | Patient status polling via bot on day 3 and 7 | Could | None — do last, only if time remains |
| 16 | `SLA_TIME_SCALE` demo speed-up, `demo:reset`, seed (2 districts, 3 polyclinics, 6 mahallas, 5 doctors, 30 patients), 10 sample epicrises | Must (demo) | Partial seed only |
| 17 | DMED real integration, geolocation, native app, voice bot | Won't | Native app already exists — keep, don't extend |

## Build these, in this order

### Step 1 — Data model (`supabase/migration_006_continuity.sql` … `_008`)

Create (all with RLS disabled, `created_at` defaults, sensible FKs and indexes):
`facilities(id, type hospital|polyclinic|district, parent_id, name)`,
`territories(id, name, polyclinic_id, family_doctor_id, backup_doctor_id)`,
`discharges(id, patient_id, hospital_id, doctor_id, discharged_at, epicrisis_text,
severity_flag)`,
`ai_summaries(id, discharge_id, sanitized_text, extracted_json, brief_text, risk_score,
risk_level, risk_reasons jsonb, checklist jsonb, model, status ok|fallback|failed)`,
`care_tasks(id, discharge_id, assignee_id, status, risk_level, due_at, accepted_at,
confirmed_at, escalation_level, unassigned bool)`,
`visits(id, task_id, contact_type visit|call, checklist_json, vitals_json, condition,
notes, otp_verified_at, closed_without_otp bool, no_otp_reason, approved_by)`,
`patient_otps(id, task_id, code_hash, expires_at, used_at)`,
`escalations(id, task_id, level, notified_user_id, reason, created_at)`,
`notifications(id, user_id, task_id, channel, payload, sent_at, delivered_at)`,
`audit_logs(id, user_id, action, subject_type, subject_id, meta, ip, created_at)`,
`settings(key, value)` (holds the runtime SLA time scale).
Extend `profiles` with `facility_id`, `telegram_chat_id` (exists), `phone`; extend
`patients` with `pinfl_enc`, `pinfl_last4`, `birth_date`, `territory_id`. Map existing
`nurses` rows to family-doctor users + territories rather than deleting them. Add a unique
constraint so a discharge has exactly one open task. Regenerate `src/types/db.ts`.

### Step 2 — TaskStateMachine (`src/lib/tasks/state-machine.ts`)

Single service through which **all** status changes pass. States/transitions exactly as in
the plan's diagram: `new → accepted | overdue`, `accepted → confirmed | overdue`,
`overdue → escalated`, `escalated → confirmed | reassigned`, `reassigned → confirmed`,
`confirmed → reopened`, `reopened → accepted`. Illegal transitions throw a typed error;
every transition writes `audit_logs`. **This is the only module that gets unit tests**
(vitest): every legal edge, every illegal edge, audit row written.

### Step 3 — Discharge → task pipeline

- Extend the doctor's "Bemorni chiqarish" form: patient search-or-create (name, birth
  date, phone, PINFL, tuman + mahalla via `territories` autocomplete), **epicrisis
  textarea**, "Og'ir" checkbox, hospital auto-filled. Submit responds in <1 s.
- `POST /api/discharges` validates, inserts `discharges`, resolves the territory →
  assignee (fall back to backup, then to the polyclinic manager with `unassigned=true` —
  no patient may be lost), creates `care_tasks` with `due_at = now + slaMs(risk hours)`
  (initial risk = yellow until AI finishes, then recomputed), generates the patient OTP
  (store only a hash, mock-SMS it), then kicks the AI job and notifications with `after()`.
- `POST /api/integrations/discharges`: accepts FHIR-like `{ Encounter, Patient }` JSON,
  authenticates with an `X-Api-Key` header **and** `X-Signature` (HMAC-SHA256 of the raw
  body with `INTEGRATION_SECRET`), and calls the same service. Document a curl example in
  the README. The form must use the same service so there is one code path.
- `GET /api/discharges?mine=1`, `PATCH /api/discharges/{id}/risk` (manual override, writes
  audit, enforces the safety rule below).

### Step 4 — AI pipeline (`src/lib/ai/*`, behind an `AiClient` interface with a Gemini impl)

1. **De-identification** (`deidentify.ts`): regex + dictionary for full name (from the
   patient record), PINFL (14 digits), phones (+998…), addresses/mahalla names →
   `[BEMOR]`, `[MANZIL]`, `[TELEFON]`, `[PINFL]`. Only sanitized text goes to the LLM;
   persist it in `ai_summaries.sanitized_text` so it can be audited. Unit-test it.
2. **Structured extraction**: strict JSON schema `{diagnoses[], procedures[],
   medications[{name,dose,schedule}], red_flags[], follow_up_instructions[],
   vitals_at_discharge}`, each field paired with a short **quote from the epicrisis**.
   Validate against the schema; retry once; on failure use the fallback.
3. **Risk scoring is rule-based** (`risk.ts`, pure function, unit-tested); the LLM only
   writes the explanation. Points: ICU stay +3, surgery +2, newborn <28 days or <2500 g +3,
   ≥5 medications +1, red-flag phrase (qon ketish, sepsis, preeklampsiya, …) +2,
   readmission in last 30 days +2. Score ≥5 red (12 h), 2–4 yellow (24 h), 0–1 green (48 h).
   Keep thresholds in one constants file (they need mentor-doctor sign-off). Store
   `risk_reasons` so the UI can show *why*.
4. **Brief**: exactly 5 lines in Uzbek — what happened, which medications, what to check,
   when to call emergency care (103).
5. **Checklist**: 4–6 diagnosis-appropriate items (e.g. after C-section: chok holati,
   harorat, qon bosimi, qon ketishi).
6. **Fallbacks**: if the LLM fails, the task is still created: brief = raw epicrisis text,
   risk = yellow, `status=fallback`.
7. **Safety rules (non-negotiable)**: AI never diagnoses or changes treatment; every brief
   is followed by "AI xulosasi — asl epikrizni tekshiring" with a one-click jump to the
   original text; if the hospital doctor set "og'ir", the risk can never drop below
   yellow, even by manual/AI change; manual override is one click and audited.
8. Build an eval script (`npm run ai:eval`) over the **10 sample epicrises** (varied risk
   levels, in `data/epicrises/*.txt` with expected level) and print accuracy — the number
   goes on the pitch slide.

### Step 5 — Telegram bot (`src/app/api/telegram/webhook/route.ts`)

- Webhook verified with `X-Telegram-Bot-Api-Secret-Token` (`TELEGRAM_WEBHOOK_SECRET`);
  add a script to register the webhook.
- `/start` asks for a phone number (contact button) and links `profiles.telegram_chat_id`.
- New-task message: risk colour emoji, patient **age and mahalla only** (never full name
  or diagnosis), 2 brief lines, deadline with time left, inline buttons **"Qabul qildim"**
  (callback → `accept` transition) and **"To'liq ko'rish"** (deep link to
  `/family/tasks/{id}`). Editing the message after accept.
- Reminders and escalation notices reuse the same sender; log each to `notifications`.
- Fallback: if HTTPS webhook gives trouble, provide a long-polling dev script.

### Step 6 — SLA tick + escalation (`POST /api/cron/sla-tick`)

Idempotent job, runs every minute, all offsets multiplied by `slaMs()`; red = half the
times. For a yellow task: 2 h unaccepted → repeat Telegram to the assignee; 18 h → "6 soat
qoldi" reminder; 24 h → status `overdue` + level-1 escalation to the polyclinic manager;
30 h → propose backup-doctor reassignment to the manager; 36 h → level-2 escalation to
the district manager. Every step writes `escalations` + `notifications` + `audit_logs` and
is guarded so re-running never double-sends. `POST /api/tasks/{id}/reassign` (manager).
Provide the `pg_cron`/`pg_net` SQL (or cron-job.org steps) plus a local
`npm run sla:tick` for testing.

### Step 7 — Family-doctor screens (existing `nurse` role → `/family`)

Keep `/nurse` working; add: **Tasks list** (risk colour, live countdown, filters
yangi / qabul qilingan / kechikkan), **Task page** (AI brief + disclaimer, medications,
red flags with quotes, original epicrisis, call button, map link to the address),
**Visit confirmation** (checklist must be fully ticked, ≥3 vitals values, condition
yaxshi/o'zgarishsiz/yomon, patient OTP field, notes). `POST /api/tasks/{id}/confirm`
rejects empty "hammasi yaxshi". Condition **yomon** ⇒ task `reopened` + alert/push/Telegram
back to the discharging hospital doctor. "Kodsiz yopish": doctor picks a reason, task
waits for manager approval and is counted separately.

### Step 8 — Hospital-doctor screens (existing `/doctor`)

Add **"Mening chiqarilganlarim"**: per discharged patient the task status, visit result,
alerts, and the AI result + assigned doctor shown right after submit (with the risk
override control). Keep existing patients/alerts/nurse-management UI.

### Step 9 — Manager dashboard (`/manager`, role `manager`)

Realtime (Supabase Realtime, or 10 s polling fallback): **SLA %** (confirmed-on-time /
all), **median time to first contact**, overdue list, **risk distribution**, doctor
ranking, escalation log, count of "closed without code" exceptions, share of tasks that
reached escalation level 1. Scope: a manager sees only their own facility (and children).
Endpoints `GET /api/dashboard/summary`, `GET /api/dashboard/overdue`. Manager can approve
no-code closures and reassign.

### Step 10 — Security, privacy, anti-fake

- Facility scoping helper `requireScope(user, resource)`; a family doctor sees only tasks
  assigned to them, a manager only their facility. Every task/epicrisis view writes
  `audit_logs`.
- PINFL stored encrypted (AES-256-GCM, key in `PII_ENCRYPTION_KEY`), lists show
  `****1234`; phones masked in lists.
- Anti-fake: OTP + mandatory content + **random 10 %** of closed tasks get an automatic
  patient message "Shifokor sizdan xabar oldimi? Ha / Yo'q" (Telegram/SMS mock); "Yo'q"
  reopens the task and notifies the manager.
- Patient notice (Should): mock SMS provider (`src/lib/sms.ts`, logs to `notifications`)
  sent at task creation with the OTP; keep it swappable for a real gateway.

### Step 11 — Demo & polish

- `SLA_TIME_SCALE` + runtime override on an admin-only settings page.
- `npm run demo:reset`: wipes and reseeds **2 tumans, 3 polyclinics, 6 mahallas, 5 family
  doctors, 30 patients**, pre-baked `ai_summaries` (so the demo works offline / without
  the LLM), demo manager accounts, and one scripted "doctor never answers" patient.
- Uzbek empty states, loading skeletons, error messages; keep the Android app and PWA
  working (check the layouts on the phone width).
- Optional (Could, only if time remains): bot poll on day 3 and 7.

## Non-negotiables

- Do not break existing logins, patient portal, AI chat, Android app, or deployed routes.
  Run `npx tsc --noEmit`, `npx eslint src`, `npm run build` after every step.
- Secrets in env only (`INTEGRATION_SECRET`, `TELEGRAM_WEBHOOK_SECRET`,
  `PII_ENCRYPTION_KEY`, `CRON_SECRET`); never commit them; list them in `.env.example`.
- Every new table: RLS disabled + realtime publication where the UI subscribes.
- Only the state machine, de-identification and risk scoring get unit tests.
- Deploy with `npx vercel --prod` after each step and verify on the live URL; tell me
  exactly which SQL I must paste into the Supabase SQL Editor (I have REST access only,
  not raw Postgres) before each deploy.

## Acceptance test (the 4-minute demo must pass)

1. Hospital doctor discharges a severe patient from Xiva with a pasted epicrisis →
   risk **red**, 5-line Uzbek brief, checklist and assigned family doctor appear in
   seconds; Telegram message arrives on the phone with age/mahalla/risk only.
2. Family doctor taps **Qabul qildim**, completes checklist + 3 vitals + the patient's
   OTP → dashboard row turns green.
3. Second patient: doctor ignores it; with `SLA_TIME_SCALE=60` the manager receives the
   escalation within ~1 minute and reassigns to the backup doctor, who closes it.
4. A visit closed as **yomon** sends an alert back to the hospital doctor.
5. Manager dashboard shows SLA %, median time, overdue list, risk distribution.
6. `POST /api/integrations/discharges` with a valid signature creates the same task;
   an invalid signature returns 401.
7. Killing the LLM key still produces a task (fallback brief, yellow risk).

## Priority if time runs out (freeze is 19 Sept 20:00)

1. Steps 1–3 + 5 + 7 (flow works **without AI**), 2. Step 6 escalation, 3. Step 9
dashboard, 4. Step 4 AI pipeline, 5. Step 10 anti-fake + privacy, 6. Step 8, 11, then the
patient notice. Do not start anything from the Could/Won't rows before all Musts pass.
After each step, state exactly what to run to verify it.
