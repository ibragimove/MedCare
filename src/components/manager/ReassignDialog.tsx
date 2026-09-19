"use client";

import { useEffect, useMemo, useState } from "react";
import { BTN_PRIMARY, BTN_GHOST } from "@/components/patient-detail/ui";
import type { NurseSummary } from "@/types/db";

export interface ReassignTarget {
  id: string;
  patientName: string;
  tuman: string;
  nurseId: string | null;
}

// Manager picks another active nurse for an overdue / escalated task; the API resets the SLA window.
export default function ReassignDialog({
  task,
  onClose,
  onDone,
}: {
  task: ReassignTarget;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [nurses, setNurses] = useState<NurseSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/nurses", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Hamshiralarni yuklab boʻlmadi");
        setNurses(json.nurses ?? []);
      })
      .catch((err: Error) => setLoadError(err.message));
  }, []);

  // Same tuman first, then by fewest active patients.
  const options = useMemo(() => {
    const norm = (s: string) => s.trim().toLocaleLowerCase("uz");
    return (nurses ?? [])
      .filter((n) => n.is_active && n.id !== task.nurseId)
      .sort((a, b) => {
        const sa = norm(a.tuman) === norm(task.tuman) ? 0 : 1;
        const sb = norm(b.tuman) === norm(task.tuman) ? 0 : 1;
        return sa - sb || a.active_patients - b.active_patients;
      });
  }, [nurses, task.nurseId, task.tuman]);

  async function submit() {
    if (!selected || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/manager/tasks/${task.id}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nurseId: selected }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Qayta tayinlab boʻlmadi");
      onDone(`Vazifa ${json.nurse?.full_name ?? "hamshira"}ga qayta tayinlandi ✅`);
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={() => !pending && onClose()}
      onKeyDown={(e) => e.key === "Escape" && !pending && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reassign-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
      >
        <h2 id="reassign-title" className="text-lg font-bold text-gray-900">Vazifani qayta tayinlash</h2>
        <p className="text-sm text-gray-500">
          {task.patientName} · {task.tuman}. Yangi hamshiraga yangi SLA muddati beriladi.
        </p>

        <div className="mt-4">
          {loadError ? (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{loadError}</p>
          ) : !nurses ? (
            <p className="py-6 text-center text-sm text-gray-400">Yuklanmoqda...</p>
          ) : options.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-800">Boshqa faol hamshira topilmadi. Xodimlar boʻlimidan hamshira qoʻshing.</p>
          ) : (
            <ul className="space-y-2" role="radiogroup" aria-label="Hamshira">
              {options.map((n) => (
                <li key={n.id}>
                  <label className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2 ${selected === n.id ? "border-teal-500 bg-teal-50" : "border-gray-200 hover:bg-gray-50"}`}>
                    <input type="radio" name="nurse" className="h-4 w-4 accent-teal-600" checked={selected === n.id} onChange={() => setSelected(n.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gray-800">{n.full_name}</span>
                      <span className="block truncate text-xs text-gray-500">
                        {n.tuman} · {n.active_patients} ta faol bemor
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} disabled={pending} className={BTN_GHOST}>Bekor qilish</button>
          <button type="button" onClick={() => void submit()} disabled={!selected || pending} className={BTN_PRIMARY}>
            {pending ? "Saqlanmoqda..." : "Qayta tayinlash"}
          </button>
        </div>
      </div>
    </div>
  );
}
