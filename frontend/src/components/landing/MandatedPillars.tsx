import React from "react";
import Link from "next/link";

export function MandatedPillars() {
  return (
    <section className="w-full py-space-3xl px-space-xl bg-surface-base border-t border-border-crisp">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-space-2xl gap-space-base">
          <div>
            <span className="font-mono-label text-mono-label text-mining-gold-bright uppercase tracking-widest">
              Core Architectural Pillars
            </span>
            <h2 className="font-headline-xl text-headline-xl text-text-primary font-bold tracking-tight mt-1">
              Three Mandated Functional Layers
            </h2>
          </div>
          <p className="font-body-md text-body-md text-text-secondary max-w-md">
            Architected specifically for the Ministry of Coal mandate, addressing multi-format
            unstructured geological filings and high-stakes decision synthesis.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-xl">
          {/* Pillar 1: Automated Report Generation */}
          <div className="flex flex-col justify-between p-space-xl rounded-xl bg-surface-card border border-border-crisp hover:border-mining-gold-bright/50 transition-all shadow-md group">
            <div>
              <div className="w-12 h-12 rounded-lg bg-surface-dim flex items-center justify-center text-mining-gold-bright mb-space-lg group-hover:bg-primary-container group-hover:text-surface-base transition-colors">
                <span className="material-symbols-outlined text-[26px]">article</span>
              </div>
              <span className="font-mono-citation text-mono-citation text-mining-gold-bright uppercase tracking-wider font-semibold">
                Pillar 01 // Ingestion Engine
              </span>
              <h3 className="font-headline-md text-headline-md font-bold text-text-primary mt-1 mb-space-sm">
                Automated Report Generation
              </h3>
              <p className="font-body-md text-body-md text-text-secondary leading-relaxed mb-space-lg">
                Consolidates multi-source geological dossiers, borehole lithological strata logs,
                and monthly return returns into standardized DGMS-compliant Executive Briefs in
                seconds.
              </p>
            </div>
            <div className="pt-space-md border-t border-border-subtle flex items-center justify-between">
              <span className="font-mono-citation text-mono-citation text-text-muted">
                Standard: CMR 2017 Format
              </span>
              <Link
                href="/reports"
                className="font-body-sm text-body-sm font-semibold text-mining-gold-bright hover:underline flex items-center gap-1"
              >
                View Templates{" "}
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </div>
          </div>

          {/* Pillar 2: Automated Word Cloud & Topics */}
          <div className="flex flex-col justify-between p-space-xl rounded-xl bg-surface-card border border-border-crisp hover:border-mining-gold-bright/50 transition-all shadow-md group">
            <div>
              <div className="w-12 h-12 rounded-lg bg-surface-dim flex items-center justify-center text-govtech-emerald mb-space-lg group-hover:bg-govtech-emerald group-hover:text-surface-base transition-colors">
                <span className="material-symbols-outlined text-[26px]">bubble_chart</span>
              </div>
              <span className="font-mono-citation text-mono-citation text-govtech-emerald uppercase tracking-wider font-semibold">
                Pillar 02 // Semantic Mining
              </span>
              <h3 className="font-headline-md text-headline-md font-bold text-text-primary mt-1 mb-space-sm">
                Automated Word Cloud &amp; Topics
              </h3>
              <p className="font-body-md text-body-md text-text-secondary leading-relaxed mb-space-lg">
                Instantly identifies high-frequency geological anomalies, recurrent overburden
                shortfalls, coal seam methane spikes, and statutory non-compliance themes across
                subsidiaries.
              </p>
            </div>
            <div className="pt-space-md border-t border-border-subtle flex items-center justify-between">
              <span className="font-mono-citation text-mono-citation text-text-muted">
                Model: Domain-Trained NLP
              </span>
              <Link
                href="/dashboard"
                className="font-body-sm text-body-sm font-semibold text-govtech-emerald hover:underline flex items-center gap-1"
              >
                Run Analysis{" "}
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </div>
          </div>

          {/* Pillar 3: Grounded Q&A Search Engine */}
          <div className="flex flex-col justify-between p-space-xl rounded-xl bg-surface-card border border-border-crisp hover:border-mining-gold-bright/50 transition-all shadow-md group">
            <div>
              <div className="w-12 h-12 rounded-lg bg-surface-dim flex items-center justify-center text-tertiary-container mb-space-lg group-hover:bg-tertiary-container group-hover:text-surface-base transition-colors">
                <span className="material-symbols-outlined text-[26px]">question_answer</span>
              </div>
              <span className="font-mono-citation text-mono-citation text-tertiary-container uppercase tracking-wider font-semibold">
                Pillar 03 // Secretariat Engine
              </span>
              <h3 className="font-headline-md text-headline-md font-bold text-text-primary mt-1 mb-space-sm">
                Grounded Q&amp;A Search Engine
              </h3>
              <p className="font-body-md text-body-md text-text-secondary leading-relaxed mb-space-lg">
                Delivers audit-verified answers for Parliamentary Secretariat inquiries, Lok/Rajya
                Sabha starred questions, and Ministry briefing dockets with strict page-level
                source attribution.
              </p>
            </div>
            <div className="pt-space-md border-t border-border-subtle flex items-center justify-between">
              <span className="font-mono-citation text-mono-citation text-text-muted">
                Latency: &lt;1,200 ms
              </span>
              <Link
                href="/dashboard"
                className="font-body-sm text-body-sm font-semibold text-tertiary-container hover:underline flex items-center gap-1"
              >
                Launch Query Desk{" "}
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
