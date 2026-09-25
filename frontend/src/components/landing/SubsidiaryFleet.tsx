"use client";

import React, { useState } from "react";
import Link from "next/link";
import { SUBSIDIARIES, type Subsidiary } from "@/constants/subsidiaries";

type FilterType = "all" | "coking" | "noncoking";

export function SubsidiaryFleet() {
  const [filter, setFilter] = useState<FilterType>("all");

  const filteredSubsidiaries = SUBSIDIARIES.filter((sub) => {
    if (filter === "all") return true;
    if (sub.isHQ) return true;
    return sub.type === filter;
  });

  return (
    <section className="w-full py-space-3xl px-space-xl bg-surface-dim border-t border-border-crisp">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-space-2xl gap-space-base">
          <div>
            <div className="flex items-center gap-space-xs">
              <span className="font-mono-label text-mono-label text-mining-gold-bright uppercase tracking-widest">
                National Coal Grid Command
              </span>
              <span className="px-2 py-0.5 rounded bg-govtech-emerald/10 text-govtech-emerald font-mono-citation text-mono-citation border border-govtech-emerald/30 font-semibold">
                8 OF 8 SYNCHRONIZED
              </span>
            </div>
            <h2 className="font-headline-xl text-headline-xl text-text-primary font-bold tracking-tight mt-1">
              Subsidiary Operational Fleet
            </h2>
            <p className="font-body-md text-body-md text-text-secondary mt-1">
              Real-time geological dossier indexing across Coal India operational commands. Select
              a subsidiary workspace to begin synthesis.
            </p>
          </div>

          {/* Interactive Filters */}
          <div className="flex items-center gap-space-xs p-1 bg-surface-card rounded-lg border border-border-crisp self-start md:self-auto">
            <button
              onClick={() => setFilter("all")}
              type="button"
              className={`px-space-md py-1 rounded font-body-sm text-body-sm transition-colors ${
                filter === "all"
                  ? "bg-primary-container text-surface-base font-bold"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              All Basins (8)
            </button>
            <button
              onClick={() => setFilter("coking")}
              type="button"
              className={`px-space-md py-1 rounded font-body-sm text-body-sm transition-colors ${
                filter === "coking"
                  ? "bg-primary-container text-surface-base font-bold"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Coking Basins (BCCL/CCL)
            </button>
            <button
              onClick={() => setFilter("noncoking")}
              type="button"
              className={`px-space-md py-1 rounded font-body-sm text-body-sm transition-colors ${
                filter === "noncoking"
                  ? "bg-primary-container text-surface-base font-bold"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Non-Coking Fleet (5)
            </button>
          </div>
        </div>

        {/* 8-Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-md">
          {filteredSubsidiaries.map((sub) => (
            <SubsidiaryCard key={sub.code} subsidiary={sub} />
          ))}
        </div>
      </div>
    </section>
  );
}

function SubsidiaryCard({ subsidiary }: { subsidiary: Subsidiary }) {
  const isBCCL = subsidiary.code === "BCCL";

  return (
    <div
      className={`flex flex-col justify-between p-space-lg rounded-xl bg-surface-card border transition-all shadow-md group ${
        isBCCL
          ? "border-mining-gold-bright/60 ring-1 ring-mining-gold-bright/30"
          : "border-border-crisp hover:border-mining-gold-bright/40"
      }`}
    >
      <div>
        <div className="flex items-center justify-between pb-space-sm border-b border-border-subtle">
          <div className="flex items-center gap-space-xs">
            <span className="font-headline-md text-headline-md font-bold text-text-primary tracking-tight">
              {subsidiary.code}
            </span>
            {isBCCL && (
              <span className="px-1.5 py-0.5 rounded text-mono-citation font-bold bg-primary-container text-surface-base uppercase">
                ACTIVE DEMO
              </span>
            )}
          </div>
          <span
            className={`font-mono-citation text-mono-citation px-space-xs py-0.5 rounded border ${subsidiary.badgeColor}`}
          >
            {subsidiary.status}
          </span>
        </div>

        <div className="mt-space-sm">
          <div className="font-body-sm text-body-sm font-semibold text-text-primary">
            {subsidiary.name}
          </div>
          <div className="font-mono-citation text-mono-citation text-text-muted mt-0.5">
            {subsidiary.region}
          </div>
        </div>

        {/* Telemetry rows */}
        <div className="mt-space-md space-y-1.5 pt-space-sm border-t border-border-subtle">
          <div className="flex items-center justify-between font-mono-citation text-mono-citation">
            <span className="text-text-muted">Q3 Production:</span>
            <span className="font-semibold text-text-primary">{subsidiary.production}</span>
          </div>
          <div className="flex items-center justify-between font-mono-citation text-mono-citation">
            <span className="text-text-muted">Target Variance:</span>
            <span className="text-govtech-emerald">{subsidiary.target}</span>
          </div>
          <div className="flex items-center justify-between font-mono-citation text-mono-citation">
            <span className="text-text-muted">Seams Monitored:</span>
            <span className="text-text-secondary truncate max-w-[140px]">
              {subsidiary.seams}
            </span>
          </div>
        </div>
      </div>

      <div className="pt-space-md mt-space-md border-t border-border-subtle flex items-center justify-between">
        <span className="font-mono-citation text-mono-citation text-text-muted">
          {subsidiary.typeLabel}
        </span>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 font-body-sm text-body-sm font-semibold text-mining-gold-bright group-hover:text-primary transition-colors"
        >
          Open Workspace{" "}
          <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
        </Link>
      </div>
    </div>
  );
}
