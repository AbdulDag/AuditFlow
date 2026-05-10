"use client";

import RIndexGauge from "@/components/scorecard/RIndexGauge";
import StatusBadgeGrid from "@/components/scorecard/StatusBadgeGrid";
import DependencyTable from "@/components/scorecard/DependencyTable";
import { useAuditStore } from "@/context/AuditContext";
import { ExternalLink, ArrowLeft, Calendar, FlaskConical } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function JustificationBlock({ markdown }: { markdown: string }) {
  const parts = markdown.split(/^\s*###\s+/m).filter(Boolean);
  if (parts.length <= 1) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-[#111] p-6">
        <h3 className="mb-3 text-sm font-semibold text-white">Why this score?</h3>
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-white/55">
          {markdown}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#111] p-6">
      <h3 className="text-sm font-semibold text-white">Why this score?</h3>
      <div className="space-y-5">
        {parts.map((chunk, i) => {
          const lines = chunk.trim().split("\n");
          const heading = lines[0]?.trim() || `Section ${i + 1}`;
          const body = lines.slice(1).join("\n").trim();
          return (
            <div key={i}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/45">
                {heading}
              </h4>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/55">
                {body}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function tierLabel(index: number): string {
  if (index >= 75) return "HIGH REPRODUCIBILITY";
  if (index >= 45) return "PARTIAL REPRODUCIBILITY";
  return "LOW REPRODUCIBILITY";
}

export default function ScorecardPageClient() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const { getAuditById } = useAuditStore();
  const entry = id ? getAuditById(id) : null;
  const response = entry?.response;

  if (!id) {
    return (
      <div className="p-8 text-white/55">
        <p className="mb-4">No audit selected.</p>
        <Link href="/dashboard" className="text-white underline-offset-4 hover:underline">
          Go to dashboard
        </Link>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="p-8 text-white/55">
        <p className="mb-4">
          Scorecard not found for this id — it may be from an older session. Run a new
          audit from the dashboard.
        </p>
        <Link href="/dashboard" className="text-white underline-offset-4 hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const { scorecard } = response;
  const meta = scorecard.metadata;
  const exec = scorecard.execution;
  const idx = scorecard.reproducibility_index;

  return (
    <div className="space-y-8 p-6 lg:p-8">
      <div className="flex flex-col gap-4">
        <Link
          href="/dashboard"
          className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-xs text-white/45 transition-colors hover:text-white/70"
        >
          <ArrowLeft size={13} />
          Back to dashboard
        </Link>

        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/[0.04]">
                <FlaskConical size={12} className="text-white/60" />
              </div>
              <span className="font-mono text-xs text-white/35">REPORT {id}</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {entry?.paper ?? "Audit result"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              {meta.github_url ? (
                <a
                  href={meta.github_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex cursor-pointer items-center gap-1 text-xs text-white/60 hover:text-white"
                >
                  Repository <ExternalLink size={10} />
                </a>
              ) : (
                <span className="text-xs text-amber-400/90">No GitHub URL extracted</span>
              )}
              <span className="flex items-center gap-1 text-xs text-white/35">
                <Calendar size={11} />
                Audited {entry?.date ?? "—"}
              </span>
              <span className="font-mono text-xs text-white/35">
                Entry · {meta.entry_point}
              </span>
            </div>
          </div>

          <span className="self-start whitespace-nowrap rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/80">
            {tierLabel(idx)}
          </span>
        </div>
      </div>

      {response.error && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90">
          {response.error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <RIndexGauge reproducibilityIndex={idx} />
        <div className="lg:col-span-2">
          <StatusBadgeGrid execution={exec} />
        </div>
      </div>

      <DependencyTable dependencies={meta.dependencies} />

      <JustificationBlock
        markdown={
          response.justification ||
          `### Score Summary\nThis audit returned a reproducibility index of **${idx}/100** (${tierLabel(idx)}).\n\n` +
          `### Execution Result\n` +
          `Build: ${exec.build_success ? "✓ succeeded" : "✗ failed"} · ` +
          `Exit code: ${exec.exit_code} · ` +
          `Real script executed: ${exec.executed_real_script ? "yes" : "no"}.\n\n` +
          `### Logs\n${exec.logs || "(no logs returned)"}`
        }
      />

      <details className="group rounded-2xl border border-white/[0.08] bg-[#0a0a0a] p-4">
        <summary className="cursor-pointer text-sm font-medium text-white/70">
          {exec.reasoning_log.length > 0
            ? `Diagnostic trace (${exec.reasoning_log.length} steps)`
            : "Raw execution logs"}
        </summary>
        <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-white/45">
          {exec.reasoning_log.length > 0
            ? JSON.stringify(exec.reasoning_log, null, 2)
            : exec.logs || "(no logs)"}
        </pre>
      </details>
    </div>
  );
}
