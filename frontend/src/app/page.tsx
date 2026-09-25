import { SovereignStrip } from "@/components/landing/SovereignStrip";
import { HeroSection } from "@/components/landing/HeroSection";
import { MandatedPillars } from "@/components/landing/MandatedPillars";
import { SubsidiaryFleet } from "@/components/landing/SubsidiaryFleet";
import { ComplianceBanner } from "@/components/landing/ComplianceBanner";

export default function LandingPage() {
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
