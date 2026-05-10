import { AuditFlowHero } from "@/components/ui/auditflow-hero";
import { ProblemSection } from "@/components/ui/problem-section";
import { HowItWorksSection } from "@/components/ui/how-it-works";
import { ScorecardSection } from "@/components/ui/scorecard-section";
import { FeaturesSection } from "@/components/ui/features-section";
import { ArchitectureSection } from "@/components/ui/architecture-section";
import { MetricsSection } from "@/components/ui/metrics-section";
import { CTASection } from "@/components/ui/cta-section";
import { Footer } from "@/components/ui/footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-[oklch(0.08_0.01_265)]">
      <div className="p-3 sm:p-4">
        <AuditFlowHero />
      </div>
      <ProblemSection />
      <MetricsSection />
      <HowItWorksSection />
      <ScorecardSection />
      <FeaturesSection />
      <ArchitectureSection />
      <CTASection />
      <Footer />
    </main>
  );
}
