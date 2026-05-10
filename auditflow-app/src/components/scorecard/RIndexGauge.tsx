"use client";

import { useEffect, useState } from "react";

interface Props {
  /** Backend reproducibility_index (0–100). */
  reproducibilityIndex: number;
}

export default function RIndexGauge({ reproducibilityIndex }: Props) {
  const norm = Math.min(100, Math.max(0, reproducibilityIndex)) / 100;
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(norm), 300);
    return () => clearTimeout(timer);
  }, [norm]);

  const r = 72;
  const cx = 90;
  const cy = 90;
  const circumference = Math.PI * r;
  const offset = circumference * (1 - animated);
  const percentLabel = reproducibilityIndex.toFixed(1);

  const color =
    reproducibilityIndex >= 80
      ? "#34d399"
      : reproducibilityIndex >= 45
        ? "#fbbf24"
        : "#f87171";
  const label =
    reproducibilityIndex >= 80
      ? "HIGH"
      : reproducibilityIndex >= 45
        ? "MODERATE"
        : "LOW";

  const buildPct = reproducibilityIndex >= 40 ? 100 : (reproducibilityIndex / 40) * 100;
  const execOk =
    reproducibilityIndex >= 100
      ? 100
      : reproducibilityIndex >= 60
        ? 100
        : reproducibilityIndex >= 40
          ? 50
          : 0;

  return (
    <div className="flex flex-col items-center rounded-2xl border border-white/[0.08] bg-[#111] p-6">
      <h3 className="mb-6 self-start text-sm font-semibold text-white">
        Reproducibility index
      </h3>

      <div className="relative">
        <svg width={180} height={105} viewBox="0 0 180 105">
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={12}
            strokeLinecap="round"
          />
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke={color}
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition:
                "stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.3s",
            }}
          />
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const angle = Math.PI * t;
            const tx = cx - r * Math.cos(angle);
            const ty = cy - r * Math.sin(angle);
            return <circle key={t} cx={tx} cy={ty} r={2} fill="rgba(255,255,255,0.2)" />;
          })}
        </svg>

        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 pb-2 text-center">
          <p
            className="text-4xl font-bold tracking-tight"
            style={{ color }}
          >
            {percentLabel}
          </p>
          <p
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color }}
          >
            {label}
          </p>
          <p className="mt-1 font-mono text-[10px] text-white/30">of 100</p>
        </div>
      </div>

      <div className="mt-4 flex w-full items-center justify-between px-2">
        <span className="text-[10px] text-white/35">0</span>
        <span className="text-[10px] text-white/35">50</span>
        <span className="text-[10px] text-white/35">100</span>
      </div>

      <div className="mt-5 w-full space-y-2 border-t border-white/[0.08] pt-4">
        {[
          { label: "Docker build (+40 max)", val: buildPct, c: "#94a3b8" },
          { label: "Runtime (+60 max)", val: execOk, c: color },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            <span className="w-40 flex-shrink-0 text-xs text-white/40">
              {row.label}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full"
                style={{ width: `${row.val}%`, background: row.c }}
              />
            </div>
            <span
              className="w-10 text-right text-xs font-medium"
              style={{ color: row.c }}
            >
              {row.val.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
