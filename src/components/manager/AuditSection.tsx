"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Empty, INPUT, BTN_GHOST } from "@/components/patient-detail/ui";

interface Entry {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_LABEL: Record<string, string> = {
  "nurse.created": "Hamshira yaratildi",
  "nurse.updated": "Hamshira yangilandi",
  "territory.created": "Mahalla qoʻshildi",
  "territory.renamed": "Mahalla nomi oʻzgardi",
  "territory.deleted": "Mahalla oʻchirildi",
  "settings.updated": "Sozlama oʻzgardi",
};

const describe = (action: string) => ACTION_LABEL[action] ?? action;

// Short one-line view of the audit metadata.
function summarize(meta: Entry["meta"]): string {
  if (!meta) return "";
  return Object.entries(meta)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export default function AuditSection() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const q = new URLSearchParams();
    if (action) q.set("action", action);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    try {
      const res = await fetch(`/api/manager/audit?${q}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Jurnalni yuklab boʻlmadi");
      setEntries(json.entries ?? []);
      setActions(json.actions ?? []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [action, from, to]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when filters change
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <select className={INPUT} value={action} onChange={(e) => setAction(e.target.value)} aria-label="Amal turi">
            <option value="">Barcha amallar</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {describe(a)}
              </option>
            ))}
          </select>
          <input type="date" className={INPUT} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="Boshlanish sanasi" />
          <input type="date" className={INPUT} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="Tugash sanasi" />
          <button type="button" className={BTN_GHOST} onClick={() => { setAction(""); setFrom(""); setTo(""); }}>
            Tozalash
          </button>
        </div>
      </Card>

      {error && <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}

      <Card title={`Yozuvlar (${entries.length})`}>
        {loading && entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Yuklanmoqda...</p>
        ) : entries.length === 0 ? (
          <Empty icon="🧾" text="Yozuvlar topilmadi" />
        ) : (
          <ul className={`divide-y divide-gray-100 transition-opacity ${loading ? "opacity-50" : ""}`}>
            {entries.map((e) => (
              <li key={e.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-800">{describe(e.action)}</p>
                  <time className="text-xs text-gray-400" dateTime={e.created_at}>
                    {new Date(e.created_at).toLocaleString("uz-UZ")}
                  </time>
                </div>
                <p className="text-xs text-gray-500">
                  {e.actor_name ?? "Tizim"} · {e.entity_type}
                </p>
                {e.meta && <p className="mt-1 break-words text-xs text-gray-400">{summarize(e.meta)}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
