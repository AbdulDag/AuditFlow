"use client";

import { useEffect, useState } from "react";

interface Props {
  score: number; // 0–1
}

export default function RIndexGauge({ score }: Props) {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(score), 300);
    return () => clearTimeout(timer);
  }, [score]);

  // SVG arc params
  const r = 72;
  const cx = 90;
  const cy = 90;
  const circumference = Math.PI * r; // half circumference for semicircle
  const offset = circumference * (1 - animated);
  const percent = Math.round(animated * 100);

  const color = score >= 0.8 ? "#22C55E" : score >= 0.6 ? "#F59E0B" : "#EF4444";
  const label = score >= 0.8 ? "HIGH" : score >= 0.6 ? "MODERATE" : "LOW";

  return (
    <div className="rounded-2xl border border-[#1E293B] bg-[#0F172A] p-6 flex flex-col items-center">
      <h3 className="text-sm font-semibold text-[#F8FAFC] self-start mb-6">Reproducibility Index</h3>

      {/* Gauge SVG */}
      <div className="relative">
        <svg width={180} height={105} viewBox="0 0 180 105">
          {/* Background track */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="#1E293B"
            strokeWidth={12}
            strokeLinecap="round"
          />
          {/* Colored arc */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke={color}
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.3s" }}
          />
          {/* Tick marks */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const angle = Math.PI * t;
            const tx = cx - r * Math.cos(angle);
            const ty = cy - r * Math.sin(angle);
            return <circle key={t} cx={tx} cy={ty} r={2} fill="#334155" />;
          })}
        </svg>

        {/* Center text */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center pb-2">
          <p className="text-4xl font-bold tracking-tight" style={{ color }}>
            {(animated * 1).toFixed(2)}
          </p>
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color }}>
            {label}
          </p>
        </div>
      </div>

      {/* Score scale legend */}
      <div className="flex items-center justify-between w-full mt-4 px-2">
        <span className="text-[10px] text-[#64748B]">0.0</span>
        <span className="text-[10px] text-[#64748B]">0.5</span>
        <span className="text-[10px] text-[#64748B]">1.0</span>
      </div>

      <div className="w-full mt-5 border-t border-[#1E293B] pt-4 space-y-2">
        {[
          { label: "Environment", val: 0.91, color: "#22C55E" },
          { label: "Dependencies", val: 0.78, color: "#F59E0B" },
          { label: "Execution", val: 1.0, color: "#22C55E" },
          { label: "Artifacts", val: 0.82, color: "#22C55E" },
        ].map(({ label, val, color: c }) => (
          <div key={label} className="flex items-center gap-3">
            <span className="text-xs text-[#64748B] w-24 flex-shrink-0">{label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-[#1E293B] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${val * 100}%`, background: c }} />
            </div>
            <span className="text-xs font-medium w-8 text-right" style={{ color: c }}>{val.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
