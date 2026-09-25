"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { LoadingPanel } from "@/components/DataState";
import { useAuth } from "@/components/AuthProvider";

export function ProtectedPage({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isReady } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isReady && !isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isAuthenticated, isReady, pathname, router]);

  if (!isReady || !isAuthenticated) {
    return <LoadingPanel>Checking your session…</LoadingPanel>;
  }

  return <>{children}</>;
}
