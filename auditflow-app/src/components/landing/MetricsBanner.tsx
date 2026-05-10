"use client";

import { useEffect, useRef, useState } from "react";

const METRICS = [
  { value: 14800, label: "Papers Audited", suffix: "+", prefix: "" },
  { value: 98400, label: "Compute Hours Saved", suffix: "h+", prefix: "" },
  { value: 3200, label: "Docker Builds Run", suffix: "+", prefix: "" },
];

function AnimatedCount({
  target, suffix = "", prefix = "", decimal = false,
}: {
  target: number; suffix?: string; prefix?: string; decimal?: boolean;
}) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const steps = 60;
        const increment = target / steps;
        let current = 0;
        const timer = setInterval(() => {
          current = Math.min(current + increment, target);
          setCount(current);
          if (current >= target) clearInterval(timer);
        }, 1800 / steps);
      }
    }, { threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);

  const num = decimal ? count.toFixed(2) : Math.round(count).toLocaleString();
  return <span ref={ref}>{prefix}{num}</span>;
}

export default function MetricsBanner() {
  return (
    <section id="metrics" className="border-y border-[#1E1E1E] bg-[#0D0D0D]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3">
          {METRICS.map(({ value, label, suffix, prefix }, i) => (
            <div
              key={label}
              className={`flex flex-col gap-1 py-10 px-8 ${
                i < METRICS.length - 1 ? "md:border-r border-b md:border-b-0 border-[#1E1E1E]" : ""
              }`}
            >
              <p className="text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-none">
                <AnimatedCount target={value} prefix={prefix} />
                <span className="text-[#F5C518]">{suffix}</span>
              </p>
              <p className="text-sm text-[#6B7280] font-medium mt-1">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
