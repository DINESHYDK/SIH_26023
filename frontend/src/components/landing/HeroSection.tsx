import React from "react";
import Link from "next/link";

export function HeroSection() {
  return (
    <section className="relative w-full py-space-3xl px-space-xl overflow-hidden bg-gradient-to-b from-surface-dim via-surface-base to-surface-dim">
      {/* Atmospheric Ambient Glows */}
      <div className="absolute top-12 left-1/4 w-96 h-96 rounded-full bg-mining-gold-deep/10 blur-3xl pointer-events-none -z-0" />
      <div className="absolute bottom-10 right-1/4 w-[28rem] h-[28rem] rounded-full bg-govtech-emerald/5 blur-3xl pointer-events-none -z-0" />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Institutional Emblem & Identification Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md mb-space-2xl">
          <div className="flex items-center gap-space-md">
            <div className="w-12 h-12 rounded-xl bg-surface-card flex items-center justify-center shadow-lg border border-border-crisp">
              <span className="material-symbols-outlined text-mining-gold-bright text-[28px]">
                terrain
              </span>
            </div>
            <div className="flex flex-col">
              <span className="font-mono-label text-mono-label text-mining-gold-bright uppercase tracking-widest">
                Problem Statement ID: #26023
              </span>
              <span className="font-headline-md text-headline-md font-bold text-text-primary tracking-tight">
                CMPDI National Geological Synthesizer
              </span>
            </div>
          </div>
          <div className="flex items-center gap-space-xs px-space-md py-space-xs rounded-full bg-surface-card shadow-sm border border-border-crisp">
            <span className="material-symbols-outlined text-govtech-emerald text-[18px]">
              verified
            </span>
            <span className="font-mono-citation text-mono-citation text-text-secondary">
              MoC / CIL AI Direct Resolution Node
            </span>
          </div>
        </div>

        {/* Hero Asymmetrical Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-2xl items-center mb-space-3xl">
          <div className="lg:col-span-7 flex flex-col gap-space-lg">
            <div className="inline-flex items-center gap-space-xs w-max px-space-sm py-1 rounded bg-surface-hover border border-border-crisp">
              <span className="font-mono-citation text-mono-citation text-text-secondary uppercase">
                Unified Subsidiary Ingestion
              </span>
              <span className="text-text-muted">•</span>
              <span className="font-mono-citation text-mono-citation text-mining-gold-bright font-semibold">
                8 Coal Basins Connected
              </span>
            </div>
            <h1 className="font-headline-xl text-headline-xl text-text-primary tracking-tight leading-none font-bold">
              AI-Powered Geological, Mining &amp; Statutory Intelligence for{" "}
              <span className="text-mining-gold-bright">Coal India</span> Subsidiaries.
            </h1>
            <p className="font-body-lg text-body-lg text-text-secondary max-w-2xl leading-relaxed">
              Automating borehole lithology extraction, overburden telemetry, and rapid
              parliamentary query formulation across all 8 major mining subsidiaries with audited
              cryptographic citations.
            </p>
            <div className="flex flex-wrap items-center gap-space-md pt-space-xs">
              <Link
                className="inline-flex items-center gap-space-sm px-space-xl py-space-md rounded-lg bg-primary-container text-surface-base font-bold shadow-xl shadow-primary-container/20 hover:bg-mining-gold-deep transition-all transform hover:-translate-y-0.5"
                href="/dashboard"
              >
                <span className="material-symbols-outlined text-[20px]">terminal</span>
                <span className="font-headline-md text-body-md font-bold">
                  Launch Intelligence Workspace
                </span>
              </Link>
              <Link
                className="inline-flex items-center gap-space-sm px-space-xl py-space-md rounded-lg bg-surface-card text-text-primary hover:bg-surface-hover shadow-md border border-border-crisp transition-all"
                href="/reports"
              >
                <span className="material-symbols-outlined text-mining-gold-bright text-[20px]">
                  description
                </span>
                <span className="font-body-md text-body-md font-semibold">
                  View Statutory Reports
                </span>
              </Link>
              <div className="w-full sm:w-auto flex items-center gap-space-xs text-text-muted font-mono-citation text-mono-citation pl-space-xs">
                <span className="material-symbols-outlined text-[16px] text-govtech-emerald">
                  lock
                </span>
                <span>Classified Access • Level 4 Clearance Required</span>
              </div>
            </div>
          </div>

          {/* Telemetry Showcase Panel */}
          <div className="lg:col-span-5 relative">
            <div className="relative rounded-xl overflow-hidden shadow-2xl bg-surface-card border border-border-crisp">
              <div className="px-space-base py-space-sm bg-surface-container-high flex items-center justify-between border-b border-border-crisp">
                <div className="flex items-center gap-space-xs">
                  <span className="w-2.5 h-2.5 rounded-full bg-state-critical" />
                  <span className="w-2.5 h-2.5 rounded-full bg-state-warning" />
                  <span className="w-2.5 h-2.5 rounded-full bg-govtech-emerald" />
                  <span className="font-mono-citation text-mono-citation text-text-muted ml-2">
                    CMPDI-SYNTH-KERNEL // BCCL-DHANBAD
                  </span>
                </div>
                <span className="font-mono-citation text-mono-citation text-mining-gold-bright uppercase">
                  STREAM: 8.4k t/sec
                </span>
              </div>
              <div className="relative h-56 w-full">
                <img
                  alt="Industrial open-cast coal colliery operations with heavy mining extraction equipment"
                  className="w-full h-full object-cover mix-blend-luminosity opacity-40"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuCutp6EkBZ87m4n9tbmRiiQGaqKIYgSF6ufxhq2z2chkAuMtS6ecb-gwC59Ly3Q2xthBVaKg-SYmMh14EX5O5kA1CX8J-aawnQiPk0OcKXxrfTkVbDHz9fGJL9mm4q2eoE04oWalB3qHnzpYkAOOub6zQWky9IUqk3tjuzR-fjhjvk1lz5qqx5t7B-SJNZG8z-5fv7dt4zMpZtGO-6lFvxU8-wBGtxVjdt8ro03u2qUMdjrTvGUVp5-"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-surface-card via-surface-card/60 to-transparent" />
                <div className="absolute top-4 right-4 p-space-sm rounded-lg bg-surface-base/90 backdrop-blur-md shadow-md border border-border-crisp">
                  <div className="font-mono-citation text-mono-citation text-text-muted">
                    Stratigraphic Depth
                  </div>
                  <div className="font-mono-metric-md text-mono-metric-md text-mining-gold-bright">
                    412.80 m (Seam IX)
                  </div>
                </div>
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                  <div>
                    <div className="font-mono-label text-mono-label text-text-muted">
                      Jharia Basin Log BH-449
                    </div>
                    <div className="font-body-sm text-body-sm font-semibold text-text-primary">
                      Lithological Core Extract Verified
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-govtech-emerald-dim text-govtech-emerald font-mono-citation text-mono-citation font-bold">
                    100% GROUNDED
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Institutional Metrics Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-space-md pt-space-md border-t border-border-crisp">
          <div className="flex flex-col p-space-md rounded-lg bg-surface-card/70 border border-border-crisp">
            <span className="font-mono-label text-mono-label text-text-muted uppercase">
              Operational Fleet
            </span>
            <span className="font-mono-metric-lg text-mono-metric-lg text-text-primary mt-1">
              8 Subsidiaries
            </span>
            <span className="font-mono-citation text-mono-citation text-govtech-emerald mt-0.5">
              100% CIL Command Grid
            </span>
          </div>
          <div className="flex flex-col p-space-md rounded-lg bg-surface-card/70 border border-border-crisp">
            <span className="font-mono-label text-mono-label text-text-muted uppercase">
              RAG Synthesis Speed
            </span>
            <span className="font-mono-metric-lg text-mono-metric-lg text-mining-gold-bright mt-1">
              90% Latency Drop
            </span>
            <span className="font-mono-citation text-mono-citation text-text-secondary mt-0.5">
              4 Days to 12 Minutes
            </span>
          </div>
          <div className="flex flex-col p-space-md rounded-lg bg-surface-card/70 border border-border-crisp">
            <span className="font-mono-label text-mono-label text-text-muted uppercase">
              Traceability Audit
            </span>
            <span className="font-mono-metric-lg text-mono-metric-lg text-govtech-emerald mt-1">
              100% Cryptographic
            </span>
            <span className="font-mono-citation text-mono-citation text-text-secondary mt-0.5">
              Zero Hallucination Tolerance
            </span>
          </div>
          <div className="flex flex-col p-space-md rounded-lg bg-surface-card/70 border border-border-crisp">
            <span className="font-mono-label text-mono-label text-text-muted uppercase">
              Geological Archive
            </span>
            <span className="font-mono-metric-lg text-mono-metric-lg text-text-primary mt-1">
              14.8M+ Records
            </span>
            <span className="font-mono-citation text-mono-citation text-text-secondary mt-0.5">
              National Coal Data Repository
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
