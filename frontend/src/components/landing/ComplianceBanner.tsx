import React from "react";

export function ComplianceBanner() {
  return (
    <section className="w-full py-space-3xl px-space-xl bg-surface-base border-t border-border-crisp">
      <div className="max-w-7xl mx-auto flex flex-col gap-space-2xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-space-lg p-space-xl rounded-2xl bg-surface-card border border-border-crisp shadow-xl">
          <div className="flex flex-col gap-space-xs max-w-2xl">
            <div className="flex items-center gap-space-sm">
              <span className="w-3 h-3 rounded-full bg-govtech-emerald" />
              <span className="font-headline-md text-headline-md font-bold text-text-primary">
                Enterprise Air-Gapped GovTech Architecture
              </span>
              <span className="px-2 py-0.5 rounded bg-govtech-emerald/20 text-govtech-emerald font-mono-citation text-mono-citation font-bold">
                STQC READY
              </span>
            </div>
            <p className="font-body-md text-body-md text-text-secondary leading-relaxed">
              Engineered strictly for Ministry of Coal compliance mandates. No public LLM API data
              transmission. All geological models, OCR extractors, and vector embeddings operate on
              dedicated sovereign GPU nodes within National Informatics Centre (NIC) and Coal
              India data perimeter.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-space-sm w-full md:w-auto shrink-0">
            <div className="flex flex-col items-center justify-center px-space-lg py-space-sm rounded bg-surface-dim text-center border border-border-crisp">
              <span className="font-mono-label text-mono-label text-text-muted uppercase">
                Latency Target
              </span>
              <span className="font-mono-metric-md text-mono-metric-md text-govtech-emerald font-bold">
                &lt; 1,200 ms
              </span>
            </div>
            <div className="flex flex-col items-center justify-center px-space-lg py-space-sm rounded bg-surface-dim text-center border border-border-crisp">
              <span className="font-mono-label text-mono-label text-text-muted uppercase">
                Access Matrix
              </span>
              <span className="font-mono-metric-md text-mono-metric-md text-mining-gold-bright font-bold">
                CMR 2017 RBAC
              </span>
            </div>
          </div>
        </div>

        {/* Compliance Badges Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-space-md">
          <div className="flex items-center gap-space-sm p-space-md rounded-xl bg-surface-card border border-border-crisp shadow-sm">
            <span className="material-symbols-outlined text-mining-gold-bright text-[28px]">
              gavel
            </span>
            <div className="flex flex-col">
              <span className="font-body-sm text-body-sm font-semibold text-text-primary">
                DGMS Statutory Ready
              </span>
              <span className="font-mono-citation text-mono-citation text-text-muted">
                Form I, II, IV Compliant
              </span>
            </div>
          </div>
          <div className="flex items-center gap-space-sm p-space-md rounded-xl bg-surface-card border border-border-crisp shadow-sm">
            <span className="material-symbols-outlined text-govtech-emerald text-[28px]">
              cloud_done
            </span>
            <div className="flex flex-col">
              <span className="font-body-sm text-body-sm font-semibold text-text-primary">
                MeitY Cloud Empanelled
              </span>
              <span className="font-mono-citation text-mono-citation text-text-muted">
                Data Residency in Bharat
              </span>
            </div>
          </div>
          <div className="flex items-center gap-space-sm p-space-md rounded-xl bg-surface-card border border-border-crisp shadow-sm">
            <span className="material-symbols-outlined text-tertiary-container text-[28px]">
              history_edu
            </span>
            <div className="flex flex-col">
              <span className="font-body-sm text-body-sm font-semibold text-text-primary">
                Parliamentary Secretariat
              </span>
              <span className="font-mono-citation text-mono-citation text-text-muted">
                Lok/Rajya Sabha Starred Audit
              </span>
            </div>
          </div>
          <div className="flex items-center gap-space-sm p-space-md rounded-xl bg-surface-card border border-border-crisp shadow-sm">
            <span className="material-symbols-outlined text-mining-gold-bright text-[28px]">
              vpn_key
            </span>
            <div className="flex flex-col">
              <span className="font-body-sm text-body-sm font-semibold text-text-primary">
                Role-Based RBAC
              </span>
              <span className="font-mono-citation text-mono-citation text-text-muted">
                Surveyor vs Mine Manager
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
