import TopNav from "@/components/TopNav";
import Hero from "@/components/landing/Hero";
import FeatureGrid from "@/components/landing/FeatureGrid";
import HowItWorks from "@/components/landing/HowItWorks";
import MetricsBanner from "@/components/landing/MetricsBanner";
import LandingCTA from "@/components/landing/LandingCTA";
import Footer from "@/components/landing/Footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#020617]">
      <TopNav />
      <Hero />
      <MetricsBanner />
      <FeatureGrid />
      <HowItWorks />
      <LandingCTA />
      <Footer />
    </main>
  );
}
