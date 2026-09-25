import React from "react";
import type { ReportData } from "@/lib/report-types";

export function DataModeBadge({ dataMode }: { dataMode: ReportData["dataMode"] }) {
  const isDemo = dataMode === "demo";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono-citation text-mono-citation font-semibold ${
        isDemo
          ? "border-mining-gold-bright/40 bg-mining-gold-bright/10 text-mining-gold-bright"
          : "border-govtech-emerald/40 bg-govtech-emerald-dim text-govtech-emerald"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isDemo ? "bg-mining-gold-bright" : "bg-govtech-emerald animate-pulse"
        }`}
      />
      {isDemo ? "BCCL Demo Mode" : "Live Multimodal RAG"}
    </span>
  );
}
