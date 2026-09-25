import React from "react";

// Lean, one-line highlight cards — replaces the earlier verbose three-pillar
// copy blocks with crisp, scannable points.
const HIGHLIGHTS = [
  { icon: "article", label: "Automated statutory report generation in seconds, not days." },
  { icon: "bubble_chart", label: "Instant topic and keyword extraction across geological filings." },
  { icon: "question_answer", label: "Grounded Q&A with page-level source citations." },
  { icon: "verified", label: "Zero-hallucination answers, audited against source documents." },
];

export function HighlightPoints() {
  return (
    <section className="w-full py-space-3xl px-space-xl bg-surface-base border-t border-border-crisp">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
          {HIGHLIGHTS.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-space-sm p-space-lg rounded-xl bg-surface-card border border-border-crisp hover:border-mining-gold-bright/50 transition-all"
            >
              <span className="material-symbols-outlined text-mining-gold-bright text-[22px] shrink-0">
                {item.icon}
              </span>
              <span className="font-body-sm text-body-sm text-text-primary font-medium">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
