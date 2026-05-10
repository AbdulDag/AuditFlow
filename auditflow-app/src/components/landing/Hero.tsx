"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/* Lightweight SVG burst — white particle lines radiating from a point, matching the FutureTech aesthetic */
function ParticleBurst() {
  const lines: { angle: number; len: number; opacity: number }[] = [];
  for (let i = 0; i < 60; i++) {
    const angle = (i / 60) * 360 + Math.random() * 3;
    const len = 80 + Math.random() * 200;
    const opacity = 0.08 + Math.random() * 0.22;
    lines.push({ angle, len, opacity });
  }

  return (
    <svg
      viewBox="0 0 500 500"
      className="w-full h-full"
      style={{ maxWidth: 520, maxHeight: 520 }}
      aria-hidden
    >
      {lines.map((l, i) => {
        const rad = (l.angle * Math.PI) / 180;
        const x2 = 250 + Math.cos(rad) * l.len;
        const y2 = 250 + Math.sin(rad) * l.len;
        return (
          <line
            key={i}
            x1={250}
            y1={250}
            x2={x2}
            y2={y2}
            stroke="white"
            strokeWidth={0.7}
            strokeOpacity={l.opacity}
          />
        );
      })}
      {/* Core glow */}
      <circle cx={250} cy={250} r={6} fill="white" fillOpacity={0.7} />
      <circle cx={250} cy={250} r={20} fill="white" fillOpacity={0.07} />
      <circle cx={250} cy={250} r={50} fill="white" fillOpacity={0.03} />
    </svg>
  );
}

const AVATARS = ["JD", "KL", "MR", "SW"];

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-[#0D0D0D] bg-grid pt-28">
      {/* Subtle yellow ambient top-left */}
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[#F5C518]/3 blur-[160px] pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-0 items-center">

          {/* LEFT — copy */}
          <div className="flex flex-col gap-0">
            {/* Eyebrow */}
            <p className="text-sm text-[#9CA3AF] mb-4 fade-in-up">
              Your Journey to Scientific Certainty Begins Here
            </p>

            {/* Headline */}
            <h1 className="text-5xl md:text-6xl xl:text-7xl font-extrabold text-white leading-[1.05] tracking-tight mb-6 fade-in-up-delay-1">
              Automate&nbsp;the<br />
              Complex.&nbsp;Verify<br />
              the&nbsp;<span className="text-[#F5C518]">Science.</span>
            </h1>

            {/* Body */}
            <p className="text-[#9CA3AF] text-base leading-relaxed max-w-lg mb-10 fade-in-up-delay-2">
              Welcome to the epicenter of reproducibility intelligence. AuditFlow
              is your passport to a world where research code runs, dependencies
              resolve, and results are verified — automatically.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4 fade-in-up-delay-3">
              <Link
                href="/dashboard"
                className="px-6 py-3 bg-[#F5C518] text-black text-sm font-bold rounded-lg hover:bg-[#D4AC15] transition-colors duration-150 cursor-pointer"
              >
                Start Auditing
              </Link>
              <Link
                href="/#how-it-works"
                className="flex items-center gap-1.5 px-6 py-3 border border-[#2A2A2A] text-[#9CA3AF] text-sm font-medium rounded-lg hover:border-[#3A3A3A] hover:text-white transition-colors duration-150 cursor-pointer"
              >
                See How It Works
              </Link>
            </div>
          </div>

          {/* RIGHT — visual + social proof */}
          <div className="flex flex-col items-center lg:items-end gap-6 fade-in-up-delay-2">
            {/* Particle burst */}
            <div className="relative w-full flex justify-center lg:justify-end">
              <div className="w-[340px] h-[340px] md:w-[420px] md:h-[420px]">
                <ParticleBurst />
              </div>
            </div>

            {/* Social proof card */}
            <div className="w-full lg:w-auto bg-[#161616] border border-[#2A2A2A] rounded-2xl p-5 flex flex-col gap-4 lg:max-w-xs">
              {/* Avatar stack */}
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {AVATARS.map((initials, i) => (
                    <div
                      key={i}
                      className="w-9 h-9 rounded-full border-2 border-[#0D0D0D] bg-[#2A2A2A] flex items-center justify-center text-[10px] font-bold text-[#9CA3AF]"
                    >
                      {initials}
                    </div>
                  ))}
                </div>
              </div>

              {/* Caption */}
              <div>
                <p className="text-white font-bold text-sm">Explore 14,000+ audited papers</p>
                <p className="text-[#6B7280] text-xs mt-0.5">
                  Over 14,000 reproducibility reports on emerging research
                </p>
              </div>

              {/* Link */}
              <Link
                href="/dashboard/history"
                className="inline-flex items-center gap-2 px-4 py-2 border border-[#2A2A2A] text-[#9CA3AF] text-xs font-medium rounded-lg hover:border-[#3A3A3A] hover:text-white transition-colors w-fit cursor-pointer"
              >
                Explore Reports
                <ArrowUpRight size={12} className="text-[#F5C518]" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
