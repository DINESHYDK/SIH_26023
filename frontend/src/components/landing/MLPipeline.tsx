import React from "react";

// Real pipeline facts sourced from ml_service — keep in sync with the actual
// ingestion/retrieval/reasoning implementation, don't embellish.
const PIPELINE_HIGHLIGHTS = [
  {
    icon: "call_split",
    title: "Dual-Path Ingestion",
    description:
      "Auto-detects typed vs. scanned PDFs; typed docs get native text extraction, scanned docs go through Gemini Vision.",
  },
  {
    icon: "manage_search",
    title: "Grounded Retrieval",
    description:
      "FAISS vector search (typed docs) + BM25/SQLite (scanned docs, tables) feed every answer.",
  },
  {
    icon: "hub",
    title: "Gemini 2.5 Flash Reasoning",
    description:
      "LangGraph-orchestrated pipeline (locate → retrieve → prompt → generate) with rate-limited calls for reliability.",
  },
  {
    icon: "layers",
    title: "Multi-Document Context",
    description: "Ground answers across several uploaded documents in one query.",
  },
];

export function MLPipeline() {
  return (
    <section className="w-full py-space-3xl px-space-xl bg-surface-dim border-t border-border-crisp">
      <div className="max-w-7xl mx-auto">
        <div className="mb-space-2xl">
          <span className="font-mono-label text-mono-label text-mining-gold-bright uppercase tracking-widest">
            Under the Hood
          </span>
          <h2 className="font-headline-xl text-headline-xl text-text-primary font-bold tracking-tight mt-1">
            The ML Pipeline
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-md">
          {PIPELINE_HIGHLIGHTS.map((item) => (
            <div
              key={item.title}
              className="flex flex-col gap-space-sm p-space-lg rounded-xl bg-surface-card border border-border-crisp hover:border-mining-gold-bright/50 transition-all shadow-md"
            >
              <div className="w-10 h-10 rounded-lg bg-surface-dim flex items-center justify-center text-mining-gold-bright">
                <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
              </div>
              <h3 className="font-headline-md text-headline-md font-bold text-text-primary">
                {item.title}
              </h3>
              <p className="font-body-sm text-body-sm text-text-secondary leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
