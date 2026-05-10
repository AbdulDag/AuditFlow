import { CheckCircle2, AlertTriangle, XCircle, Container, Package, PlayCircle, FileCheck } from "lucide-react";

type Status = "PASS" | "WARN" | "FAIL";

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
    description: "Python version, OS, CUDA compatibility",
    status: "PASS",
    detail: "Python 3.9 · CUDA 11.7 · Ubuntu 22.04",
    icon: Container,
  },
  {
    id: "dep",
    label: "Dependencies",
    description: "Package resolution and version pinning",
    status: "WARN",
    detail: "23/25 resolved · 2 required manual mapping",
    icon: Package,
  },
  {
    id: "exec",
    label: "Execution",
    description: "Code ran to completion without crash",
    status: "PASS",
    detail: "Completed in 14m 22s · exit code 0",
    icon: PlayCircle,
  },
  {
    id: "art",
    label: "Artifacts",
    description: "Output files match claimed results",
    status: "PASS",
    detail: "model.pt ✓ metrics.json ✓ figures/ ✓",
    icon: FileCheck,
  },
];

const STATUS_CONFIG: Record<Status, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  PASS: { label: "Pass", icon: CheckCircle2, color: "#22C55E", bg: "#22C55E10", border: "#22C55E25" },
  WARN: { label: "Warning", icon: AlertTriangle, color: "#F59E0B", bg: "#F59E0B10", border: "#F59E0B25" },
  FAIL: { label: "Fail", icon: XCircle, color: "#EF4444", bg: "#EF444410", border: "#EF444425" },
};

export default function StatusBadgeGrid() {
  return (
    <div className="rounded-2xl border border-[#1E293B] bg-[#0F172A] p-6 h-full">
      <h3 className="text-sm font-semibold text-[#F8FAFC] mb-6">Core Metric Assessment</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {METRICS.map(({ id, label, description, status, detail, icon: Icon }) => {
          const s = STATUS_CONFIG[status];
          const StatusIcon = s.icon;
          return (
            <div
              key={id}
              className="p-4 rounded-xl border"
              style={{ background: s.bg, borderColor: s.border }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon size={15} className="text-[#64748B]" />
                  <span className="text-sm font-semibold text-[#F8FAFC]">{label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <StatusIcon size={14} style={{ color: s.color }} />
                  <span className="text-xs font-semibold" style={{ color: s.color }}>{s.label}</span>
                </div>
              </div>
              <p className="text-xs text-[#64748B] mb-2">{description}</p>
              <p className="text-xs font-mono" style={{ color: s.color }}>{detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
