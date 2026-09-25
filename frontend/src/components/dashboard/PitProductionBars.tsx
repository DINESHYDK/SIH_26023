import React from "react";
import type { PitProduction } from "@/lib/report-types";

interface PitProductionBarsProps {
  productionByPit: PitProduction[];
  period: string;
}

export function PitProductionBars({ productionByPit, period }: PitProductionBarsProps) {
  const maxProduction = Math.max(
    1,
    ...productionByPit.map(({ actualMT, targetMT }) => Math.max(actualMT, targetMT))
  );

  return (
    <section className="rounded-xl border border-border-crisp bg-surface-card p-space-lg shadow-sm">
      <div className="flex flex-col justify-between gap-space-sm border-b border-border-crisp pb-space-sm sm:flex-row sm:items-center">
        <div>
          <h2 className="font-headline-md text-headline-md font-bold text-text-primary">
            Pit-Wise Production Performance
          </h2>
          <p className="mt-1 text-body-sm text-text-secondary">
            Actual coal extraction compared with quarterly targets in Million Tonnes (MT).
          </p>
        </div>
        <span className="font-mono-citation text-mono-citation text-text-muted">{period}</span>
      </div>

      <div className="mt-space-md space-y-space-md">
        {productionByPit.map(({ pit, actualMT, targetMT }) => {
          const achievement = (actualMT / targetMT) * 100;
          const width = Math.min(100, (actualMT / maxProduction) * 100);

          return (
            <div key={pit}>
              <div className="mb-1 flex flex-wrap justify-between gap-1 text-body-sm">
                <span className="font-semibold text-text-primary">{pit}</span>
                <span
                  className={
                    achievement >= 100
                      ? "font-mono-citation text-govtech-emerald"
                      : "font-mono-citation text-state-warning"
                  }
                >
                  {actualMT.toFixed(2)} / {targetMT.toFixed(2)} MT ({achievement.toFixed(1)}%)
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-surface-dim">
                <div
                  className={
                    achievement >= 100
                      ? "h-full rounded-full bg-govtech-emerald transition-all duration-500"
                      : "h-full rounded-full bg-mining-gold-bright transition-all duration-500"
                  }
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
