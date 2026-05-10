"use client";

import { motion, animate, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";

type StatConfig = {
  target: number;
  suffix: string;
  decimals: number;
  label: string;
  note: string;
};

const stats: StatConfig[] = [
  {
    target: 0,
    suffix: "%",
    decimals: 0,
    label: "Hallucination Rate",
    note: "GitHub links recovered via layout-aware OCR",
  },
  {
    target: 4,
    suffix: " min",
    decimals: 0,
    label: "Average Audit Time",
    note: "From PDF to scorecard",
  },
  {
    target: 62,
    suffix: "%",
    decimals: 0,
    label: "Papers That Fail",
    note: "Top-cited ML repos crash on first execution",
  },
  {
    target: 4,
    suffix: "",
    decimals: 0,
    label: "Pipeline Stages",
    note: "Env → Dependency → Execution → Artifact",
  },
];

function AnimatedValue({
  target,
  suffix,
  decimals,
  isActive,
  delay = 0,
}: {
  target: number;
  suffix: string;
  decimals: number;
  isActive: boolean;
  delay?: number;
}) {
  const [display, setDisplay] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (!isActive || started.current) return;
    started.current = true;
    const controls = animate(0, target, {
      duration: 1.25,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        setDisplay(decimals > 0 ? Number(v.toFixed(decimals)) : Math.round(v));
      },
    });
    return () => controls.stop();
  }, [isActive, target, decimals, delay]);

  const text = decimals > 0 ? display.toFixed(decimals) : String(display);

  return (
    <motion.span
      className="inline-block font-mono text-3xl font-bold tracking-tight tabular-nums text-white sm:text-4xl"
      initial={{ scale: 0.82, opacity: 0 }}
      animate={isActive ? { scale: 1, opacity: 1 } : {}}
      transition={{
        duration: 0.45,
        delay: delay + 0.05,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {text}
      {suffix}
    </motion.span>
  );
}

export const MetricsSection = () => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="w-full border-y border-white/[0.07] py-16 px-5 sm:px-8 md:px-16">
      <div ref={ref} className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 divide-x divide-y divide-white/[0.07] lg:grid-cols-4 lg:divide-y-0">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : {}}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className="px-6 py-8 first:pl-0 lg:first:pl-0"
            >
              <div className="mb-1.5">
                <AnimatedValue
                  target={s.target}
                  suffix={s.suffix}
                  decimals={s.decimals}
                  isActive={isInView}
                  delay={i * 0.08}
                />
              </div>
              <div className="mb-1 text-sm font-medium text-white/70">{s.label}</div>
              <div className="text-[11px] leading-snug text-white/30">{s.note}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
