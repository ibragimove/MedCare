"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { invalidateTerritoryCache } from "@/components/TerritoryPicker";
import { Card, Empty, Pill, INPUT, BTN_PRIMARY, BTN_GHOST } from "@/components/patient-detail/ui";
import type { NurseSummary } from "@/types/db";

interface Territory {
  id: string;
  tuman: string;
  village: string;
}

export default function TerritoriesSection() {
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [tumans, setTumans] = useState<string[]>([]);
  const [nurses, setNurses] = useState<NurseSummary[]>([]);
  const [tuman, setTuman] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [newNames, setNewNames] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [onlyUncovered, setOnlyUncovered] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, n] = await Promise.all([
        fetch("/api/territories?all=1", { cache: "no-store" }),
        fetch("/api/nurses", { cache: "no-store" }),
      ]);
      const tj = await t.json();
      if (!t.ok) throw new Error(tj.error ?? "Hududlarni yuklab boʻlmadi");
      setTerritories(tj.territories ?? []);
      setTumans(tj.tumans ?? []);
      if (n.ok) setNurses((await n.json()).nurses ?? []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
  }, [load]);

  // mahalla id → active nurses covering it
  const coverage = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const n of nurses) {
      if (!n.is_active) continue;
      for (const t of n.territories) map.set(t.id, [...(map.get(t.id) ?? []), n.full_name]);
    }
    return map;
  }, [nurses]);

  const counts = useMemo(() => {
    const m = new Map<string, { total: number; uncovered: number }>();
    for (const t of territories) {
      const c = m.get(t.tuman) ?? { total: 0, uncovered: 0 };
      c.total += 1;
      if (!coverage.has(t.id)) c.uncovered += 1;
      m.set(t.tuman, c);
    }
    return m;
  }, [territories, coverage]);

  const villages = useMemo(() => {
    const list = territories.filter((t) => t.tuman === tuman);
    return onlyUncovered ? list.filter((t) => !coverage.has(t.id)) : list;
  }, [territories, tuman, onlyUncovered, coverage]);

  async function call(url: string, init: RequestInit, done: string) {
    setPending(true);
    setActionError(null);
    setNotice(null);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Amalni bajarib boʻlmadi");
      invalidateTerritoryCache();
      setNotice(done + (json.skipped ? ` (${json.skipped} ta takror oʻtkazib yuborildi)` : ""));
      await load();
      return true;
    } catch (err) {
      setActionError((err as Error).message);
      return false;
    } finally {
      setPending(false);
    }
  }

  async function addVillages(e: React.FormEvent) {
    e.preventDefault();
    if (pending || !tuman) return;
    // One mahalla per line (or comma separated) so a manager can paste a whole list at once.
    const villagesToAdd = newNames.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    if (villagesToAdd.length === 0) {
      setActionError("Mahalla nomini kiriting");
      return;
    }
    const ok = await call("/api/territories", { method: "POST", body: JSON.stringify({ tuman, villages: villagesToAdd }) }, "Mahalla(lar) qoʻshildi ✅");
    if (ok) setNewNames("");
  }

  if (loading) return <p className="py-16 text-center text-sm text-gray-400">Yuklanmoqda...</p>;
  if (error) return <p className="rounded-2xl bg-red-50 p-5 text-sm text-red-700">{error}</p>;

  const totalUncovered = [...counts.values()].reduce((s, c) => s + c.uncovered, 0);

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <Card title="Tumanlar">
        <ul className="space-y-1">
          {tumans.map((t) => {
            const c = counts.get(t) ?? { total: 0, uncovered: 0 };
            const active = t === tuman;
            return (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => {
                    setTuman(t);
                    setEditingId(null);
                    setActionError(null);
                    setNotice(null);
                  }}
                  className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-sm transition ${
                    active ? "bg-teal-50 font-semibold text-teal-800" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="truncate">{t}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {c.uncovered > 0 && c.total > 0 && (
                      <span title="Hamshirasiz mahallalar" className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        {c.uncovered}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{c.total}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-gray-400">
          Sariq raqam — hamshirasi yoʻq mahallalar soni.{totalUncovered > 0 && ` Jami: ${totalUncovered}.`}
        </p>
      </Card>

      <div className="space-y-4">
        {!tuman ? (
          <Card>
            <Empty icon="🗺️" text="Mahallalarni koʻrish va tahrirlash uchun tumanni tanlang" />
          </Card>
        ) : (
          <Card
            title={`${tuman} — mahallalar (${villages.length})`}
            action={
              <label className="flex min-h-11 items-center gap-2 text-xs font-medium text-gray-600">
                <input type="checkbox" className="h-4 w-4 accent-teal-600" checked={onlyUncovered} onChange={(e) => setOnlyUncovered(e.target.checked)} />
                Faqat hamshirasizlar
              </label>
            }
          >
            <form onSubmit={addVillages} className="mb-4 space-y-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
                Yangi mahalla(lar)
                <textarea
                  rows={2}
                  className={INPUT}
                  value={newNames}
                  onChange={(e) => setNewNames(e.target.value)}
                  placeholder="Nomini kiriting. Bir nechta boʻlsa — har birini yangi qatorga yozing"
                />
              </label>
              <button type="submit" disabled={pending || !newNames.trim()} className={BTN_PRIMARY}>
                {pending ? "Saqlanmoqda..." : "+ Qoʻshish"}
              </button>
            </form>

            {notice && <p role="status" className="mb-3 rounded-xl bg-green-50 px-3 py-2.5 text-sm text-green-700">{notice}</p>}
            {actionError && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{actionError}</p>}

            {villages.length === 0 ? (
              <Empty icon="📍" text={onlyUncovered ? "Barcha mahallalarga hamshira biriktirilgan" : "Bu tumanda hozircha mahalla yoʻq. Yuqoridan qoʻshing."} />
            ) : (
              <ul className="divide-y divide-gray-100">
                {villages.map((v) => {
                  const covering = coverage.get(v.id);
                  const editing = editingId === v.id;
                  return (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      {editing ? (
                        <form
                          className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (await call("/api/territories", { method: "PATCH", body: JSON.stringify({ id: v.id, village: editName }) }, "Nomi yangilandi ✅")) {
                              setEditingId(null);
                            }
                          }}
                        >
                          <input autoFocus className={`${INPUT} min-w-0 flex-1`} value={editName} onChange={(e) => setEditName(e.target.value)} aria-label="Mahalla nomi" />
                          <button type="submit" disabled={pending} className={BTN_PRIMARY}>Saqlash</button>
                          <button type="button" onClick={() => setEditingId(null)} className={BTN_GHOST}>Bekor</button>
                        </form>
                      ) : (
                        <>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-800">{v.village}</p>
                            {covering ? (
                              <p className="truncate text-xs text-gray-500">{covering.join(", ")}</p>
                            ) : (
                              <Pill className="bg-amber-100 text-amber-700">Bu hudud uchun hamshira biriktirilmagan</Pill>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <button type="button" onClick={() => { setEditingId(v.id); setEditName(v.village); setActionError(null); }} className="min-h-11 rounded-lg px-3 text-xs font-semibold text-teal-700 hover:bg-teal-50">
                              Nomini oʻzgartirish
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => {
                                if (window.confirm(`“${v.village}” mahallasi oʻchirilsinmi?`)) void call(`/api/territories?id=${encodeURIComponent(v.id)}`, { method: "DELETE" }, "Mahalla oʻchirildi");
                              }}
                              className="min-h-11 rounded-lg px-3 text-xs font-semibold text-red-600 hover:bg-red-50"
                            >
                              Oʻchirish
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
