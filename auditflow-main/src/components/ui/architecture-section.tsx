"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const stack = [
  {
    layer: "Frontend",
    items: ["Next.js 15", "Tailwind CSS", "framer-motion", "WebSocket streams"],
  },
  {
    layer: "Backend",
    items: ["FastAPI (Python)", "Docker SDK", "GitPython", "Celery queue"],
  },
  {
    layer: "AI / OCR",
    items: ["Azure Document Intelligence", "prebuilt-layout model", "Formula extraction", "Metadata recovery"],
  },
  {
    layer: "Data",
    items: ["MongoDB Atlas", "Docker Registry", "S3 / Blob storage", "Redis cache"],
  },
];

export const ArchitectureSection = () => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="architecture" className="w-full py-28 px-5 sm:px-8 md:px-16">
      <div ref={ref} className="mx-auto max-w-6xl">

        <div className="mb-20">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            className="mb-3 font-mono text-[10px] tracking-[0.2em] text-white/30 uppercase"
          >
            Technical Architecture
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.05 }}
            className="text-4xl font-semibold tracking-tight text-white sm:text-5xl"
          >
            Built for science.
            <br />
            <span className="text-white/30">Not for demos.</span>
          </motion.h2>
        </div>

        {/* Stack — horizontal rule separated list */}
        <div className="mb-16 divide-y divide-white/[0.07]">
          {stack.map((layer, i) => (
            <motion.div
              key={layer.layer}
              initial={{ opacity: 0, y: 12 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.08 + 0.1 }}
              className="grid grid-cols-12 items-start gap-4 py-7"
            >
              <div className="col-span-3 sm:col-span-2">
                <span className="font-mono text-[10px] tracking-[0.15em] text-white/30 uppercase">{layer.layer}</span>
              </div>
              <div className="col-span-9 sm:col-span-10 flex flex-wrap gap-2">
                {layer.items.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm text-white/60"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Formula */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="rounded-2xl border border-white/[0.07] bg-[#111] p-8"
        >
          <p className="mb-4 font-mono text-[10px] tracking-[0.15em] text-white/30 uppercase">
            Scoring Formula
          </p>
          <div className="mb-6 overflow-x-auto rounded-xl border border-white/[0.06] bg-[#0a0a0a] px-5 py-4">
            <code className="font-mono text-sm text-white/70 whitespace-nowrap">
              R = [ (E&#8203;_nv · w₁) + (D&#8203;_ep · w₂) + (X&#8203;_ec · w₃) ] / W&#8203;_total
            </code>
          </div>
          <div className="grid grid-cols-1 gap-3 text-xs text-white/35 sm:grid-cols-3">
            <div><span className="font-mono text-white/55">E_nv</span> — Environment build (0 or 1), w₁ = 0.30</div>
            <div><span className="font-mono text-white/55">D_ep</span> — Dependency resolution %, w₂ = 0.30</div>
            <div><span className="font-mono text-white/55">X_ec</span> — Execution completion (0–1), w₃ = 0.30</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
