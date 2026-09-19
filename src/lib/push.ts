import "server-only";
import { createSign } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types/db";

// Sends Android push notifications through FCM HTTP v1. The Firebase service
// account JSON is supplied base64-encoded in FIREBASE_SERVICE_ACCOUNT; when it
// is absent every call is a silent no-op so the web app keeps working without
// Firebase configured.

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export interface PushPayload {
  title: string;
  body: string;
  /** In-app path to open when the notification is tapped, e.g. "/doctor". */
  url?: string;
}

const CHANNEL_ID = "medcare_alerts";

let cachedAccount: ServiceAccount | null | undefined;
let cachedToken: { value: string; expiresAt: number } | null = null;
let warnedMissing = false;

function loadServiceAccount(): ServiceAccount | null {
  if (cachedAccount !== undefined) return cachedAccount;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    cachedAccount = null;
    return null;
  }
  try {
    const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json) as ServiceAccount;
    cachedAccount = {
      project_id: parsed.project_id,
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
    };
  } catch (err) {
    console.error("FIREBASE_SERVICE_ACCOUNT is not valid JSON/base64:", err);
    cachedAccount = null;
  }
  return cachedAccount;
}

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

async function getAccessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.value;

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key, "base64url");
  const assertion = `${unsigned}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`FCM auth failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: now + data.expires_in };
  return data.access_token;
}

async function sendToToken(account: ServiceAccount, accessToken: string, token: string, payload: PushPayload) {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: payload.title, body: payload.body },
        data: { url: payload.url ?? "/" },
        android: {
          priority: "high",
          notification: { channel_id: CHANNEL_ID, sound: "default", click_action: "FCM_PLUGIN_ACTIVITY" },
        },
      },
    }),
  });

  if (res.ok) return true;
  const text = await res.text();
  // Stale/uninstalled tokens come back as UNREGISTERED (404) — drop them.
  if (res.status === 404 || text.includes("UNREGISTERED")) {
    await createAdminClient().from("device_tokens").delete().eq("token", token);
    return false;
  }
  console.error("FCM send failed:", res.status, text);
  return false;
}

/** Push to every device registered to the given profiles. Never throws. */
export async function sendPushToProfiles(profileIds: string[], payload: PushPayload): Promise<number> {
  const account = loadServiceAccount();
  if (!account) {
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn("FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled");
    }
    return 0;
  }
  if (profileIds.length === 0) return 0;

  try {
    const supabase = createAdminClient();
    const { data: rows } = await supabase
      .from("device_tokens")
      .select("token")
      .in("profile_id", profileIds);
    const tokens = (rows ?? []).map((r) => r.token as string);
    if (tokens.length === 0) return 0;

    const accessToken = await getAccessToken(account);
    const results = await Promise.all(tokens.map((t) => sendToToken(account, accessToken, t, payload)));
    return results.filter(Boolean).length;
  } catch (err) {
    console.error("sendPushToProfiles failed:", err);
    return 0;
  }
}

/** Push to everyone with the given role (e.g. all doctors). Never throws. */
export async function sendPushToRole(role: UserRole, payload: PushPayload): Promise<number> {
  try {
    const { data: profiles } = await createAdminClient().from("profiles").select("id").eq("role", role);
    return sendPushToProfiles((profiles ?? []).map((p) => p.id as string), payload);
  } catch (err) {
    console.error("sendPushToRole failed:", err);
    return 0;
  }
}
