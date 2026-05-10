"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

export const FeaturesSection = () => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="features" className="w-full py-28 px-5 sm:px-8 md:px-16 bg-[#0a0a0a]">
      <div ref={ref} className="mx-auto max-w-6xl">

        <div className="mb-20">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            className="mb-3 font-mono text-[10px] tracking-[0.2em] text-white/30 uppercase"
          >
            Core Capabilities
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.05 }}
            className="text-4xl font-semibold tracking-tight text-white sm:text-5xl"
          >
            Three systems.
            <br />
            <span className="text-white/30">One deterministic verdict.</span>
          </motion.h2>
        </div>

        {/* Large feature — Extraction Engine */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-4 overflow-hidden rounded-3xl border border-white/[0.07] bg-[#111]"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2">
            <div className="p-8 sm:p-10">
              <p className="mb-3 font-mono text-[10px] tracking-[0.15em] text-white/30 uppercase">
                Extraction Engine
              </p>
              <h3 className="mb-4 text-2xl font-semibold text-white sm:text-3xl">Layout-Aware OCR</h3>
              <p className="mb-6 text-sm leading-relaxed text-white/45">
                Azure Document Intelligence parses two-column IEEE/ACM formats without mixing text. Mathematical
                formulas, GitHub URLs, and metric tables are recovered as structured data — not hallucinated summaries.
                Every extracted value has a bounding-box coordinate to prove provenance.
              </p>
              <div className="flex flex-wrap gap-2">
                {["Azure AI", "prebuilt-layout", "Zero Hallucination", "Formula Extraction"].map((t) => (
                  <span key={t} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-white/40">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            {/* Visual side */}
            <div className="flex items-center justify-center border-t border-white/[0.06] p-8 lg:border-l lg:border-t-0">
              <div className="w-full max-w-sm rounded-xl border border-white/[0.08] bg-[#0a0a0a] p-5 font-mono text-[11px]">
                <div className="mb-3 text-white/20 uppercase tracking-widest text-[9px]">Extracted metadata</div>
                {[
                  { key: "github_url", val: "github.com/author/repro" },
                  { key: "python_version", val: "3.9" },
                  { key: "cuda_version", val: "11.3" },
                  { key: "reported_accuracy", val: "94.2%" },
                  { key: "framework", val: "torch==1.9.0" },
                ].map(({ key, val }) => (
                  <div key={key} className="flex justify-between border-b border-white/[0.05] py-1.5 last:border-0">
                    <span className="text-white/30">{key}</span>
                    <span className="text-white/70">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Two-column row */}
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {[
            {
              category: "Infrastructure Factory",
              title: "Dynamic Dockerfile Generation",
              desc: "A Dockerfile is auto-generated from extracted Python and CUDA versions. Missing libraries trigger auto-install attempts with full failure tracing. Every container runs resource-limited.",
              tags: ["Docker SDK", "Python", "CUDA"],
            },
            {
              category: "Infrastructure Factory",
              title: "Sandboxed Execution",
              desc: "Repositories run inside isolated containers with no network egress. STDOUT and STDERR stream live to your dashboard. Exit codes are deterministic — never approximated.",
              tags: ["Isolation", "FastAPI", "WebSocket"],
            },
          ].map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.15 * i + 0.25 }}
              className="rounded-2xl border border-white/[0.07] bg-[#111] p-7"
            >
              <p className="mb-2 font-mono text-[10px] tracking-[0.15em] text-white/25 uppercase">{f.category}</p>
              <h3 className="mb-3 text-lg font-semibold text-white">{f.title}</h3>
              <p className="mb-5 text-sm leading-relaxed text-white/40">{f.desc}</p>
              <div className="flex flex-wrap gap-2">
                {f.tags.map((t) => (
                  <span key={t} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-white/35">
                    {t}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Scorecard row — full width, different layout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="rounded-2xl border border-white/[0.07] bg-[#111] p-7 sm:p-10"
        >
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <p className="mb-2 font-mono text-[10px] tracking-[0.15em] text-white/25 uppercase">Reproducibility Scorecard</p>
              <h3 className="mb-3 text-xl font-semibold text-white sm:text-2xl">Structured Audit Report</h3>
              <p className="text-sm leading-relaxed text-white/40">
                Four-stage scoring across Environment, Dependency, Execution, and Artifact. The Reproducibility Index
                R is computed from weighted stage completions. Every score is backed by a specific log line — not a
                language model&apos;s opinion.
              </p>
            </div>
            <div className="shrink-0 lg:min-w-[200px]">
              <div className="divide-y divide-white/[0.06] font-mono text-[11px]">
                {[
                  { label: "Environment", pct: "100%" },
                  { label: "Dependency", pct: "87.5%" },
                  { label: "Execution", pct: "0%" },
                  { label: "Artifact", pct: "N/A" },
                ].map(({ label, pct }) => (
                  <div key={label} className="flex items-center justify-between py-2">
                    <span className="text-white/35">{label}</span>
                    <span className="text-white/70">{pct}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-3">
                  <span className="text-white/50 font-semibold">R Index</span>
                  <span className="text-white font-bold">45.9</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
