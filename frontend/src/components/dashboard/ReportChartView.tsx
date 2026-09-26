"use client";

import React, { useState } from "react";
import type { ReportChart } from "@/lib/report-types";

// Categorical slots stepped for the dark surface. Assigned by series index in
// fixed order — must stay in the same order as SERIES_COLORS in
// ml_service/services/report_generator.py (its light-surface twins), so a
// series keeps its identity between the page and the downloaded PDF.
const SERIES_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

const WIDTH = 640;
const HEIGHT = 260;
const MARGIN = { top: 12, right: 12, left: 44 };

function formatValue(value: number | null | undefined, unit: string | null): string {
  if (value === null || value === undefined) return "—";
  const text = Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return unit === "%" ? `${text}%` : text;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = Math.max(max - min, 1);
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let tick = Math.floor(min / step) * step; tick <= max + step / 2; tick += step) ticks.push(Number(tick.toFixed(6)));
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function ReportChartView({ chart }: { chart: ReportChart }) {
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const { series, data, y_axis: yAxis } = chart;

  const values = data.flatMap((row) => series.map((s) => num(row[s.key]))).filter((v): v is number => v !== null);
  const low = Math.min(...values);
  const high = Math.max(...values);
  // y_axis.min null = fitted axis (line charts): pad so points don't sit on the frame.
  const pad = Math.max((high - low) * 0.25, Math.abs(high) * 0.02, 0.1);
  const ticks = yAxis.min !== null ? niceTicks(yAxis.min, high) : niceTicks(low - pad, high + pad);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const rotate = data.length > 6 || data.some((row) => row.label.length > 10);
  const bottom = rotate ? 56 : 28;
  const plotW = WIDTH - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - bottom;
  const band = plotW / data.length;
  const y = (v: number) => MARGIN.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;
  const cx = (i: number) => MARGIN.left + band * i + band / 2;
  // Bars: 2px surface gap between neighbours, capped width so 2 bars don't become slabs.
  const groupW = Math.min(band * 0.7, 36 * series.length);
  const barW = groupW / series.length;

  return (
    <figure className="rounded-xl border border-border-crisp bg-surface-card p-space-lg">
      <figcaption className="flex flex-wrap items-start justify-between gap-space-sm">
        <div>
          <h3 className="font-headline-md text-headline-md font-bold text-text-primary">{chart.title}</h3>
          {chart.description && <p className="mt-1 text-body-sm text-text-secondary">{chart.description}</p>}
        </div>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="rounded border border-border-crisp px-space-sm py-1 font-mono-citation text-mono-citation text-text-secondary hover:bg-surface-hover"
        >
          {showTable ? "Show chart" : "Show data"}
        </button>
      </figcaption>

      {series.length > 1 && (
        <ul className="mt-space-sm flex flex-wrap gap-space-base text-body-sm text-text-secondary">
          {series.map((s, i) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}

      {showTable ? (
        <div className="mt-space-md overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-border-crisp text-left text-text-muted">
                <th className="py-1.5 pr-space-base font-semibold">{chart.x_axis.label || "Label"}</th>
                {series.map((s) => (
                  <th key={s.key} className="py-1.5 text-right font-semibold">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.label} className="border-b border-border-subtle text-text-primary">
                  <td className="py-1.5 pr-space-base">{row.label}</td>
                  {series.map((s) => (
                    <td key={s.key} className="py-1.5 text-right font-mono-citation">{formatValue(num(row[s.key]), yAxis.unit)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative mt-space-md">
          {yAxis.label && <p className="mb-1 font-mono-citation text-mono-citation text-text-muted">{yAxis.label}</p>}
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label={chart.title} onMouseLeave={() => setActive(null)}>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(tick)} y2={y(tick)} stroke="#1E293B" strokeWidth={1} />
                <text x={MARGIN.left - 6} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={10} fill="#64748B">
                  {formatValue(tick, yAxis.unit)}
                </text>
              </g>
            ))}

            {chart.type === "bar"
              ? data.map((row, i) =>
                  series.map((s, si) => {
                    const v = num(row[s.key]);
                    if (v === null) return null;
                    const top = y(Math.max(v, yMin));
                    const h = Math.max(y(yMin) - top, 0);
                    const r = Math.min(4, barW / 2 - 1, h);
                    const x = cx(i) - groupW / 2 + si * barW + 1;
                    const w = barW - 2;
                    // Rounded data-end, square baseline.
                    const d = `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${top + h} Z`;
                    return <path key={`${row.label}-${s.key}`} d={d} fill={SERIES_COLORS[si % SERIES_COLORS.length]} opacity={active === null || active === i ? 1 : 0.45} />;
                  }),
                )
              : series.map((s, si) => {
                  const color = SERIES_COLORS[si % SERIES_COLORS.length];
                  // Break the line at gaps rather than drawing through missing values.
                  const path = data
                    .map((row, i) => {
                      const v = num(row[s.key]);
                      const prev = i > 0 ? num(data[i - 1][s.key]) : null;
                      return v === null ? "" : `${prev === null ? "M" : "L"}${cx(i)},${y(v)}`;
                    })
                    .join(" ");
                  return (
                    <g key={s.key}>
                      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
                      {data.map((row, i) => {
                        const v = num(row[s.key]);
                        return v === null ? null : (
                          <circle key={row.label} cx={cx(i)} cy={y(v)} r={active === i ? 5 : 3.5} fill={color} stroke="#131B2E" strokeWidth={2} />
                        );
                      })}
                    </g>
                  );
                })}

            {chart.type === "line" && active !== null && (
              <line x1={cx(active)} x2={cx(active)} y1={MARGIN.top} y2={MARGIN.top + plotH} stroke="#64748B" strokeDasharray="3 3" />
            )}
            <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(yMin)} y2={y(yMin)} stroke="#24324D" />

            {data.map((row, i) => {
              const label = row.label.length > 16 ? `${row.label.slice(0, 15)}…` : row.label;
              const ly = MARGIN.top + plotH + 14;
              return (
                <g key={row.label}>
                  <text
                    x={cx(i)}
                    y={ly}
                    fontSize={10}
                    fill="#94A3B8"
                    textAnchor={rotate ? "end" : "middle"}
                    transform={rotate ? `rotate(-30 ${cx(i)} ${ly})` : undefined}
                  >
                    {label}
                  </text>
                  {/* Hit target spans the whole band, larger than the mark. */}
                  <rect x={MARGIN.left + band * i} y={MARGIN.top} width={band} height={plotH} fill="transparent" onMouseEnter={() => setActive(i)} />
                </g>
              );
            })}
          </svg>

          {active !== null && (
            <div
              className="pointer-events-none absolute top-6 z-10 min-w-[140px] -translate-x-1/2 rounded-lg border border-border-crisp bg-surface-container-high px-space-sm py-1.5 text-body-sm shadow-lg"
              style={{ left: `${(cx(active) / WIDTH) * 100}%` }}
            >
              <p className="font-semibold text-text-primary">{data[active].label}</p>
              {series.map((s, si) => (
                <p key={s.key} className="flex items-center justify-between gap-space-sm text-text-secondary">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm" style={{ background: SERIES_COLORS[si % SERIES_COLORS.length] }} />
                    {s.label}
                  </span>
                  <span className="font-mono-citation text-text-primary">{formatValue(num(data[active][s.key]), yAxis.unit)}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
