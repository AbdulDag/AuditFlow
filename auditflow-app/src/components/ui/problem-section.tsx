"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const problems = [
  {
    stat: "73%",
    title: "Dependency Hell",
    desc: "ML papers require pinned CUDA, cuDNN, and driver versions that are almost never documented. The environment is the first thing that breaks.",
  },
  {
    stat: "89%",
    title: "The Wrapper Stigma",
    desc: "Existing AI research tools are chat interfaces that generate summaries — none actually attempt to run the code or verify a single line executes.",
  },
  {
    stat: "6h+",
    title: "Verification Latency",
    desc: "Average time a researcher spends setting up an environment just to discover the GitHub repo has broken imports or missing files.",
  },
  {
    stat: "62%",
    title: "Claimed vs. Reality",
    desc: "Fraction of ML papers whose reported accuracy metrics cannot be reproduced even with the author's own code on modern hardware.",
  },
];

export const ProblemSection = () => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="problem" className="w-full py-28 px-5 sm:px-8 md:px-16">
      <div ref={ref} className="mx-auto max-w-6xl">

        <div className="mb-20 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="text-4xl font-semibold tracking-tight text-white sm:text-5xl md:text-6xl"
          >
            The reproducibility
            <br />crisis is not a myth.
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-xs text-sm text-white/40 lg:text-right lg:pb-2"
          >
            Modern ML research moves fast. Peer review doesn&apos;t verify code.
            Authors move on. Repos rot.
          </motion.p>
        </div>

        {/* Editorial list — no cards, just hairlines */}
        <div className="divide-y divide-white/[0.07]">
          {problems.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 16 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: i * 0.1 + 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="group grid grid-cols-12 items-start gap-4 py-8 transition-colors hover:bg-white/[0.02]"
            >
              {/* Big number */}
              <div className="col-span-3 sm:col-span-2">
                <span className="font-mono text-4xl font-bold tracking-tight text-white sm:text-5xl">
                  {p.stat}
                </span>
              </div>

              {/* Index */}
              <div className="col-span-1 flex items-start pt-1.5">
                <span className="font-mono text-[10px] text-white/25 tabular-nums">
                  0{i + 1}
                </span>
              </div>

              {/* Title + desc */}
              <div className="col-span-8 sm:col-span-9">
                <h3 className="mb-2 text-base font-semibold text-white sm:text-lg">{p.title}</h3>
                <p className="text-sm leading-relaxed text-white/40">{p.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
