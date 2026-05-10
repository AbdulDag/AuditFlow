"use client";

import { motion, useInView } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useRef } from "react";
import { SignInButton, UserButton, Show } from "@clerk/nextjs";

interface WordsPullUpProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}

export const WordsPullUp = ({ text, className = "", style }: WordsPullUpProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const words = text.split(" ");

  return (
    <div ref={ref} className={`inline-flex flex-wrap ${className}`} style={style}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ y: 24, opacity: 0 }}
          animate={isInView ? { y: 0, opacity: 1 } : {}}
          transition={{ duration: 0.65, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="inline-block"
          style={{ marginRight: i < words.length - 1 ? "0.18em" : 0 }}
        >
          {word}
        </motion.span>
      ))}
    </div>
  );
};

const navItems = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Scorecard", href: "#scorecard" },
  { label: "Architecture", href: "#architecture" },
];

export const AuditFlowHero = () => {
  return (
    <section className="min-h-screen w-full" id="hero">
      <div className="relative min-h-screen w-full overflow-hidden rounded-2xl border border-white/[0.06] md:rounded-[2rem]">

        {/* Background (rolled back) */}
        <img
          src="https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=1920&q=80"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.3] mix-blend-overlay" aria-hidden />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/75 via-black/50 to-black/90" aria-hidden />

        {/* Nav: stable row, no overlap */}
        <nav className="sticky top-0 z-20 px-3 pt-3 sm:px-4 md:px-6">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-2xl border border-white/[0.08] bg-black/75 px-4 py-3 backdrop-blur-xl sm:rounded-b-2xl sm:px-6 md:px-8">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-x-7">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="text-[11px] font-medium text-white/45 transition-colors hover:text-white sm:text-xs md:text-sm"
                >
                  {item.label}
                </a>
              ))}
            </div>

            <div className="flex shrink-0 items-center">
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <button
                    type="button"
                    className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-white/90 sm:px-8 sm:py-3 sm:text-[15px]"
                  >
                    Sign In
                  </button>
                </SignInButton>
              </Show>
              <Show when="signed-in">
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: "h-10 w-10 sm:h-11 sm:w-11 ring-1 ring-white/15",
                      userButtonTrigger: "focus:shadow-none",
                    },
                  }}
                />
              </Show>
            </div>
          </div>
        </nav>

        {/* Hero content (rolled back, nav unchanged) */}
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-4 sm:px-8 md:px-12">
          <div className="grid grid-cols-12 items-end gap-4">
            <div className="col-span-12 lg:col-span-7">
              <h1 className="font-semibold leading-[0.87] tracking-[-0.06em] text-white text-[17vw] sm:text-[15vw] md:text-[13vw] lg:text-[12vw] xl:text-[11vw]">
                <WordsPullUp text="AuditFlow" />
              </h1>
            </div>

            <div className="col-span-12 flex flex-col gap-4 pb-6 lg:col-span-5 lg:pb-10">
              <motion.p
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="text-sm text-white/55 leading-relaxed"
              >
                The first deterministic auditor for ML research reproducibility.
                We run the code, trace failures, and score outcomes.
              </motion.p>

              <motion.div
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-3"
              >
                <a href="#cta" className="btn-primary group">
                  Run your first audit
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </a>
                <a href="#how-it-works" className="btn-ghost">
                  How it works
                </a>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.85 }}
                className="flex items-center gap-4 border-t border-white/[0.08] pt-4 text-[10px] text-white/25 font-medium tracking-wide"
              >
                <span>Zero Hallucination</span>
                <span className="h-px w-3 bg-white/15" />
                <span>Sandbox Isolated</span>
                <span className="h-px w-3 bg-white/15" />
                <span>Live Logs</span>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
