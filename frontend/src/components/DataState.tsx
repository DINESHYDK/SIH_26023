import type { ReactNode } from "react";

import type { DataMode } from "@/lib/report-types";

export function DataModeBadge({ mode }: { mode: DataMode }) {
  const isDemo = mode === "demo";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-1 font-mono-citation text-mono-citation font-semibold ${
        isDemo
          ? "border border-state-warning/40 bg-state-warning/10 text-state-warning"
          : "border border-govtech-emerald/30 bg-govtech-emerald-dim text-govtech-emerald"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isDemo ? "bg-state-warning" : "bg-govtech-emerald"}`} />
      {isDemo ? "BCCL demo data" : "Live processing"}
    </span>
  );
}

export function LoadingPanel({ children = "Loading workspace data…" }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-xl border border-border-crisp bg-surface-card p-space-xl text-center">
      <div className="flex flex-col items-center gap-space-sm text-text-secondary">
        <span className="material-symbols-outlined animate-spin text-[26px] text-mining-gold-bright">progress_activity</span>
        <p className="font-body-md text-body-md">{children}</p>
      </div>
    </div>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-xl border border-state-critical/40 bg-state-critical/10 p-space-xl text-center">
      <div className="flex max-w-md flex-col items-center gap-space-sm">
        <span className="material-symbols-outlined text-[28px] text-state-critical">error</span>
        <h2 className="font-headline-md text-headline-md font-bold text-text-primary">Unable to load data</h2>
        <p className="font-body-sm text-body-sm text-text-secondary">{message}</p>
        <button
          className="mt-space-sm rounded-lg bg-primary-container px-space-base py-2 font-body-sm font-bold text-surface-base transition-colors hover:bg-mining-gold-deep"
          onClick={onRetry}
          type="button"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
