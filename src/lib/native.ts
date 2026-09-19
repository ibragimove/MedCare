// Thin, dependency-free access to the Capacitor bridge that the Android shell
// injects into the page. On the plain website every helper is a no-op, so the
// web bundle never imports @capacitor/* packages.

import type { MedicationPlanItem } from "@/types/db";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, any>;
}

function capacitor(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor ?? null;
}

export function isNativeApp(): boolean {
  return Boolean(capacitor()?.isNativePlatform?.());
}

export function nativePlugin(name: string): any | null {
  const cap = capacitor();
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.[name] ?? null;
}

/** Short haptic tap (e.g. marking a dose as taken). */
export async function hapticTap() {
  try {
    await nativePlugin("Haptics")?.impact({ style: "MEDIUM" });
  } catch {
    // Not available — ignore.
  }
}

const REMINDER_CHANNEL = "medcare_reminders";
const REMINDER_ID_BASE = 1000;

/**
 * Schedules a repeating local notification on the phone for every dose time
 * in the plan, replacing any previously scheduled reminders.
 */
export async function scheduleDoseReminders(items: MedicationPlanItem[]) {
  const ln = nativePlugin("LocalNotifications");
  if (!ln) return;

  try {
    const perm = await ln.checkPermissions();
    if (perm.display !== "granted") {
      const req = await ln.requestPermissions();
      if (req.display !== "granted") return;
    }

    await ln.createChannel({
      id: REMINDER_CHANNEL,
      name: "Dori eslatmalari",
      description: "Dori qabul qilish vaqti eslatmalari",
      importance: 4,
      visibility: 1,
      sound: "default",
    });

    const { notifications: pending } = await ln.getPending();
    const ours = (pending ?? []).filter((n: { id: number }) => n.id >= REMINDER_ID_BASE && n.id < REMINDER_ID_BASE + 1000);
    if (ours.length) await ln.cancel({ notifications: ours.map((n: { id: number }) => ({ id: n.id })) });

    let id = REMINDER_ID_BASE;
    const notifications = items.flatMap((item) =>
      item.times.map((time) => {
        const [hour, minute] = time.split(":").map(Number);
        return {
          id: id++,
          title: "Dori vaqti keldi",
          body: `${item.drug} ${item.dosage}${item.withFood ? " — ovqat bilan" : ""}`,
          channelId: REMINDER_CHANNEL,
          extra: { url: "/patient" },
          schedule: { on: { hour, minute }, repeats: true, allowWhileIdle: true },
        };
      }),
    );

    if (notifications.length) await ln.schedule({ notifications });
  } catch (err) {
    console.warn("scheduleDoseReminders failed:", err);
  }
}
