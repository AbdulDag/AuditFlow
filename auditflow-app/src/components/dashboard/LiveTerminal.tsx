"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";
import Link from "next/link";

interface Props {
  title: string;
  logs: string;
  status: "idle" | "running" | "complete" | "error";
  scorecardHref?: string;
}

export default function LiveTerminal({
  title,
  logs,
  status,
  scorecardHref,
}: Props) {
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  function handleCopy() {
    void navigator.clipboard.writeText(logs || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const lines = (logs || "").split("\n");

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0a0a]">
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#111] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <div className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <div className="h-2.5 w-2.5 rounded-full bg-white/15" />
          </div>
          <span className="max-w-[min(60vw,420px)] truncate font-mono text-xs text-white/35">
            auditflow — {title}
          </span>
          {status === "running" && (
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-white/60">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/60" />
              LIVE
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="cursor-pointer rounded-lg p-1.5 text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/70"
          title="Copy logs"
        >
          {copied ? (
            <Check size={13} className="text-emerald-400" />
          ) : (
            <Copy size={13} />
          )}
        </button>
      </div>

      <div className="h-80 space-y-0.5 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed">
        <p className="text-white/25">AuditFlow — reproducibility pipeline logs</p>
        <p className="mb-2 text-white/15">—</p>
        {lines.map((line, i) => (
          <p key={i} className="whitespace-pre-wrap break-all text-white/55">
            {line || " "}
          </p>
        ))}
        {status === "running" && (
          <p className="flex gap-1 text-white/45">
            <span className="text-white/25">$</span>
            <span className="inline-block h-3 w-2 animate-pulse bg-white/30" />
          </p>
        )}
        {status === "complete" && scorecardHref && (
          <p className="mt-3 text-emerald-400/90">
            <Link href={scorecardHref} className="font-semibold underline-offset-4 hover:underline">
              Open scorecard →
            </Link>
          </p>
        )}
        {status === "error" && (
          <p className="mt-3 text-red-400/90">Audit finished with errors — see logs above.</p>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
