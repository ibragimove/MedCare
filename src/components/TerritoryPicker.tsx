"use client";

import { useEffect, useMemo, useState } from "react";

export interface PickerVillage {
  id: string;
  village: string;
}

interface CommonProps {
  tuman: string;
  onTumanChange: (tuman: string) => void;
  required?: boolean;
  disabled?: boolean;
  /** Label for the tuman select. */
  tumanLabel?: string;
  /** Label for the mahalla control. */
  villageLabel?: string;
  className?: string;
}

interface SingleProps extends CommonProps {
  multiple?: false;
  villageId: string;
  onVillageChange: (id: string, village: string) => void;
}

interface MultiProps extends CommonProps {
  multiple: true;
  villageIds: string[];
  onVillagesChange: (ids: string[], villages: string[]) => void;
}

export type TerritoryPickerProps = SingleProps | MultiProps;

const FIELD =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:opacity-60";

// Lists change rarely, so they are shared between picker instances on a page.
const tumanCache: { value: string[] | null } = { value: null };
const villageCache = new Map<string, PickerVillage[]>();

// Call after territories are added/renamed/removed so pickers refetch.
export function invalidateTerritoryCache() {
  tumanCache.value = null;
  villageCache.clear();
}

export default function TerritoryPicker(props: TerritoryPickerProps) {
  const { tuman, onTumanChange, required, disabled, className = "" } = props;
  const tumanLabel = props.tumanLabel ?? "Tuman";
  const villageLabel = props.villageLabel ?? "Mahalla";

  const [tumans, setTumans] = useState<string[] | null>(tumanCache.value);
  const [tumanError, setTumanError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ tuman: string; villages: PickerVillage[]; error: string | null } | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (tumanCache.value) return;
    let cancelled = false;
    fetch("/api/territories", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Tumanlar yuklanmadi");
        return json.tumans as string[];
      })
      .then((list) => {
        tumanCache.value = list;
        if (!cancelled) setTumans(list);
      })
      .catch((err: Error) => {
        if (!cancelled) setTumanError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!tuman || villageCache.has(tuman)) return;
    let cancelled = false;
    fetch(`/api/territories?tuman=${encodeURIComponent(tuman)}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Mahallalar yuklanmadi");
        return json.villages as PickerVillage[];
      })
      .then((villages) => {
        villageCache.set(tuman, villages);
        if (!cancelled) setLoaded({ tuman, villages, error: null });
      })
      .catch((err: Error) => {
        if (!cancelled) setLoaded({ tuman, villages: [], error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [tuman]);

  const cachedVillages = tuman ? villageCache.get(tuman) : undefined;
  const villages = useMemo(
    () => cachedVillages ?? (loaded?.tuman === tuman ? loaded.villages : []),
    [cachedVillages, loaded, tuman],
  );
  const loading = Boolean(tuman) && !cachedVillages && loaded?.tuman !== tuman;
  const villageError = loaded?.tuman === tuman ? loaded.error : null;

  const selectedIds = props.multiple ? props.villageIds : props.villageId ? [props.villageId] : [];

  function handleTuman(next: string) {
    onTumanChange(next);
    setSearch("");
    if (props.multiple) props.onVillagesChange([], []);
    else props.onVillageChange("", "");
  }

  function emitMulti(ids: string[]) {
    if (!props.multiple) return;
    const names = villages.filter((v) => ids.includes(v.id)).map((v) => v.village);
    props.onVillagesChange(ids, names);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("uz");
    return q ? villages.filter((v) => v.village.toLocaleLowerCase("uz").includes(q)) : villages;
  }, [villages, search]);

  const allSelected = villages.length > 0 && villages.every((v) => selectedIds.includes(v.id));

  return (
    <div className={`grid gap-4 ${props.multiple ? "" : "sm:grid-cols-2"} ${className}`}>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
        {tumanLabel}
        <select
          required={required}
          disabled={disabled}
          className={FIELD}
          value={tuman}
          onChange={(e) => handleTuman(e.target.value)}
        >
          <option value="">Tumanni tanlang</option>
          {(tumans ?? []).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {tumanError && <span className="text-xs font-normal text-red-600">{tumanError}</span>}
      </label>

      {props.multiple ? (
        <div className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
          <div className="flex items-center justify-between gap-2">
            <span>
              {villageLabel}lar
              {selectedIds.length > 0 && (
                <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-700">
                  {selectedIds.length} ta tanlandi
                </span>
              )}
            </span>
            {villages.length > 0 && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => emitMulti(allSelected ? [] : villages.map((v) => v.id))}
                className="min-h-9 rounded-lg px-2 text-xs font-semibold text-teal-700 hover:bg-teal-50"
              >
                {allSelected ? "Tanlovni bekor qilish" : "Barchasi"}
              </button>
            )}
          </div>

          {!tuman ? (
            <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-xs font-normal text-gray-500">
              Avval tumanni tanlang — mahallalar shu yerda chiqadi.
            </p>
          ) : loading ? (
            <p className="rounded-xl bg-gray-50 px-3 py-4 text-xs font-normal text-gray-500">Mahallalar yuklanmoqda...</p>
          ) : villageError ? (
            <p className="rounded-xl bg-red-50 px-3 py-4 text-xs font-normal text-red-600">{villageError}</p>
          ) : villages.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-3 py-4 text-xs font-normal text-amber-700">
              Bu tumanda mahalla topilmadi. Menejer sahifasidagi &quot;Hududlar&quot; boʻlimida qoʻshing.
            </p>
          ) : (
            <>
              <input
                type="search"
                className={FIELD}
                placeholder="Mahalla qidirish..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="max-h-56 overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white">
                {filtered.length === 0 && (
                  <p className="px-3 py-3 text-xs font-normal text-gray-500">Hech narsa topilmadi</p>
                )}
                {filtered.map((v) => {
                  const checked = selectedIds.includes(v.id);
                  return (
                    <label
                      key={v.id}
                      className={`flex min-h-11 cursor-pointer items-center gap-3 border-b border-gray-50 px-3 text-sm font-normal last:border-b-0 ${
                        checked ? "bg-teal-50 text-teal-800" : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={disabled}
                        className="h-4 w-4 accent-teal-600"
                        checked={checked}
                        onChange={() =>
                          emitMulti(checked ? selectedIds.filter((id) => id !== v.id) : [...selectedIds, v.id])
                        }
                      />
                      {v.village}
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : (
        <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
          {villageLabel}
          <select
            required={required}
            disabled={disabled || !tuman || loading}
            className={FIELD}
            value={props.villageId}
            onChange={(e) => {
              const found = villages.find((v) => v.id === e.target.value);
              props.onVillageChange(e.target.value, found?.village ?? "");
            }}
          >
            <option value="">
              {!tuman
                ? "Avval tumanni tanlang"
                : loading
                  ? "Yuklanmoqda..."
                  : villages.length === 0
                    ? "Bu tumanda mahalla topilmadi"
                    : "Mahallani tanlang"}
            </option>
            {villages.map((v) => (
              <option key={v.id} value={v.id}>
                {v.village}
              </option>
            ))}
          </select>
          {villageError && <span className="text-xs font-normal text-red-600">{villageError}</span>}
        </label>
      )}
    </div>
  );
}
