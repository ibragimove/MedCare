"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TaskCard from "@/components/nurse/TaskCard";
import { EmptyState, ErrorBanner, SkeletonCards, callApi, useNow } from "@/components/nurse/shared";
import { sortTasks, summarize } from "@/lib/nurse-ui";
import type { NurseTaskCard, NurseTasksResponse } from "@/types/nurse";

const POLL_MS = 30_000;

export default function TasksTab() {
  const [tasks, setTasks] = useState<NurseTaskCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [skewMs, setSkewMs] = useState(0);
  const [accepting, setAccepting] = useState<Set<string>>(new Set());
  const busy = useRef<Set<string>>(new Set());
  const now = useNow(15_000, skewMs);

  const load = useCallback(async () => {
    try {
      const data = await callApi<NurseTasksResponse>("/api/care-tasks");
      setTasks(data.tasks);
      setSkewMs(new Date(data.serverNow).getTime() - Date.now());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
    // 30 s polling, paused while the tab is hidden.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // Optimistic "Qabul qildim": flips the card at once, rolls back if the server refuses.
  // The API is idempotent, so a double tap or a retry after a lost response is harmless.
  async function accept(task: NurseTaskCard) {
    if (busy.current.has(task.id)) return;
    busy.current.add(task.id);
    setAccepting(new Set(busy.current));
    setNotice(null);
    const previous = tasks;
    setTasks((list) =>
      list?.map((t) => (t.id === task.id ? { ...t, status: "accepted", accepted_at: new Date().toISOString() } : t)) ?? list,
    );
    try {
      await callApi(`/api/care-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      setNotice("Vazifa qabul qilindi ✅");
    } catch (err) {
      setTasks(previous);
      setError((err as Error).message);
    } finally {
      busy.current.delete(task.id);
      setAccepting(new Set(busy.current));
      void load();
    }
  }

  const sorted = useMemo(() => (tasks ? sortTasks(tasks, now) : []), [tasks, now]);
  const counts = useMemo(() => summarize(tasks ?? [], now), [tasks, now]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2" aria-label="Vazifalar xulosasi">
        {[
          { label: "Yangi", value: counts.fresh, tone: "text-blue-700 bg-blue-50 border-blue-100" },
          { label: "Jarayonda", value: counts.inProgress, tone: "text-teal-700 bg-teal-50 border-teal-100" },
          { label: "Kechikkan", value: counts.overdue, tone: counts.overdue > 0 ? "text-red-700 bg-red-50 border-red-200" : "text-gray-500 bg-gray-50 border-gray-100" },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl border px-3 py-3 text-center ${s.tone}`}>
            <p className="text-2xl font-extrabold leading-none">{tasks ? s.value : "–"}</p>
            <p className="mt-1 text-xs font-semibold">{s.label}</p>
          </div>
        ))}
      </div>

      {notice && (
        <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          {notice}
        </p>
      )}
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      {tasks === null && !error ? (
        <SkeletonCards />
      ) : sorted.length === 0 ? (
        tasks !== null && <EmptyState icon="🎉" title="Hozircha vazifa yoʻq" hint="Yangi vazifa kelganda bu yerda paydo boʻladi." />
      ) : (
        <div className="space-y-3">
          {sorted.map((task) => (
            <TaskCard key={task.id} task={task} now={now} accepting={accepting.has(task.id)} onAccept={accept} />
          ))}
        </div>
      )}
    </div>
  );
}
