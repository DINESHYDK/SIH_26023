"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { HeroSection } from "@/components/landing/HeroSection";
import { HighlightPoints } from "@/components/landing/MandatedPillars";
import { DemoVideo } from "@/components/landing/DemoVideo";
import { MLPipeline } from "@/components/landing/MLPipeline";
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
      <HeroSection />
      <HighlightPoints />
      <DemoVideo />
      <MLPipeline />
    </div>
  );
}
