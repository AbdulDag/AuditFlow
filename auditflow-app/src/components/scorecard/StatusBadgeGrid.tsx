import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Container,
  Package,
  PlayCircle,
  FileCheck,
} from "lucide-react";
import type { DockerExecutionResult } from "@/types";

type Status = "PASS" | "WARN" | "FAIL";

const STATUS_CONFIG: Record<
  Status,
  { label: string; icon: React.ElementType; color: string; bg: string; border: string }
> = {
  PASS: {
    label: "Pass",
    icon: CheckCircle2,
    color: "#34d399",
    bg: "rgba(52,211,153,0.08)",
    border: "rgba(52,211,153,0.25)",
  },
  WARN: {
    label: "Warning",
    icon: AlertTriangle,
    color: "#fbbf24",
    bg: "rgba(251,191,36,0.08)",
    border: "rgba(251,191,36,0.25)",
  },
  FAIL: {
    label: "Fail",
    icon: XCircle,
    color: "#f87171",
    bg: "rgba(248,113,113,0.08)",
    border: "rgba(248,113,113,0.25)",
  },
};

function triageBuild(execution: DockerExecutionResult): Status {
  if (execution.build_success) return "PASS";
  return "FAIL";
}

function triageExec(execution: DockerExecutionResult): Status {
  if (!execution.build_success) return "FAIL";
  if (execution.exit_code === 0 && execution.executed_real_script) return "PASS";
  if (execution.exit_code === 0 && !execution.executed_real_script) return "WARN";
  return "FAIL";
}

interface Props {
  execution: DockerExecutionResult;
}

export default function StatusBadgeGrid({ execution }: Props) {
  const build = triageBuild(execution);
  const exec = triageExec(execution);
  const depStatus: Status =
    execution.build_success && execution.exit_code === 0 ? "PASS" : "WARN";

  const METRICS: {
    id: string;
    label: string;
    description: string;
    status: Status;
    detail: string;
    icon: React.ElementType;
  }[] = [
    {
      id: "env",
      label: "Environment",
      description: "Docker image build",
      status: build,
      detail: execution.build_success
        ? "Image built — see logs for timing and layers."
        : "Build did not complete successfully.",
      icon: Container,
    },
    {
      id: "dep",
      label: "Dependencies",
      description: "Packages inferred from paper",
      status: depStatus,
      detail:
        "Declared in scorecard metadata — resolution happens inside the container build step.",
      icon: Package,
    },
    {
      id: "exec",
      label: "Execution",
      description: "Entry point exit code",
      status: exec,
      detail: `exit ${execution.exit_code} · real .py script: ${execution.executed_real_script ? "yes" : "no"}`,
      icon: PlayCircle,
    },
    {
      id: "agent",
      label: "Diagnostic agent",
      description: "Autonomous repair loop",
      status:
        (execution.reasoning_log?.length ?? 0) > 0
          ? execution.exit_code === 0
            ? "PASS"
            : "WARN"
          : "PASS",
      detail: execution.terminal_signal
        ? `Signal: ${execution.terminal_signal}`
        : "No agent trace (happy path or agent disabled).",
      icon: FileCheck,
    },
  ];

  return (
    <div className="h-full rounded-2xl border border-white/[0.08] bg-[#111] p-6">
      <h3 className="mb-6 text-sm font-semibold text-white">Sandbox assessment</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {METRICS.map(
          ({ id, label, description, status, detail, icon: Icon }) => {
            const s = STATUS_CONFIG[status];
            const StatusIcon = s.icon;
            return (
              <div
                key={id}
                className="rounded-xl border p-4"
                style={{ background: s.bg, borderColor: s.border }}
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Icon size={15} className="text-white/45" />
                    <span className="text-sm font-semibold text-white">{label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusIcon size={14} style={{ color: s.color }} />
                    <span
                      className="text-xs font-semibold"
                      style={{ color: s.color }}
                    >
                      {s.label}
                    </span>
                  </div>
                </div>
                <p className="mb-2 text-xs text-white/45">{description}</p>
                <p
                  className="break-words font-mono text-xs leading-relaxed"
                  style={{ color: s.color }}
                >
                  {detail}
                </p>
              </div>
            );
          }
        )}
      </div>
    </div>
  );
}
