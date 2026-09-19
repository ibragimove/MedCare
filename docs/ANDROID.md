# MedCare Android app

The Android app is a [Capacitor](https://capacitorjs.com) shell that loads the live site
(`https://continuitycare-ai.vercel.app`) in a native WebView and adds push notifications,
on-device dose reminders, deep links, an offline banner, hardware back-button handling and
haptics. Every screen is still the web app — nothing is re-implemented natively.

## Layout

| Path | What it is |
|------|------------|
| `capacitor.config.ts` | App id `uz.medcare.app`, remote `server.url`, plugin settings |
| `android/` | Generated Android Studio project (Gradle) |
| `capacitor-web/` | Placeholder page shown only if the site can't be reached on cold start |
| `assets/logo.png` | Source for launcher icon + splash (`npm run android:assets`) |
| `src/components/NativeBridge.tsx` | Runs inside the app only: back button, offline banner, push registration, deep links |
| `src/lib/native.ts` | Haptics + local dose-reminder scheduling helpers (no-ops on the website) |
| `src/lib/push.ts` | FCM HTTP v1 sender (used by check-in deviation + callback alerts + daily cron) |
| `src/app/api/device-tokens/route.ts` | App posts its FCM token here after login |
| `src/app/api/cron/dose-reminders/route.ts` | Daily "Bugungi dorilar" push (Vercel cron, see `vercel.json`) |
| `supabase/migration_005_device_tokens.sql` | `device_tokens` table |
| `public/.well-known/assetlinks.json` | App Links verification for the release signing key |

## Prerequisites (one-time)

- Node 20+ and the repo's `npm install`
- **JDK 21** (Capacitor 8 requirement) — e.g. Temurin
- **Android SDK**: platform-tools, `platforms;android-36`, `build-tools;36.0.0`
  (Android Studio installs these, or use `sdkmanager` from the command-line tools)
- Environment: `JAVA_HOME` → JDK 21, `ANDROID_HOME` → SDK root, and `android/local.properties`
  containing `sdk.dir=D:/android-tools/sdk` — use forward slashes or doubled backslashes;
  a single-backslash Windows path is mis-parsed and the build fails (Android Studio writes
  this file automatically)
- **Windows gotcha:** keep the JDK and SDK in paths without spaces or `+` characters
  (e.g. `D:\android-tools\jdk21`, `D:\android-tools\sdk`). A folder like `jdk-21.0.12+1`
  makes Gradle fail with "The filename, directory name, or volume label syntax is incorrect".

## Build & run

```bash
# 1. Regenerate icons/splash if the logo changed (optional)
npm run android:assets

# 2. Sync plugins + config into android/
npm run build:android          # = npx cap sync android

# 3a. Open in Android Studio (run on emulator/device from there)
npm run android:open

# 3b. Or build from the terminal
npm run android:apk            # → android/app/build/outputs/apk/release/app-release.apk
npm run android:aab            # → android/app/build/outputs/bundle/release/app-release.aab
```

Install the APK on a phone with `adb install -r android/app/build/outputs/apk/release/app-release.apk`
(or copy it to the phone and open it; "unknown sources" must be allowed).

## Release signing

`android/app/build.gradle` reads `android/keystore.properties` (git-ignored). Without it,
release builds are signed with the debug key — fine for a demo, not for the Play Store.

```bash
# Generate a keystore (keep it safe; losing it means you can never update the app)
keytool -genkeypair -v -keystore android/keystore/medcare-release.jks -alias medcare \
  -keyalg RSA -keysize 2048 -validity 10000 -storepass <pass> -keypass <pass> \
  -dname "CN=MedCare, O=MedCare, L=Urganch, C=UZ"
```

`android/keystore.properties`:

```
storeFile=keystore/medcare-release.jks
storePassword=<pass>
keyAlias=medcare
keyPassword=<pass>
```

Whenever the signing key changes, update the SHA-256 fingerprint in
`public/.well-known/assetlinks.json` (`keytool -list -v -keystore ... | grep SHA256`) and
redeploy the website, otherwise App Links stop opening in the app.

## Push notifications (FCM) setup checklist

Push is fully wired but inert until Firebase is configured:

1. Create a Firebase project → add an Android app with package `uz.medcare.app`.
2. Download `google-services.json` into `android/app/` (git-ignored). Rebuild the app.
3. Project settings → Service accounts → *Generate new private key* (JSON).
4. Base64-encode that JSON and set it as `FIREBASE_SERVICE_ACCOUNT` on Vercel (Production)
   and in `.env.local`:
   ```bash
   node -e "console.log(require('fs').readFileSync('service-account.json').toString('base64'))"
   npx vercel env add FIREBASE_SERVICE_ACCOUNT production
   ```
5. Run `supabase/migration_005_device_tokens.sql` in the Supabase SQL Editor.
6. `CRON_SECRET` is already set on Vercel; the daily cron in `vercel.json` runs at 03:00 UTC
   (08:00 Tashkent). Exact per-dose alarms are scheduled on the phone by
   `scheduleDoseReminders()` when the patient opens `/patient`.

What triggers a push:

| Event | Recipient | Opens |
|-------|-----------|-------|
| Nurse check-in scores a deviation | all doctors | `/doctor` |
| Patient requests a callback | all doctors | `/doctor` |
| Daily cron | each active patient with a medication plan | `/patient` |
| On-device alarm at each dose time | that patient | `/patient` |

## Test plan

1. **Login, all roles** — open the app, use the three demo buttons on `/login`
   (`shifokor@demo.uz`, `hamshira@demo.uz`, `bemor@demo.uz`, password `Demo1234!`).
   Each lands on its own home; kill and reopen the app — still logged in (cookies kept).
2. **Back button** — from `/nurse/<id>` press back → returns to `/nurse`. On `/nurse`
   press back → toast "Chiqish uchun yana bir marta bosing"; press again within 2 s → app exits.
3. **Offline banner** — enable airplane mode → red "Internet aloqasi yoʻq" banner appears;
   disable it → banner disappears and the page refreshes.
4. **Deviation push (doctor)** — log in as doctor on the phone (token registered), then on
   another device as nurse submit a check-in answering "Yoʻq" to everything → phone shows
   "⚠️ Chetlanish: <bemor>"; tapping opens `/doctor`.
5. **Dose reminder (patient)** — log in as patient, open `/patient` once (schedules alarms).
   At the next `medication_plan` time a "Dori vaqti keldi" notification fires even with the
   app closed; tapping opens `/patient`. The daily cron push arrives at 08:00 Tashkent.
6. **`tel:` links** — on `/patient` tap "📞 Shifokorga qoʻngʻiroq" → the phone dialer opens
   with the number prefilled. Tap a Telegram link → Telegram app opens.
7. **Deep links** — `adb shell am start -a android.intent.action.VIEW -d "medcare://patient"`
   and `-d "https://continuitycare-ai.vercel.app/doctor"` both open the app on that page.
8. **Haptics** — tapping "Ichdim" on a dose gives a short vibration.
