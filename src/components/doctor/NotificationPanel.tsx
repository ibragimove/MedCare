"use client";

import { useEffect, useRef } from "react";
import type { Alert } from "@/types/db";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Hozirgina";
  if (mins < 60) return `${mins} daq. oldin`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} soat oldin`;
  return `${Math.floor(hours / 24)} kun oldin`;
}

interface Props {
  alerts: Alert[];
  onResolve: (id: string) => void;
  onClose: () => void;
}

export default function NotificationPanel({ alerts, onResolve, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-gray-800">Bildirishnomalar</span>
          {alerts.length > 0 && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {alerts.length}
            </span>
          )}
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* List */}
      <div className="max-h-96 overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-2xl">🎉</p>
            <p className="mt-2 text-sm font-medium text-gray-600">Yangi bildirishnomalar yoʻq</p>
            <p className="text-xs text-gray-400">Hamma yaxshi!</p>
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-start gap-3 border-b border-gray-50 p-4 last:border-0 hover:bg-gray-50"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm">
                ⚠️
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">
                  {alert.patients?.full_name ?? "Bemor"}
                </p>
                <p className="mt-0.5 text-xs text-gray-600 line-clamp-2">{alert.reason}</p>
                <p className="mt-1 text-[10px] text-gray-400">{timeAgo(alert.created_at)}</p>
              </div>
              <button
                onClick={() => onResolve(alert.id)}
                className="shrink-0 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
              >
                ✓ Yopish
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {alerts.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-2.5 text-center">
          <p className="text-xs text-gray-400">Jami {alerts.length} ta ogohlantirish</p>
        </div>
      )}
    </div>
  );
}
