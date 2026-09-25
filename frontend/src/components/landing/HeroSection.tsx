"use client";

import Link from "next/link";

import { useAuth } from "@/components/AuthProvider";

export function HeroSection() {
  const { isAuthenticated } = useAuth();
  const ctaHref = isAuthenticated ? "/dashboard" : "/login";

  return (
    <section
      className="relative w-full min-h-[640px] flex items-center overflow-hidden bg-surface-dim bg-cover bg-center"
      style={{ backgroundImage: "url('/.jpg')" }}
    >
      {/* Scrims for text legibility over the background image */}
      <div className="absolute inset-0 bg-gradient-to-r from-surface-base via-surface-base/85 to-surface-base/30" />
      <div className="absolute inset-0 bg-gradient-to-t from-surface-base via-transparent to-surface-base/30" />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-space-xl py-space-3xl">
        <div className="max-w-2xl flex flex-col gap-space-lg">
          <span className="font-mono-label text-mono-label text-mining-gold-bright uppercase tracking-widest">
            Problem Statement ID: #26023
          </span>
          <h1 className="font-headline-xl text-headline-xl text-text-primary tracking-tight leading-none font-bold">
            AI-Powered Geological, Mining &amp; Statutory Intelligence for{" "}
            <span className="text-mining-gold-bright">Coal India</span>{" "}
            Subsidiaries.
          </h1>
          <div className="pt-space-xs">
            <Link
              className="inline-flex items-center gap-space-sm px-space-xl py-space-md rounded-lg bg-primary-container text-surface-base font-bold shadow-xl shadow-primary-container/20 hover:bg-mining-gold-deep transition-all transform hover:-translate-y-0.5"
              href={ctaHref}
            >
              <span className="material-symbols-outlined text-[20px]">
                terminal
              </span>
              <span className="font-headline-md text-body-md font-bold">
                Launch Intelligence Workspace
              </span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
