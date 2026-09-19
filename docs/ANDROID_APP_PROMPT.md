# Prompt: Build the MedCare Android app

Copy everything below the line into your AI coding tool (Claude, Antigravity, Cursor, etc.).

---

You are building an **Android app for MedCare**, a working, deployed Next.js web platform
for Uzbekistan's rural post-discharge patient care ("Aktiv Patronaj"). Do NOT rebuild the
product natively — wrap and integrate the existing web app, then add the native capabilities
a phone makes possible. Everything user-facing must be in **Uzbek (Latin script)**; code,
comments and commit messages in English.

## What already exists (do not change its behaviour)

- Live web app: `https://continuitycare-ai.vercel.app` (Next.js 16 App Router, Tailwind,
  Supabase Auth + Postgres + Realtime, Google Gemini AI, Telegram Bot API).
- It is already a PWA: `/manifest.webmanifest`, icons at `/logo-192.png` and
  `/logo-512.png`, theme color `#0f766e`, `start_url` = `/login`.
- Three roles with separate home routes, enforced server-side by `src/proxy.ts`
  (unauthenticated → `/login`; wrong role → own home):
  - **Shifokor (doctor)** → `/doctor` — discharges patients, AI generates recovery
    trajectory + medication plan, auto-routes the patient to the nearest nurse in the
    same *tuman* (district), sees realtime alerts, adds nurses.
  - **Hamshira (nurse)** → `/nurse` and `/nurse/[patientId]` — daily yes/no check-ins,
    AI scores recovery match (0–100%) and alerts the doctor on deviation.
  - **Bemor (patient)** → `/patient` — medication schedule with "Ichdim" dose tracking,
    treatment progress, callback request, and a **streaming AI chat** (`POST /api/chat`
    returns `text/plain` chunks; multi-turn memory is stored in `chat_messages`).
- Demo accounts (password `Demo1234!`): `shifokor@demo.uz`, `hamshira@demo.uz`,
  `bemor@demo.uz`.
- Auth is cookie-based (`@supabase/ssr`), so the WebView must keep cookies and use an
  `https` scheme; API routes require the session cookie and return `403` otherwise.
- Existing JSON API routes (all role-guarded): `POST /api/patients`, `GET|POST /api/nurses`,
  `POST /api/patients/[id]/assign-nurse`, `POST /api/patients/[id]/complete`,
  `POST /api/checkins`, `POST /api/dose-logs`, `POST /api/callback-requests`,
  `POST /api/alerts/[id]/resolve`, `POST /api/telegram/remind`, `POST /api/chat` (stream).
- Repo layout: `src/app/*` routes, `src/components/*`, `src/lib/gemini.ts`,
  `src/lib/supabase/*`, `supabase/*.sql` migrations. RLS is OFF (hackathon demo);
  authorization lives in API routes.

## Goal

Ship an installable Android app (`.apk` for demo + `.aab` for Play Store) named
**MedCare** that loads the live site in a native shell and adds:

1. **Native shell** — use **Capacitor** (`@capacitor/core`, `@capacitor/android`) with
   `server.url = "https://continuitycare-ai.vercel.app"` and `androidScheme: "https"` so
   Supabase cookies work. Add `allowNavigation` for the Vercel domain and
   `*.supabase.co`. Splash screen and launcher icon must use the MedCare logo
   (`public/logo.png` / `logo-512.png`); status bar color `#0f766e`. If Capacitor is not
   possible, fall back to a **Trusted Web Activity** via Bubblewrap using the existing
   manifest — but Capacitor is preferred because of items 3–5 below.
2. **Navigation behaviour** — hardware back button goes back in WebView history; on the
   role home page (`/doctor`, `/nurse`, `/patient`) a second back press exits. Show a
   native "Internet aloqasi yoʻq" banner when offline and auto-reload when back online.
   External links (`tel:`, `https://t.me/...`) open the dialer / Telegram, not the WebView.
3. **Push notifications (FCM)** via `@capacitor/push-notifications`:
   - Add a `device_tokens` table (`profile_id uuid`, `token text unique`, `platform text`,
     `created_at`) with a migration in `supabase/migration_005_device_tokens.sql`, RLS
     disabled like the other tables.
   - Add `POST /api/device-tokens` (any logged-in role) that upserts the token for the
     current user, called from the app after login and on token refresh.
   - Add `src/lib/push.ts` that sends via FCM HTTP v1 using a service-account JSON in
     `FIREBASE_SERVICE_ACCOUNT` (env var, base64). Trigger it wherever Telegram alerts are
     already sent: doctor alerts on check-in deviation and on patient callback requests;
     patient dose reminders at each `medication_plan.items[].times` (cron via Vercel
     `vercel.json` `crons` hitting a new `GET /api/cron/dose-reminders` protected by
     `CRON_SECRET`). Tapping a notification deep-links into the right page.
4. **Deep links** — App Links for `https://continuitycare-ai.vercel.app/*` (assetlinks.json
   served from `public/.well-known/assetlinks.json`) plus a custom scheme `medcare://`
   mapped to the same routes.
5. **Phone-native touches** — `tel:` buttons on `/patient` open the dialer; keep the
   session across app restarts (WebView cookie jar); haptic feedback on "Ichdim" dose
   toggle (`@capacitor/haptics`); keyboard should not cover the AI chat input
   (`@capacitor/keyboard`, `resize: body`).

## Constraints

- Do not fork the web UI into native screens; every screen stays the web app.
- Keep all existing web behaviour and role guards intact; new server code must reuse
  `requireRole()` from `src/lib/auth.ts` and the admin client from
  `src/lib/supabase/admin.ts`.
- Secrets only via env vars (`.env.local` locally, Vercel env in production); never commit
  the Firebase service account or keystore.
- Minimum Android 8.0 (API 26); target latest stable.
- Uzbek strings everywhere the user sees text (notification titles/bodies too), using the
  `ʻ` character in words like `oʻzbek`, `koʻrsatkich`.

## Deliverables

1. `android/` Capacitor project inside the repo with `capacitor.config.ts`.
2. The Supabase migration, `POST /api/device-tokens`, `src/lib/push.ts`, cron route and
   `vercel.json`.
3. `docs/ANDROID.md` — build & run steps (`npm run build:android`, `npx cap sync android`,
   `npx cap open android`), how to generate the release keystore, how to produce the `.aab`,
   and the Firebase/FCM setup checklist.
4. A short test plan covering: login for all three roles, back-button behaviour, offline
   banner, receiving a deviation-alert push as the doctor, receiving a dose-reminder push as
   the patient, and `tel:` links opening the dialer.

Work incrementally: get the plain Capacitor wrapper installing and logging in first, then
push notifications, then deep links. After each step, state exactly what to run to verify it.
