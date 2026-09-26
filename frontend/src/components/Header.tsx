"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/AuthProvider";

const navItems = [
  { label: "Workspace", href: "/dashboard" },
];

// Scroll distance after which the marketing capsule nav starts shrinking.
const SCROLL_SHRINK_THRESHOLD = 40;

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, signOut, user } = useAuth();

  // Marketing chrome (landing + login): logo and a single CTA only, no app nav.
  const isMarketingRoute = pathname === "/" || pathname === "/login";

  const [isScrolled, setIsScrolled] = useState(false);

  // rAF-throttled scroll listener — only active on marketing routes, where the
  // nav starts genuinely full-width (max-w-none) and shrinks into a capsule
  // (max-w-4xl) once the page has scrolled past SCROLL_SHRINK_THRESHOLD.
  // (Previously both states were capped at max-w-5xl/max-w-4xl, so on any
  // screen wider than ~1024px the "unscrolled" state never reached 100% width
  // at all — this is the fix for that.)
  useEffect(() => {
    if (!isMarketingRoute) return;

    let rafId: number | null = null;

    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        setIsScrolled(window.scrollY > SCROLL_SHRINK_THRESHOLD);
        rafId = null;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isMarketingRoute]);

  if (isMarketingRoute) {
    return (
      <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-space-lg pt-space-sm">
        <div
          className={`flex items-center gap-space-md h-14 w-full rounded-full border border-border-crisp bg-surface-card/95 backdrop-blur-xl shadow-xl px-space-lg transition-[max-width] duration-700 ease-in-out ${
            isScrolled ? "max-w-4xl" : "max-w-none"
          }`}
        >
          <Link href="/" className="flex items-center gap-space-sm min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-surface-base text-[18px]">
                terrain
              </span>
            </div>
            <span className="font-mono-citation text-mono-citation text-text-secondary uppercase tracking-wider truncate">
              PS #26023 <span className="text-text-muted">&middot;</span> CMPDI GeoReport AI
            </span>
          </Link>

          <div className="flex-1" />

          {isAuthenticated ? (
            <Link
              href="/dashboard"
              className="shrink-0 rounded-full bg-primary-container px-space-lg py-2 font-body-sm font-semibold text-surface-base hover:bg-mining-gold-deep transition-colors"
            >
              Go to Workspace
            </Link>
          ) : (
            <Link
              href="/login"
              className="shrink-0 rounded-full border border-primary-container px-space-lg py-2 font-body-sm font-semibold text-mining-gold-bright hover:bg-surface-hover transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>
    );
  }

  return (
    <header className="fixed top-0 left-0 right-0 w-full z-50 bg-surface-base/95 backdrop-blur-xl border-b border-border-crisp">
      <div className="h-16 w-full px-space-xl flex items-center justify-between gap-space-md">
        {/* Left: Logo + Brand */}
        <div className="flex items-center gap-space-base min-w-max">
          <div className="flex items-center gap-space-sm">
            <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center">
              <span className="material-symbols-outlined text-surface-base text-[18px]">
                terrain
              </span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-space-xs">
                <Link
                  href="/"
                  className="font-headline-md text-headline-md font-bold tracking-tight text-text-primary hover:text-mining-gold-bright transition-colors"
                >
                  CMPDI GeoReport AI
                </Link>
                <span className="font-mono-citation text-mono-citation px-space-xs py-0.5 rounded bg-surface-container-high text-mining-gold-bright border border-border-crisp">
                  ID: #26023
                </span>
              </div>
              <span className="font-body-sm text-body-sm text-text-muted">
                Ministry of Coal • Coal India Limited
              </span>
            </div>
          </div>
        </div>

        {/* Center: Navigation */}
        <nav className="hidden xl:flex items-center gap-space-xs h-full">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "h-full flex items-center px-space-base transition-colors bg-surface-hover text-text-primary border-b-2 border-primary-container font-semibold"
                    : "h-full flex items-center px-space-base font-body-md text-body-md text-text-secondary hover:text-text-primary hover:bg-surface-card transition-colors"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: Status + User */}
        <div className="flex items-center gap-space-md min-w-max">
          {/* Notification Bell */}
          <div className="relative flex items-center justify-center">
            <button
              type="button"
              className="w-9 h-9 rounded bg-surface-card hover:bg-surface-hover border border-border-crisp flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors relative"
            >
              <span className="material-symbols-outlined text-[20px]">
                notifications
              </span>
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-state-warning rounded-full" />
            </button>
          </div>

          {isAuthenticated && user ? (
            <div className="flex items-center gap-space-sm pl-space-xs">
              <div className="hidden sm:flex flex-col items-end text-right">
                <span className="font-body-sm text-body-sm font-semibold text-text-primary leading-tight">{user.name}</span>
                <button className="font-mono-citation text-mono-citation text-text-muted hover:text-mining-gold-bright" onClick={() => { signOut(); router.push("/"); }} type="button">Sign out</button>
              </div>
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
              </div>
            </div>
          ) : (
            <Link className="rounded-lg border border-primary-container px-space-base py-2 font-body-sm font-semibold text-mining-gold-bright hover:bg-surface-card" href="/login">Sign in</Link>
          )}
        </div>
      </div>
    </header>
  );
}
