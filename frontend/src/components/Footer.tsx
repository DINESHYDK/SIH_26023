"use client";

import { usePathname } from "next/navigation";

export function Footer() {
  const pathname = usePathname();
  const currentYear = new Date().getFullYear();

  // Marketing chrome only (landing + login) — mirrors the isMarketingRoute
  // split in Header.tsx. App routes (dashboard, folder workspaces, reports)
  // render their own full-height layouts and shouldn't end in a footer.
  const isMarketingRoute = pathname === "/" || pathname === "/login";
  if (!isMarketingRoute) return null;

  return (
    <footer className="w-full bg-surface-base border-t border-border-crisp py-space-xl">
      <div className="w-full px-space-xl flex flex-col md:flex-row items-center justify-between gap-space-base">
        <div className="flex items-center gap-space-md">
          <span className="font-mono-citation text-mono-citation text-text-muted">
            Problem Statement 26023
          </span>
          <span className="text-border-crisp">|</span>
          <span className="font-body-sm text-body-sm text-text-muted">
            Ministry of Coal, Government of India
          </span>
        </div>
        <div className="flex items-center gap-space-md">
          <span className="font-mono-citation text-mono-citation text-text-muted">
            &copy; {currentYear} Ministry of Coal, Government of India. Authorised Personnel Only.
          </span>
          {/* TODO: replace "#" with the real GitHub repository URL once known */}
          <a
            href="#"
            className="font-mono-citation text-mono-citation text-mining-gold-bright hover:underline"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
