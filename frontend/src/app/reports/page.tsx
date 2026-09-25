"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, getMockReport } from "@/lib/api";
import type { ReportData } from "@/lib/report-types";
import { useAuth } from "@/components/AuthProvider";
import { ProtectedPage } from "@/components/ProtectedPage";

type LoadState = "loading" | "ready" | "error";

const numberFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});

function displayNumber(value: number) {
  return numberFormatter.format(value);
}

function topicColors(sentiment: ReportData["topics"][number]["sentiment"]) {
  switch (sentiment) {
    case "positive":
      return "bg-govtech-emerald-dim text-govtech-emerald border-govtech-emerald/30";
    case "warning":
      return "bg-state-warning/15 text-state-warning border-state-warning/30";
    case "critical":
      return "bg-state-critical/15 text-state-critical border-state-critical/30";
    default:
      return "bg-surface-hover text-text-secondary border-border-crisp";
  }
}

function DecisionBriefsContent() {
  // Keep the page subscribed to the authenticated session while ProtectedPage
  // handles the redirect and access gate.
  const { token } = useAuth();

  const [report, setReport] = useState<ReportData | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    if (!token) {
      setErrorMessage("Your session is unavailable. Please sign in again.");
      setState("error");
      return;
    }

    setState("loading");
    setErrorMessage(null);

    try {
      const nextReport = await getMockReport(token);
      setReport(nextReport);
      setState("ready");
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "The decision brief could not be loaded. Please try again.";
      setErrorMessage(message);
      setState("error");
    }
  }, [token]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  if (state === "loading") {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-space-base py-space-xl">
        <div className="flex flex-col items-center gap-space-sm text-center">
          <span className="material-symbols-outlined animate-spin text-[32px] text-mining-gold-bright">
            progress_activity
          </span>
          <h1 className="font-headline-md text-headline-md font-bold text-text-primary">
            Loading Decision Brief
          </h1>
          <p className="font-body-sm text-body-sm text-text-secondary">
            Retrieving the canonical BCCL report.
          </p>
        </div>
      </main>
    );
  }

  if (state === "error" || !report) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-space-base py-space-xl">
        <section className="w-full rounded-xl border border-state-critical/30 bg-surface-card p-space-xl text-center shadow-lg">
          <span className="material-symbols-outlined text-[36px] text-state-critical">error</span>
          <h1 className="mt-space-sm font-headline-md text-headline-md font-bold text-text-primary">
            Decision Brief unavailable
          </h1>
          <p className="mx-auto mt-space-sm max-w-xl font-body-sm text-body-sm text-text-secondary">
            {errorMessage ?? "The report service did not return a decision brief."}
          </p>
          <button
            className="mt-space-lg inline-flex items-center gap-space-xs rounded-lg bg-primary-container px-space-lg py-2 font-body-sm font-bold text-surface-base transition-colors hover:bg-mining-gold-deep"
            onClick={() => void loadReport()}
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Retry
          </button>
        </section>
      </main>
    );
  }

  const { metadata, kpis, productionByPit, topics, executiveReport, wordcloud, dataMode } = report;
  const isDemoData = dataMode === "demo";

  const kpiCards = [
    {
      label: "Coal Production",
      value: `${displayNumber(kpis.coalProductionMT)} MT`,
      detail: `Target ${displayNumber(kpis.coalProductionTargetMT)} MT · ${displayNumber(kpis.yoyGrowthPercent)}% YoY`,
      tone: "text-mining-gold-bright",
    },
    {
      label: "Overburden Removed (OBR)",
      value: `${displayNumber(kpis.overburdenRemovalMCuM)} M.Cu.M`,
      detail: "Quarterly reported removal",
      tone: "text-text-primary",
    },
    {
      label: "Stripping Ratio",
      value: displayNumber(kpis.strippingRatio),
      detail: `Target ${displayNumber(kpis.strippingRatioTarget)}`,
      tone: "text-tertiary-container",
    },
    {
      label: "Inferred Coking Coal Resources",
      value: `${displayNumber(kpis.inferredReservesMT)} MT`,
      detail: kpis.activeSeams.join(" · "),
      tone: "text-govtech-emerald",
    },
  ];

  return (
    <main className="mx-auto w-full max-w-[1440px] px-space-base py-space-xl sm:px-space-xl">
      <div className="mb-space-xl flex flex-col gap-space-base border-b border-border-subtle pb-space-lg lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-space-sm">
            <span className="font-mono-label text-mono-label uppercase tracking-wider text-mining-gold-bright">
              Decision Brief
            </span>
            <span
              className={`rounded border px-space-sm py-1 font-mono-citation text-mono-citation font-semibold ${
                isDemoData
                  ? "border-state-warning/30 bg-state-warning/15 text-state-warning"
                  : "border-govtech-emerald/30 bg-govtech-emerald-dim text-govtech-emerald"
              }`}
            >
              {isDemoData ? "BCCL demo data" : "Live processed data"}
            </span>
          </div>
          <h1 className="mt-space-sm font-headline-lg text-headline-lg font-bold tracking-tight text-text-primary">
            {metadata.title}
          </h1>
          <p className="mt-space-xs font-body-md text-body-md text-text-secondary">
            {metadata.period} · {metadata.region}
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-space-xs rounded-lg bg-surface-card px-space-lg py-2 font-body-sm font-semibold text-text-primary shadow-sm transition-colors hover:bg-surface-hover"
          onClick={() => window.print()}
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">print</span>
          Print / Save as PDF
        </button>
      </div>

      {isDemoData && (
        <div className="mb-space-xl flex items-start gap-space-sm rounded-lg border border-state-warning/30 bg-state-warning/10 p-space-base text-state-warning">
          <span className="material-symbols-outlined text-[20px]">info</span>
          <p className="font-body-sm text-body-sm">
            This view is using the canonical BCCL demonstration report. It is not a newly processed document.
          </p>
        </div>
      )}

      <article className="rounded-xl bg-surface-card p-space-base shadow-xl sm:p-space-2xl">
        <header className="border-b border-border-subtle pb-space-lg">
          <div className="grid gap-space-base sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="font-mono-label text-mono-label uppercase text-text-muted">Subsidiary</p>
              <p className="mt-1 font-body-md font-semibold text-text-primary">{metadata.subsidiary}</p>
            </div>
            <div>
              <p className="font-mono-label text-mono-label uppercase text-text-muted">Report ID</p>
              <p className="mt-1 font-mono-citation text-mono-citation text-text-primary">{metadata.reportId}</p>
            </div>
            <div>
              <p className="font-mono-label text-mono-label uppercase text-text-muted">Prepared by</p>
              <p className="mt-1 font-body-md text-body-md text-text-primary">{metadata.preparedBy}</p>
            </div>
            <div>
              <p className="font-mono-label text-mono-label uppercase text-text-muted">Classification</p>
              <p className="mt-1 font-body-md text-body-md text-text-primary">{metadata.classification}</p>
            </div>
          </div>
        </header>

        <section className="mt-space-xl">
          <h2 className="font-headline-md text-headline-md font-bold text-text-primary">Key metrics</h2>
          <div className="mt-space-md grid gap-space-sm sm:grid-cols-2 xl:grid-cols-4">
            {kpiCards.map((card) => (
              <div className="rounded-lg bg-surface-base p-space-base" key={card.label}>
                <p className="font-mono-label text-mono-label uppercase text-text-muted">{card.label}</p>
                <p className={`mt-space-xs font-mono-metric-lg text-mono-metric-lg ${card.tone}`}>{card.value}</p>
                <p className="mt-space-xs font-mono-citation text-mono-citation text-text-secondary">{card.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-space-2xl">
          <div className="flex flex-col gap-space-xs sm:flex-row sm:items-end sm:justify-between">
            <h2 className="font-headline-md text-headline-md font-bold text-text-primary">Pit production</h2>
            <p className="font-mono-citation text-mono-citation text-text-muted">Million tonnes (MT)</p>
          </div>
          <div className="mt-space-md overflow-x-auto rounded-lg border border-border-subtle">
            <table className="w-full min-w-[560px] text-left">
              <thead className="bg-surface-base font-mono-label text-mono-label uppercase text-text-muted">
                <tr>
                  <th className="px-space-base py-space-sm">Pit</th>
                  <th className="px-space-base py-space-sm text-right">Target</th>
                  <th className="px-space-base py-space-sm text-right">Actual</th>
                  <th className="px-space-base py-space-sm text-right">Achievement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {productionByPit.map((production) => {
                  const achievement = (production.actualMT / production.targetMT) * 100;
                  return (
                    <tr className="font-body-sm text-body-sm text-text-primary" key={production.pit}>
                      <td className="px-space-base py-space-sm font-semibold">{production.pit}</td>
                      <td className="px-space-base py-space-sm text-right">{displayNumber(production.targetMT)}</td>
                      <td className="px-space-base py-space-sm text-right">{displayNumber(production.actualMT)}</td>
                      <td className="px-space-base py-space-sm text-right font-mono-citation text-mono-citation">
                        {displayNumber(achievement)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-space-2xl">
          <h2 className="font-headline-md text-headline-md font-bold text-text-primary">Executive report</h2>
          <div className="mt-space-md space-y-space-lg">
            {executiveReport.sections.map((section) => (
              <section className="border-l-2 border-mining-gold-bright pl-space-base" key={section.title}>
                <h3 className="font-body-md text-body-md font-bold text-text-primary">{section.title}</h3>
                <p className="mt-space-xs font-body-md text-body-md leading-relaxed text-text-secondary">{section.content}</p>
              </section>
            ))}
          </div>
        </section>

        <section className="mt-space-2xl grid gap-space-xl lg:grid-cols-2">
          <div>
            <h2 className="font-headline-md text-headline-md font-bold text-text-primary">Report topics</h2>
            <div className="mt-space-md space-y-space-xs">
              {topics.map((topic) => (
                <div className="flex flex-col gap-space-xs rounded-lg bg-surface-base p-space-sm sm:flex-row sm:items-center sm:justify-between" key={topic.name}>
                  <span className="font-body-sm font-semibold text-text-primary">{topic.name}</span>
                  <span className={`w-fit rounded border px-space-sm py-0.5 font-mono-citation text-mono-citation ${topicColors(topic.sentiment)}`}>
                    {topic.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-headline-md text-headline-md font-bold text-text-primary">Report keywords</h2>
            <div className="mt-space-md flex flex-wrap gap-space-xs rounded-lg bg-surface-base p-space-base">
              {wordcloud.map((term) => (
                <span className="rounded-full bg-surface-card px-space-sm py-1 font-body-sm text-body-sm text-text-secondary" key={term.value}>
                  {term.value} ({term.count})
                </span>
              ))}
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}

export default function ReportsPage() {
  return (
    <ProtectedPage>
      <DecisionBriefsContent />
    </ProtectedPage>
  );
}
