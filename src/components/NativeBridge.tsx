"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { nativePlugin } from "@/lib/native";

const ROLE_HOMES = ["/doctor", "/nurse", "/patient", "/login"];
const PUSH_CHANNEL = "medcare_alerts";

// Runs only inside the Android shell: wires the hardware back button, an
// offline banner, push-notification registration, deep links and status bar.
// On the plain website every plugin lookup is null and this renders nothing.
export default function NativeBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const lastBackRef = useRef(0);
  const tokenRef = useRef<string | null>(null);
  const tokenSavedRef = useRef(false);
  const offlineRef = useRef(false);

  function showToast(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(null), 2000);
  }

  async function saveToken() {
    const token = tokenRef.current;
    if (!token || tokenSavedRef.current) return;
    try {
      const res = await fetch("/api/device-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, platform: "android" }),
      });
      // 403 = not logged in yet; retried on the next navigation.
      if (res.ok) tokenSavedRef.current = true;
    } catch {
      // Offline — retried later.
    }
  }

  useEffect(() => {
    const app = nativePlugin("App");
    if (!app) return;

    const handles: { remove: () => void }[] = [];
    const listen = async (plugin: unknown, event: string, cb: (data: never) => void) => {
      const p = plugin as { addListener: (e: string, c: (d: never) => void) => Promise<{ remove: () => void }> } | null;
      if (!p) return;
      handles.push(await p.addListener(event, cb));
    };

    // Status bar + splash
    nativePlugin("StatusBar")?.setBackgroundColor?.({ color: "#0f766e" }).catch(() => {});
    nativePlugin("StatusBar")?.setStyle?.({ style: "DARK" }).catch(() => {});
    nativePlugin("SplashScreen")?.hide?.().catch(() => {});

    // Hardware back button
    listen(app, "backButton", (data: { canGoBack: boolean }) => {
      const path = window.location.pathname;
      if (ROLE_HOMES.includes(path)) {
        const now = Date.now();
        if (now - lastBackRef.current < 2000) {
          app.exitApp();
        } else {
          lastBackRef.current = now;
          showToast("Chiqish uchun yana bir marta bosing");
        }
        return;
      }
      if (data.canGoBack) window.history.back();
      else router.push("/");
    });

    // Deep links: https://continuitycare-ai.vercel.app/... and medcare://...
    listen(app, "appUrlOpen", (data: { url: string }) => {
      try {
        const u = new URL(data.url);
        const path = u.protocol === "medcare:" ? `/${u.host}${u.pathname}${u.search}` : `${u.pathname}${u.search}`;
        router.push(path.replace(/\/{2,}/g, "/"));
      } catch {
        // Ignore malformed links.
      }
    });

    // Offline banner + auto reload when back online
    const network = nativePlugin("Network");
    network?.getStatus?.().then((s: { connected: boolean }) => {
      offlineRef.current = !s.connected;
      setOffline(!s.connected);
    });
    listen(network, "networkStatusChange", (s: { connected: boolean }) => {
      const wasOffline = offlineRef.current;
      offlineRef.current = !s.connected;
      setOffline(!s.connected);
      if (s.connected && wasOffline) router.refresh();
    });

    // Push notifications — only when the native shell reports Firebase is
    // configured; PushNotifications.register() crashes the process otherwise.
    const push = nativePlugin("PushNotifications");
    const appInfo = nativePlugin("AppInfo");
    if (push && appInfo) {
      (async () => {
        try {
          const info = (await appInfo.getInfo()) as { pushAvailable?: boolean };
          if (!info?.pushAvailable) return;
          let perm = await push.checkPermissions();
          if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
            perm = await push.requestPermissions();
          }
          if (perm.receive !== "granted") return;
          await push.createChannel({
            id: PUSH_CHANNEL,
            name: "MedCare ogohlantirishlari",
            description: "Shifokor ogohlantirishlari va bemor soʻrovlari",
            importance: 5,
            visibility: 1,
            sound: "default",
          });
          await listen(push, "registration", (t: { value: string }) => {
            tokenRef.current = t.value;
            tokenSavedRef.current = false;
            saveToken();
          });
          await listen(push, "registrationError", (e: unknown) => console.warn("push registration error", e));
          await listen(push, "pushNotificationReceived", (n: { title?: string; body?: string }) => {
            showToast(n.title ? `${n.title}: ${n.body ?? ""}` : (n.body ?? "Yangi bildirishnoma"));
          });
          await listen(push, "pushNotificationActionPerformed", (a: { notification: { data?: { url?: string } } }) => {
            router.push(a.notification?.data?.url ?? "/");
          });
          await push.register();
        } catch (err) {
          console.warn("push setup failed", err);
        }
      })();
    }

    // Tapping a scheduled dose reminder opens the patient page
    listen(nativePlugin("LocalNotifications"), "localNotificationActionPerformed", (a: { notification: { extra?: { url?: string } } }) => {
      router.push(a.notification?.extra?.url ?? "/patient");
    });

    return () => handles.forEach((h) => h.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retry saving the push token after the user logs in and navigates.
  useEffect(() => {
    saveToken();
  }, [pathname]);

  if (!offline && !toast) return null;

  return (
    <>
      {offline && (
        <div className="fixed inset-x-0 top-0 z-[100] bg-red-600 px-4 py-2 text-center text-xs font-semibold text-white shadow">
          📡 Internet aloqasi yoʻq — ulanish tiklanishi bilan sahifa yangilanadi
        </div>
      )}
      {toast && (
        <div className="fixed inset-x-4 bottom-6 z-[100] rounded-2xl bg-gray-900/90 px-4 py-3 text-center text-sm text-white shadow-lg backdrop-blur">
          {toast}
        </div>
      )}
    </>
  );
}
