import React from "react";

export function SovereignStrip() {
  return (
    <section className="w-full bg-surface-container-lowest py-space-sm px-space-xl border-b border-border-crisp/40">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-space-sm text-text-muted">
        <div className="flex items-center gap-space-sm">
          <span className="w-2 h-2 rounded-full bg-govtech-emerald" />
          <span className="font-mono-citation text-mono-citation uppercase tracking-widest text-text-secondary">
            Smart India Hackathon #26023 — Government of India Mandate
          </span>
        </div>
        <div className="flex items-center gap-space-lg text-text-muted font-mono-citation text-mono-citation">
          <span className="hidden sm:inline-flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px] text-mining-gold-bright">
              verified_user
            </span>{" "}
            Air-Gapped / STQC Certified
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px] text-govtech-emerald">
              database
            </span>{" "}
            14,821,904 Embeddings Synchronized
          </span>
          <span className="text-text-secondary">
            DGMS Portal Relay:{" "}
            <span className="text-govtech-emerald font-semibold">ACTIVE</span>
          </span>
        </div>
      </div>
    </section>
  );
}
