"use client";

import { motion, useInView } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

export const CTASection = () => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const [arxivId, setArxivId] = useState("");

  return (
    <section id="cta" className="w-full py-28 px-5 sm:px-8 md:px-16 bg-[#0a0a0a]">
      <div ref={ref} className="mx-auto max-w-6xl">

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-3xl border border-white/[0.07] bg-[#111] px-8 py-14 sm:px-14 sm:py-20"
        >
          <div className="max-w-xl">
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mb-4 font-mono text-[10px] tracking-[0.2em] text-white/30 uppercase"
            >
              Hackathon Early Access
            </motion.p>

            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="mb-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl"
            >
              Audit your first paper.
              <br />
              <span className="text-white/35">Right now.</span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="mb-10 text-sm leading-relaxed text-white/40"
            >
              Paste an ArXiv ID or upload a PDF. We handle the environment, the dependencies, the execution, and
              the verdict — in minutes, not hours. No sign-up required.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.28 }}
              className="flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <div className="flex flex-1 items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 max-w-sm">
                <input
                  type="text"
                  value={arxivId}
                  onChange={(e) => setArxivId(e.target.value)}
                  placeholder="arxiv:2305.10601"
                  className="flex-1 bg-transparent font-mono text-sm text-white placeholder:text-white/20 outline-none"
                />
              </div>

              <Link
                href={
                  arxivId.trim()
                    ? `/dashboard?arxiv=${encodeURIComponent(arxivId.trim())}`
                    : "/dashboard"
                }
                className="btn-primary group shrink-0"
              >
                Run Audit
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>

              <Link href="/dashboard" className="btn-ghost shrink-0 text-center">
                Upload PDF
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : {}}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="mt-8 flex flex-wrap items-center gap-5 text-[11px] text-white/25"
            >
              {["No sign-up required", "Results in under 10 minutes", "Free for researchers"].map((item, i) => (
                <span key={i} className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-white/25" />
                  {item}
                </span>
              ))}
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
