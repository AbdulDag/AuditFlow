"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const steps = [
  {
    n: "01",
    title: "Submit",
    sub: "ArXiv ID or PDF upload",
    desc: "Paste an ArXiv identifier or upload a research PDF directly. AuditFlow accepts any format — IEEE two-column, ACM, NeurIPS conference style.",
    aside: "Azure Document Intelligence parses layout without mixing columns.",
  },
  {
    n: "02",
    title: "Extract",
    sub: "Layout-aware OCR",
    desc: "Azure AI Document Intelligence runs layout analysis, recovering GitHub URLs, library requirements, and reported metrics from the exact text on the page. Zero hallucination — every data point has a source coordinate.",
    aside: "Identifies requirements.txt, conda env files, and inline dependency lists.",
  },
  {
    n: "03",
    title: "Build",
    sub: "Dynamic Docker image",
    desc: "A Dockerfile is generated from the extracted Python and CUDA versions. The repository is cloned, the image is built, and entry points are detected automatically. Resource limits prevent malicious execution.",
    aside: "If a library is missing, the system auto-installs and logs the failure trace.",
  },
  {
    n: "04",
    title: "Score",
    sub: "Reproducibility Scorecard",
    desc: "Live execution logs stream in real time. The system scores four stages — Environment, Dependency, Execution, Artifact — then computes the Reproducibility Index R. Every score is backed by a specific log line.",
    aside: "Crash reasons flagged exactly — not summarized, not approximated.",
  },
];

export const HowItWorksSection = () => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="how-it-works" className="w-full py-28 px-5 sm:px-8 md:px-16">
      <div ref={ref} className="mx-auto max-w-6xl">

        <div className="mb-20">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="mb-3 font-mono text-[10px] tracking-[0.2em] text-white/30 uppercase"
          >
            The Pipeline
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="text-4xl font-semibold tracking-tight text-white sm:text-5xl"
          >
            From PDF to proof
            <br />
            <span className="text-white/30">in four stages.</span>
          </motion.h2>
        </div>

        <div className="divide-y divide-white/[0.07]">
          {steps.map((step, i) => (
            <motion.div
              key={step.n}
              initial={{ opacity: 0, y: 16 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: i * 0.1 + 0.15 }}
              className="grid grid-cols-12 gap-6 py-10"
            >
              {/* Step number */}
              <div className="col-span-2 sm:col-span-1">
                <span className="font-mono text-xs text-white/20 tabular-nums">{step.n}</span>
              </div>

              {/* Title */}
              <div className="col-span-10 sm:col-span-3 lg:col-span-2">
                <div className="text-xl font-semibold text-white">{step.title}</div>
                <div className="mt-0.5 text-xs text-white/35">{step.sub}</div>
              </div>

              {/* Description */}
              <div className="col-span-12 sm:col-span-8 lg:col-span-6 sm:col-start-4 lg:col-start-4">
                <p className="text-sm leading-relaxed text-white/50">{step.desc}</p>
              </div>

              {/* Aside */}
              <div className="col-span-12 lg:col-span-3 lg:col-start-10">
                <p className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[11px] leading-relaxed text-white/30">
                  {step.aside}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
