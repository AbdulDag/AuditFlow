"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";

const LOG_SEQUENCES: string[][] = [
  [
    "\x1b[34m[INFO]\x1b[0m Fetching paper from arXiv API...",
    "\x1b[34m[INFO]\x1b[0m PDF download: 4.2 MB",
    "\x1b[34m[INFO]\x1b[0m Initializing Layout-Aware OCR engine (v2.3.1)",
    "\x1b[32m[PASS]\x1b[0m Detected 2-column layout (confidence: 0.97)",
    "\x1b[34m[INFO]\x1b[0m Parsing figures: 8 found",
    "\x1b[34m[INFO]\x1b[0m Parsing code blocks: 12 found across 847 lines",
    "\x1b[32m[PASS]\x1b[0m PDF extraction complete",
  ],
  [
    "\x1b[34m[INFO]\x1b[0m Running dependency parser...",
    "\x1b[34m[INFO]\x1b[0m Detected: Python 3.9 · torch 1.12 · numpy 1.23",
    "\x1b[34m[INFO]\x1b[0m Querying PyPI index...",
    "\x1b[33m[WARN]\x1b[0m torch 1.12 → pinned to 1.13.1 (EOL upstream)",
    "\x1b[34m[INFO]\x1b[0m Resolved 23/25 packages",
    "\x1b[33m[WARN]\x1b[0m 2 packages require manual resolution: custom-dataset==0.1.0, labpipeline",
  ],
  [
    "\x1b[34m[INFO]\x1b[0m Generating Dockerfile...",
    "\x1b[34m[INFO]\x1b[0m Base image: python:3.9-slim",
    "\x1b[34m[INFO]\x1b[0m Building image layer 1/4: system deps",
    "\x1b[34m[INFO]\x1b[0m Building image layer 2/4: pip requirements",
    "\x1b[34m[INFO]\x1b[0m Building image layer 3/4: project source",
    "\x1b[34m[INFO]\x1b[0m Building image layer 4/4: entrypoint",
    "\x1b[32m[PASS]\x1b[0m Image built in 48.3s — 2.1 GB",
  ],
  [
    "\x1b[34m[INFO]\x1b[0m Spawning container: auditflow-exec-8f2a1c",
    "\x1b[34m[INFO]\x1b[0m Executing: python train.py --seed 42 --epochs 10",
    "Epoch 1/10 — loss: 2.4312 — acc: 0.3102",
    "Epoch 2/10 — loss: 1.8943 — acc: 0.4567",
    "Epoch 3/10 — loss: 1.5421 — acc: 0.5234",
    "Epoch 5/10 — loss: 1.1023 — acc: 0.6712",
    "Epoch 8/10 — loss: 0.8234 — acc: 0.7823",
    "Epoch 10/10 — loss: 0.7102 — acc: 0.8134",
    "\x1b[32m[PASS]\x1b[0m Execution complete — 14m 22s",
    "\x1b[34m[INFO]\x1b[0m Artifact comparison: model.pt ✓ metrics.json ✓",
  ],
  [
    "\x1b[34m[INFO]\x1b[0m Computing R-Index...",
    "  Environment fidelity:  0.91",
    "  Dependency coverage:   0.78",
    "  Execution success:     1.00",
    "  Artifact match:        0.82",
    "\x1b[32m[PASS]\x1b[0m \x1b[1mR-Index: 0.84 — HIGH REPRODUCIBILITY\x1b[0m",
    "\x1b[34m[INFO]\x1b[0m Scorecard generated at /reports/2401-12345.json",
  ],
];

function renderAnsi(text: string) {
  return text
    .replace(/\x1b\[34m/g, '<span class="text-[#60A5FA]">')
    .replace(/\x1b\[32m/g, '<span class="text-[#4ADE80]">')
    .replace(/\x1b\[33m/g, '<span class="text-[#FCD34D]">')
    .replace(/\x1b\[31m/g, '<span class="text-[#F87171]">')
    .replace(/\x1b\[1m/g, '<span class="font-bold">')
    .replace(/\x1b\[0m/g, "</span>");
}

interface Props {
  paperId: string;
  status: "idle" | "running" | "complete" | "error";
  currentStep: number;
}

export default function LiveTerminal({ paperId, status, currentStep }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevStep = useRef(-1);

  useEffect(() => {
    if (currentStep > 0 && currentStep !== prevStep.current) {
      prevStep.current = currentStep;
      const seq = LOG_SEQUENCES[currentStep - 1];
      if (!seq) return;
      seq.forEach((line, i) => {
        setTimeout(() => setLines((prev) => [...prev, line]), i * 180);
      });
    }
  }, [currentStep]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  function handleCopy() {
    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-2xl border border-[#1E1E1E] bg-[#0D0D0D] overflow-hidden">
      {/* Terminal chrome bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E1E1E] bg-[#111111]">
        <div className="flex items-center gap-3">
          {/* Traffic lights */}
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444]/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#22C55E]/50" />
          </div>
          <span className="text-xs font-mono text-[#4B5563]">
            auditflow — {paperId}
          </span>
          {status === "running" && (
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-[#F5C518]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F5C518] animate-pulse" />
              LIVE
            </span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-lg text-[#4B5563] hover:text-[#9CA3AF] hover:bg-[#1E1E1E] transition-all cursor-pointer"
          title="Copy logs"
        >
          {copied ? <Check size={13} className="text-[#22C55E]" /> : <Copy size={13} />}
        </button>
      </div>

      {/* Terminal body */}
      <div className="h-72 overflow-y-auto p-4 font-mono text-xs leading-6 space-y-0.5">
        <p className="text-[#4B5563]">AuditFlow v2.1.0 — Reproducibility Pipeline</p>
        <p className="text-[#2A2A2A] mb-2">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</p>

        {lines.map((line, i) => (
          <p
            key={i}
            className="text-[#9CA3AF]"
            dangerouslySetInnerHTML={{ __html: renderAnsi(line) }}
          />
        ))}

        {status === "running" && (
          <p className="flex gap-1 text-[#9CA3AF]">
            <span className="text-[#4B5563]">$</span>
            <span className="text-[#F5C518] animate-pulse">▋</span>
          </p>
        )}

        {status === "complete" && (
          <p className="text-[#4ADE80] font-semibold mt-2">
            ✓ Audit complete — View scorecard →
          </p>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
