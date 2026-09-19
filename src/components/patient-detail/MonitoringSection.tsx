"use client";

import { fmtDate, fmtDateTime } from "@/lib/patient-status";
import type { Checkin } from "@/types/db";
import { Card, Empty, Pill } from "./ui";

function pctStyle(pct: number) {
  if (pct >= 90) return "bg-emerald-100 text-emerald-700";
  if (pct >= 70) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

// Inline SVG trend of match_percent (oldest → newest) with the 70% / 90% thresholds.
function TrendChart({ checkins }: { checkins: Checkin[] }) {
  const points = [...checkins].reverse().slice(-20);
  if (points.length < 2) return null;

  const W = 320;
  const H = 120;
  const pad = { l: 28, r: 8, t: 8, b: 16 };
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (points.length - 1);
  const y = (v: number) => pad.t + ((100 - v) * (H - pad.t - pad.b)) / 100;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.match_percent).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full" role="img" aria-label="Holat dinamikasi grafigi">
      {[70, 90].map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e5e7eb" strokeDasharray="3 3" />
          <text x={pad.l - 4} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#9ca3af">
            {t}
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="#0d9488" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle
          key={p.id}
          cx={x(i)}
          cy={y(p.match_percent)}
          r="3.5"
          fill={p.match_percent >= 90 ? "#10b981" : p.match_percent >= 70 ? "#f59e0b" : "#ef4444"}
          stroke="#fff"
          strokeWidth="1.5"
        >
          <title>{`${fmtDate(p.date)} — ${p.match_percent}%`}</title>
        </circle>
      ))}
      <text x={pad.l} y={H - 3} fontSize="9" fill="#9ca3af">
        {fmtDate(points[0].date)}
      </text>
      <text x={W - pad.r} y={H - 3} fontSize="9" fill="#9ca3af" textAnchor="end">
        {fmtDate(points[points.length - 1].date)}
      </text>
    </svg>
  );
}

export default function MonitoringSection({ checkins }: { checkins: Checkin[] }) {
  if (checkins.length === 0) {
    return (
      <Card title="Kuzatuv">
        <Empty icon="📈" text="Hali birorta tekshiruv (check-in) topshirilmagan" />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card title="Holat dinamikasi">
        <TrendChart checkins={checkins} />
        <p className="mt-1 text-xs text-gray-400">Kutilgan trayektoriyaga mosligi, %</p>
      </Card>

      <Card title={`Check-inlar (${checkins.length})`}>
        <ul className="space-y-3">
          {checkins.map((c) => {
            const entries = Object.entries(c.answers ?? {});
            const yes = entries.filter(([, v]) => v).length;
            return (
              <li key={c.id} className="rounded-xl border border-gray-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-700">{fmtDate(c.date)}</span>
                  <Pill className={pctStyle(c.match_percent)}>{c.match_percent}%</Pill>
                </div>
                {c.ai_recommendation && <p className="mt-2 text-sm text-gray-600">{c.ai_recommendation}</p>}
                {entries.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-teal-700">
                      Javoblar: {yes} ta “Ha”, {entries.length - yes} ta “Yoʻq”
                    </summary>
                    <ul className="mt-1 space-y-1 text-xs text-gray-600">
                      {entries.map(([q, v]) => (
                        <li key={q}>
                          {v ? "✅" : "❌"} {q}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <p className="mt-1 text-[11px] text-gray-400">{fmtDateTime(c.created_at)}</p>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
