"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import JobSubmission from "@/components/dashboard/JobSubmission";
import PipelineStepper from "@/components/dashboard/PipelineStepper";
import LiveTerminal from "@/components/dashboard/LiveTerminal";
import AuditHistoryTable from "@/components/dashboard/AuditHistoryTable";
import { useAuditStore } from "@/context/AuditContext";
import {
  runAuditWithArxiv,
  runAuditWithPdf,
  AuditClientError,
} from "@/lib/audit-client";
import { FileText, Clock, TrendingUp, Cpu, ArrowUpRight } from "lucide-react";
import type { AuditEntry, JobSubmitPayload, AuditResponse } from "@/types";

const FEATURE_CARDS = [
  {
    title: "Azure Document Intelligence",
    description:
      "Layout-aware OCR to Markdown — recover GitHub URLs and code blocks from the PDF.",
    tag: "OCR",
  },
  {
    title: "GPT-4o extraction",
    description:
      "Structured metadata: repo URL, PyPI dependencies, and the script to execute.",
    tag: "LLM",
  },
  {
    title: "Docker + diagnostic agent",
    description:
      "Isolated builds, live logs, and autonomous repair when the sandbox fails.",
    tag: "Runtime",
  },
];

type PipelineStatus = "idle" | "running" | "complete" | "error";

function scoreStatus(index: number): AuditEntry["status"] {
  if (index >= 75) return "PASS";
  if (index >= 45) return "WARN";
  return "FAIL";
}

function displayNameFromPayload(p: JobSubmitPayload): string {
  if (p.mode === "pdf") return p.file.name;
  return p.arxivId;
}

export default function DashboardPageClient() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const prefillArxiv = searchParams.get("arxiv") ?? "";

  const { saveAudit, getAudits } = useAuditStore();

  const [pipelineStatus, setPipelineStatus] =
    useState<PipelineStatus>("idle");
  const [currentStep, setCurrentStep] = useState(0);
  const [submittedLabel, setSubmittedLabel] = useState<string | null>(null);
  const [auditHistory, setAuditHistory] = useState<AuditEntry[]>([]);
  const [terminalLogs, setTerminalLogs] = useState("");
  const [lastScorecardId, setLastScorecardId] = useState<string | null>(null);

  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearStepTimer = useCallback(() => {
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    setAuditHistory(getAudits());
  }, [getAudits]);

  useEffect(() => () => clearStepTimer(), [clearStepTimer]);

  const totalAudits = auditHistory.length;
  const avgRIndex =
    totalAudits > 0
      ? (
          auditHistory.reduce((s, a) => s + a.rindex, 0) / totalAudits
        ).toFixed(2)
      : "—";
  const hoursSaved = totalAudits > 0 ? `${(totalAudits * 4.5).toFixed(0)}h` : "—";

  const STATS = [
    { label: "Total audits", value: String(totalAudits), icon: FileText },
    { label: "Avg R-Index", value: String(avgRIndex), icon: TrendingUp },
    { label: "Hours saved (est.)", value: hoursSaved, icon: Clock },
    { label: "Docker runs", value: String(totalAudits), icon: Cpu },
  ];

  async function handleSubmit(payload: JobSubmitPayload) {
    setSubmittedLabel(displayNameFromPayload(payload));
    setPipelineStatus("running");
    setCurrentStep(1);
    setTerminalLogs("Connecting to audit pipeline…\n");
    setLastScorecardId(null);
    clearStepTimer();
    stepTimerRef.current = setInterval(() => {
      setCurrentStep((s) => Math.min(s + 1, 4));
    }, 14000);

    let response: AuditResponse;
    try {
      if (payload.mode === "pdf") {
        setTerminalLogs((prev) => prev + `Uploading ${payload.file.name}…\n`);
        response = await runAuditWithPdf(payload.file);
      } else {
        setTerminalLogs(
          (prev) => prev + `Fetching arXiv PDF for ${payload.arxivId}…\n`
        );
        response = await runAuditWithArxiv(payload.arxivId);
      }
    } catch (err) {
      clearStepTimer();
      const msg =
        err instanceof AuditClientError
          ? err.detail || err.message
          : err instanceof Error
            ? err.message
            : "Unknown error";
      setTerminalLogs((prev) => prev + `\n[error] ${msg}\n`);
      setPipelineStatus("error");
      setCurrentStep(0);
      return;
    }

    clearStepTimer();
    const exec = response.scorecard.execution;
    setTerminalLogs(exec.logs || "(no logs returned)");
    setCurrentStep(5);
    setPipelineStatus("complete");

    const idx = response.scorecard.reproducibility_index;
    const id = `af-${Date.now()}`;
    const meta = response.scorecard.metadata;
    const paperLabel =
      payload.mode === "arxiv"
        ? `arXiv:${payload.arxivId.replace(/^arxiv:/i, "").trim()}`
        : payload.file.name;

    const entry: AuditEntry = {
      id,
      paper: paperLabel,
      date: new Date().toISOString().split("T")[0],
      rindex: idx / 100,
      status: scoreStatus(idx),
      githubUrl: meta.github_url || "",
      response,
    };
    saveAudit(entry);
    setLastScorecardId(id);
    setAuditHistory((prev) => [entry, ...prev]);
  }

  const firstName = user?.firstName ?? user?.username ?? "there";

  return (
    <div className="min-h-screen bg-black">
      <div className="border-b border-white/[0.08] px-6 pt-8 pb-7 md:px-8">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
          Dashboard
        </p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Hey, {firstName}
            </h1>
            <p className="mt-1.5 text-sm text-white/45">
              Run papers against the FastAPI audit service — results stay in
              your account history.
            </p>
          </div>
          <span className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-xs text-white/35">
            {new Date().toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
      </div>

      <div className="space-y-8 px-6 py-8 md:px-8">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.08] xl:grid-cols-4">
          {STATS.map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="flex flex-col gap-1.5 bg-black px-6 py-5"
            >
              <Icon size={15} className="mb-1 text-white/50" />
              <p className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
                {value}
              </p>
              <p className="text-xs text-white/40">{label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {FEATURE_CARDS.map(({ title, description, tag }) => (
            <div
              key={title}
              className="group flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-[#111] p-5 transition-colors hover:border-white/[0.12]"
            >
              <div className="flex items-start justify-between">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/55">
                  {tag}
                </span>
                <div className="flex h-8 w-8 flex-shrink-0 cursor-default items-center justify-center rounded-full bg-white text-black transition-transform group-hover:scale-105">
                  <ArrowUpRight size={14} />
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-white/45">
                  {description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <JobSubmission
          onSubmit={handleSubmit}
          isRunning={pipelineStatus === "running"}
          defaultArxivId={prefillArxiv}
        />

        {pipelineStatus !== "idle" && (
          <div className="space-y-6">
            <PipelineStepper
              currentStep={currentStep}
              status={pipelineStatus}
              paperId={submittedLabel ?? ""}
            />
            <LiveTerminal
              title={submittedLabel ?? "—"}
              logs={terminalLogs}
              status={pipelineStatus}
              scorecardHref={
                lastScorecardId ? `/scorecard?id=${lastScorecardId}` : undefined
              }
            />
          </div>
        )}

        <AuditHistoryTable audits={auditHistory} />
      </div>
    </div>
  );
}
