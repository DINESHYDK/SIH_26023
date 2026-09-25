"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export function DemoVideo() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;

    // Respect reduced-motion preference: show the section immediately instead
    // of animating it in.
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="w-full py-space-3xl px-space-xl bg-surface-base border-t border-border-crisp overflow-hidden">
      <div
        ref={sectionRef}
        className={`max-w-7xl mx-auto flex flex-col items-center gap-space-xl text-center transition-all duration-700 ease-out ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        <div className="flex flex-col gap-space-sm">
          <span className="font-mono-label text-mono-label text-mining-gold-bright uppercase tracking-widest">
            See It In Action
          </span>
          <h2 className="font-headline-xl text-headline-xl text-text-primary font-bold tracking-tight">
            Watch the Workspace in Motion
          </h2>
        </div>

        <div className="w-full max-w-4xl aspect-video rounded-xl bg-surface-card border border-border-crisp flex items-center justify-center shadow-xl">
          <div className="flex flex-col items-center gap-space-sm text-text-muted">
            <span className="material-symbols-outlined text-[48px] text-mining-gold-bright">
              play_circle
            </span>
            <span className="font-body-sm text-body-sm">Demo video coming soon</span>
          </div>
        </div>

        <Link
          href="/try-out"
          className="inline-flex items-center gap-space-sm px-space-xl py-space-md rounded-lg bg-surface-card text-text-primary hover:bg-surface-hover shadow-md border border-border-crisp transition-all"
        >
          <span className="material-symbols-outlined text-mining-gold-bright text-[20px]">
            rocket_launch
          </span>
          <span className="font-body-md text-body-md font-semibold">Try Out</span>
        </Link>
      </div>
    </section>
  );
}
