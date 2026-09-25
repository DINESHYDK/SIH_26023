"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SovereignStrip } from "@/components/landing/SovereignStrip";
import { HeroSection } from "@/components/landing/HeroSection";
import { MandatedPillars } from "@/components/landing/MandatedPillars";
import { SubsidiaryFleet } from "@/components/landing/SubsidiaryFleet";
import { ComplianceBanner } from "@/components/landing/ComplianceBanner";
import { useAuth } from "@/components/AuthProvider";

export default function LandingPage() {
  const { isAuthenticated, isReady } = useAuth();
  const router = useRouter();

  // TEST BUILD — see UI_UX_REVIEW.md section 1: signed-in users shouldn't
  // land back on the marketing page; they sign out to see it again.
  useEffect(() => {
    if (isReady && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isReady, isAuthenticated, router]);

  return (
    <div className="flex flex-col w-full">
      <SovereignStrip />
      <HeroSection />
      <MandatedPillars />
      <SubsidiaryFleet />
      <ComplianceBanner />
    </div>
  );
}
