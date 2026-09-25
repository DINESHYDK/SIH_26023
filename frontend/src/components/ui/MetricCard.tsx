import React from "react";

interface MetricCardProps {
  label: string;
  value: string | number;
  detail?: string;
  icon?: string;
  trend?: string;
  trendPositive?: boolean;
}

export function MetricCard({
  label,
  value,
  detail,
  icon,
  trend,
  trendPositive,
}: MetricCardProps) {
  return (
    <article className="rounded-xl border border-border-crisp bg-surface-card p-space-md shadow-sm transition-all hover:border-border-crisp/80">
      <div className="flex items-start justify-between gap-space-sm">
        <span className="text-body-sm font-medium text-text-secondary">{label}</span>
        {icon && (
          <span className="material-symbols-outlined text-[20px] text-mining-gold-bright">
            {icon}
          </span>
        )}
      </div>
      <p className="mt-space-sm font-mono-metric-md text-mono-metric-md font-bold text-text-primary">
        {value}
      </p>
      <div className="mt-1 flex items-center justify-between gap-1 text-body-sm">
        {detail && <span className="text-text-muted">{detail}</span>}
        {trend && (
          <span
            className={`font-mono-citation text-mono-citation font-semibold ${
              trendPositive ? "text-govtech-emerald" : "text-state-warning"
            }`}
          >
            {trend}
          </span>
        )}
      </div>
    </article>
  );
}
