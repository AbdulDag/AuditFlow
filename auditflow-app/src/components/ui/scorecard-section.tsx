"use client";

import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";

type ScoreStatus = "pass" | "fail" | "partial" | "na";

interface ScorecardMetric {
  id: string;
  label: string;
  description: string;
  status: ScoreStatus;
  detail: string;
  score: number;
}

const metrics: ScorecardMetric[] = [
  {
    id: "env",
    label: "Environment",
    description: "Docker image build",
    status: "pass",
    detail: "Image built in 4m 12s. Base: python:3.9-cuda11.3. All system deps resolved.",
    score: 1.0,
  },
  {
    id: "dep",
    label: "Dependency",
    description: "Library resolution",
    status: "partial",
    detail: "14/16 packages resolved. cv2==4.5.1 not on PyPI. torch-scatter==2.0.8 CUDA wheel unavailable.",
    score: 0.875,
  },
  {
    id: "exec",
    label: "Execution",
    description: "Entry point run",
    status: "fail",
    detail: "CRASH at train.py:47 — ModuleNotFoundError: No module named 'cv2'. Exit code: 1.",
    score: 0.0,
  },
  {
    id: "artifact",
    label: "Artifact",
    description: "Model file or logs",
    status: "na",
    detail: "Execution did not complete. No .pth, .h5, or result logs generated.",
    score: 0.0,
  },
];

const statusLabel: Record<ScoreStatus, string> = {
  pass: "Pass",
  fail: "Fail",
  partial: "Partial",
  na: "N/A",
};

const statusDot: Record<ScoreStatus, string> = {
  pass: "bg-white",
  fail: "bg-white/20",
  partial: "bg-white/60",
  na: "bg-white/10",
};

const rIndex = 0.459;

const logLines = [
  { dim: true,  text: "→ Cloning github.com/author/attention-repro" },
  { dim: true,  text: "→ Detected: requirements.txt, train.py" },
  { dim: true,  text: "→ Generating Dockerfile — python:3.9-cuda11.3" },
  { dim: false, text: "✓ Docker build complete (4m 12s)" },
  { dim: true,  text: "→ Installing 16 packages..." },
  { dim: true,  text: "⚠ cv2==4.5.1 not found — trying opencv-python-headless" },
  { dim: true,  text: "⚠ torch-scatter==2.0.8 CUDA wheel unavailable" },
  { dim: true,  text: "→ Running: python train.py --config config/base.yaml" },
  { dim: false, text: "✗ ModuleNotFoundError: No module named 'cv2' (line 47)" },
  { dim: false, text: "✗ Exit code: 1" },
];

export const ScorecardSection = () => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const [active, setActive] = useState("exec");
  const activeMetric = metrics.find((m) => m.id === active)!;

  return (
    <section id="scorecard" className="w-full py-28 px-5 sm:px-8 md:px-16">
      <div ref={ref} className="mx-auto max-w-6xl">

        <div className="mb-20">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="mb-3 font-mono text-[10px] tracking-[0.2em] text-white/30 uppercase"
          >
            Live Demo
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="text-4xl font-semibold tracking-tight text-white sm:text-5xl"
          >
            Reproducibility Scorecard
            <br />
            <span className="text-white/30">real audit, real result.</span>
          </motion.h2>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.6fr]">

          {/* Left panel */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex flex-col gap-3"
          >
            {/* R Index */}
            <div className="rounded-2xl border border-white/[0.07] bg-[#111] p-6">
              <div className="mb-1 font-mono text-[10px] tracking-[0.15em] text-white/30 uppercase">
                Reproducibility Index R
              </div>
              <div className="mb-4 font-mono text-5xl font-bold text-white">
                {(rIndex * 100).toFixed(1)}
                <span className="text-2xl text-white/25">/100</span>
              </div>
              <div className="h-[2px] overflow-hidden rounded-full bg-white/[0.07]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={isInView ? { width: `${rIndex * 100}%` } : {}}
                  transition={{ duration: 1.2, delay: 0.6, ease: "easeOut" }}
                  className="h-full rounded-full bg-white/70"
                />
              </div>
            </div>

            {/* Stage rows */}
            {metrics.map((m, i) => (
              <motion.button
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.4, delay: i * 0.07 + 0.35 }}
                onClick={() => setActive(m.id)}
                className={`w-full rounded-xl border px-4 py-4 text-left transition-all ${
                  active === m.id
                    ? "border-white/15 bg-white/[0.06]"
                    : "border-white/[0.06] bg-[#111] hover:border-white/10"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot[m.status]}`} />
                    <div>
                      <div className="text-sm font-medium text-white">{m.label}</div>
                      <div className="text-[11px] text-white/30">{m.description}</div>
                    </div>
                  </div>
                  <span className="rounded-md bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-white/50">
                    {statusLabel[m.status]}
                  </span>
                </div>
                <div className="mt-3 h-[1px] overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={isInView ? { width: `${m.score * 100}%` } : {}}
                    transition={{ duration: 0.8, delay: i * 0.08 + 0.5 }}
                    className="h-full rounded-full bg-white/40"
                  />
                </div>
              </motion.button>
            ))}
          </motion.div>

          {/* Right panel */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col gap-3"
          >
            {/* Detail */}
            <div className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
              <div className="mb-2 flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${statusDot[activeMetric.status]}`} />
                <span className="font-mono text-[10px] tracking-widest text-white/40 uppercase">
                  {activeMetric.label} — {statusLabel[activeMetric.status]}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-white/60">{activeMetric.detail}</p>
            </div>

            {/* Terminal */}
            <div className="flex-1 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a0a0a]">
              <div className="flex items-center gap-2 border-b border-white/[0.05] px-4 py-2.5">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                </div>
                <span className="font-mono text-[10px] text-white/20">auditflow — execution log</span>
              </div>
              <div className="space-y-1 p-4 font-mono text-[11px] leading-5">
                {logLines.map((line, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={isInView ? { opacity: 1 } : {}}
                    transition={{ duration: 0.25, delay: i * 0.05 + 0.5 }}
                    className={line.dim ? "text-white/25" : "text-white/75"}
                  >
                    {line.text}
                  </motion.div>
                ))}
                <div className="mt-1 flex items-center gap-1 text-white/30">
                  <span>$</span>
                  <span className="cursor-blink inline-block h-3 w-1.5 bg-white/30" />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
