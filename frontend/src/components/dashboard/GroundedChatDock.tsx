"use client";

import React, { type FormEvent } from "react";
import type { QueryResponse, ReportData } from "@/lib/report-types";
import { DataModeBadge } from "@/components/ui/DataModeBadge";

interface GroundedChatDockProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isQuerying: boolean;
  queryResponse: QueryResponse | null;
  queryError: string | null;
  dataMode: ReportData["dataMode"];
}

const PRESET_CHIPS = [
  "What is the inferred coking coal reserve across Seams X-XII?",
  "Summarize overburden removal variance for Pit 4",
  "Extract DGMS safety compliance audit observations",
  "What is the composite stripping ratio target vs actual?",
];

export function GroundedChatDock({
  query,
  onQueryChange,
  onSubmit,
  isQuerying,
  queryResponse,
  queryError,
  dataMode,
}: GroundedChatDockProps) {
  return (
    <section className="rounded-xl border border-border-crisp bg-surface-card p-space-lg shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-space-sm border-b border-border-crisp pb-space-sm">
        <div>
          <h2 className="font-headline-md text-headline-md font-bold text-text-primary">
            Source-Grounded Parliamentary &amp; Geological Q&amp;A
          </h2>
          <p className="mt-1 text-body-sm text-text-secondary">
            Ask inquiries against the active BCCL geological report and uploaded drill core logs.
          </p>
        </div>
        <DataModeBadge dataMode={dataMode} />
      </div>

      {/* Suggested Quick Prompt Chips */}
      <div className="mt-space-md flex flex-wrap gap-space-xs">
        {PRESET_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => onQueryChange(chip)}
            className="rounded-full border border-border-crisp bg-surface-dim px-3 py-1 font-body-sm text-text-secondary hover:border-mining-gold-bright hover:text-text-primary transition-all text-left"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Query Response Display */}
      {queryResponse && (
        <div className="mt-space-md rounded-xl border border-border-crisp bg-surface-dim p-space-md">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-[18px] text-mining-gold-bright">
              smart_toy
            </span>
            <h3 className="text-body-sm font-semibold text-text-primary">
              Synthesizer Resolution
            </h3>
          </div>
          <p className="mt-space-sm whitespace-pre-wrap text-body-md leading-relaxed text-text-secondary">
            {queryResponse.answer}
          </p>
          {queryResponse.citations.length > 0 && (
            <div className="mt-space-md border-t border-border-crisp pt-space-sm">
              <p className="font-mono-label text-mono-label uppercase tracking-wider text-text-muted">
                Audit Citations
              </p>
              <div className="mt-space-xs flex flex-wrap gap-space-xs">
                {queryResponse.citations.map((citation, index) => (
                  <span
                    key={`${citation.source}-${citation.page}-${index}`}
                    className="inline-flex items-center gap-1 rounded border border-tertiary-container/40 bg-tertiary-container/10 px-2 py-1 font-mono-citation text-mono-citation text-tertiary-container"
                  >
                    <span className="material-symbols-outlined text-[14px]">description</span>
                    {citation.source}
                    {citation.page ? ` · Page ${citation.page}` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {queryError && (
        <p
          role="alert"
          className="mt-space-md rounded-lg border border-error/30 bg-error-container/20 p-space-sm text-body-sm text-error"
        >
          {queryError}
        </p>
      )}

      {/* Input Dock */}
      <form onSubmit={onSubmit} className="mt-space-md flex flex-col gap-space-sm sm:flex-row">
        <label className="sr-only" htmlFor="workspace-question">
          Ask a question about the active context
        </label>
        <input
          id="workspace-question"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          disabled={isQuerying}
          placeholder="Ask a geological, mining, or parliamentary inquiry on BCCL Jharia…"
          className="h-11 min-w-0 flex-1 rounded-lg border border-border-crisp bg-surface-dim px-space-md text-body-md text-text-primary placeholder:text-text-muted focus:border-mining-gold-bright focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!query.trim() || isQuerying}
          className="inline-flex h-11 items-center justify-center gap-1 rounded-lg bg-primary-container px-space-lg font-body-md font-bold text-surface-base transition-colors hover:bg-mining-gold-deep disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className={`material-symbols-outlined text-[18px] ${isQuerying ? "animate-spin" : ""}`}>
            {isQuerying ? "progress_activity" : "arrow_upward"}
          </span>
          {isQuerying ? "Synthesizing…" : "Ask Query"}
        </button>
      </form>
    </section>
  );
}
