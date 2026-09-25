import React from "react";
import Link from "next/link";
import type { ReportData } from "@/lib/report-types";
import { topicStyle } from "@/lib/utils";

interface TopicsWordCloudProps {
  wordcloud: ReportData["wordcloud"];
  topics: ReportData["topics"];
  executiveSections: ReportData["executiveReport"]["sections"];
}

export function TopicsWordCloud({
  wordcloud,
  topics,
  executiveSections,
}: TopicsWordCloudProps) {
  return (
    <div className="grid grid-cols-1 gap-space-lg lg:grid-cols-2">
      {/* Topics & Word Cloud Section */}
      <section className="rounded-xl border border-border-crisp bg-surface-card p-space-lg shadow-sm">
        <h2 className="font-headline-md text-headline-md font-bold text-text-primary">
          Topics in the Report
        </h2>
        <p className="mt-1 text-body-sm text-text-secondary">
          High-frequency geological entities and statutory keywords extracted from the active dossier.
        </p>
        <div className="mt-space-md flex flex-wrap gap-space-sm">
          {wordcloud.map(({ value, count }) => (
            <span
              key={value}
              title={`${count} mentions`}
              className="rounded-full border border-border-crisp bg-surface-dim px-3 py-1.5 text-body-sm font-medium text-text-primary hover:border-mining-gold-bright transition-colors cursor-default"
            >
              {value} <span className="font-mono-citation text-text-muted">{count}</span>
            </span>
          ))}
        </div>
        <div className="mt-space-lg space-y-space-xs border-t border-border-crisp pt-space-md">
          <p className="font-mono-label text-mono-label uppercase tracking-wider text-text-muted mb-space-xs">
            Operational &amp; Compliance Status
          </p>
          {topics.map(({ name, status, sentiment }) => (
            <div
              key={name}
              className="flex items-center justify-between gap-space-sm rounded-lg bg-surface-dim px-space-sm py-2"
            >
              <span className="text-body-sm font-medium text-text-primary">{name}</span>
              <span
                className={`rounded px-2 py-0.5 font-mono-citation text-mono-citation ${topicStyle(
                  sentiment
                )}`}
              >
                {status}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Executive Brief Highlights Section */}
      <section className="rounded-xl border border-border-crisp bg-surface-card p-space-lg shadow-sm flex flex-col justify-between">
        <div>
          <h2 className="font-headline-md text-headline-md font-bold text-text-primary">
            Executive Summary Sections
          </h2>
          <p className="mt-1 text-body-sm text-text-secondary">
            Consolidated geotechnical findings and statutory recommendations.
          </p>
          <div className="mt-space-md space-y-space-md">
            {executiveSections.map(({ title, content }) => (
              <article key={title} className="border-l-2 border-mining-gold-bright pl-space-md">
                <h3 className="text-body-sm font-semibold text-text-primary">{title}</h3>
                <p className="mt-1 text-body-sm leading-relaxed text-text-secondary">
                  {content}
                </p>
              </article>
            ))}
          </div>
        </div>

        <Link
          href="/reports"
          className="mt-space-lg inline-flex items-center gap-1 text-body-sm font-semibold text-mining-gold-bright hover:text-primary transition-colors"
        >
          Open Statutory Decision Briefs{" "}
          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
        </Link>
      </section>
    </div>
  );
}
