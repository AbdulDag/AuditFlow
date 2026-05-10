"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, ExternalLink } from "lucide-react";

type DepStatus = "resolved" | "warning" | "failed";

const DEPS = [
  { name: "torch", requested: "1.12.0", resolved: "1.13.1", source: "PyPI", status: "warning" as DepStatus, note: "Version pinned to 1.13.1 (1.12.0 EOL)" },
  { name: "numpy", requested: "1.23.0", resolved: "1.23.0", source: "PyPI", status: "resolved" as DepStatus, note: "" },
  { name: "transformers", requested: "4.25.0", resolved: "4.25.0", source: "PyPI", status: "resolved" as DepStatus, note: "" },
  { name: "Pillow", requested: "9.3.0", resolved: "9.3.0", source: "PyPI", status: "resolved" as DepStatus, note: "" },
  { name: "ftfy", requested: "6.1.1", resolved: "6.1.1", source: "PyPI", status: "resolved" as DepStatus, note: "" },
  { name: "regex", requested: "2022.10.31", resolved: "2022.10.31", source: "PyPI", status: "resolved" as DepStatus, note: "" },
  { name: "tqdm", requested: "4.64.0", resolved: "4.64.0", source: "PyPI", status: "resolved" as DepStatus, note: "" },
  { name: "custom-dataset", requested: "0.1.0", resolved: "—", source: "—", status: "failed" as DepStatus, note: "Not found in PyPI, Conda, or GitHub" },
  { name: "labpipeline", requested: "latest", resolved: "—", source: "—", status: "failed" as DepStatus, note: "Private/internal package — cannot resolve" },
  { name: "scikit-learn", requested: "1.1.3", resolved: "1.1.3", source: "PyPI", status: "resolved" as DepStatus, note: "" },
  { name: "matplotlib", requested: "3.6.2", resolved: "3.6.2", source: "PyPI", status: "resolved" as DepStatus, note: "" },
  { name: "wandb", requested: "0.13.0", resolved: "0.13.0", source: "PyPI", status: "resolved" as DepStatus, note: "" },
];

const STATUS_MAP: Record<DepStatus, { icon: React.ElementType, label: string, color: string }> = {
  resolved: { icon: CheckCircle2, label: "Resolved", color: "#22C55E" },
  warning: { icon: AlertTriangle, label: "Warning", color: "#F59E0B" },
  failed: { icon: XCircle, label: "Failed", color: "#EF4444" },
};

const FILTERS = ["All", "Resolved", "Warning", "Failed"] as const;

export default function DependencyTable() {
  const [filter, setFilter] = useState<typeof FILTERS[number]>("All");

  const filtered = DEPS.filter(d => {
    if (filter === "All") return true;
    return d.status === filter.toLowerCase();
  });

  const counts = {
    resolved: DEPS.filter(d => d.status === "resolved").length,
    warning: DEPS.filter(d => d.status === "warning").length,
    failed: DEPS.filter(d => d.status === "failed").length,
  };

  return (
    <div className="rounded-2xl border border-[#1E293B] bg-[#0F172A] overflow-hidden">
      <div className="px-6 py-5 border-b border-[#1E293B]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-[#F8FAFC]">Dependency Breakdown</h3>
            <div className="flex items-center gap-4 mt-1">
              <span className="text-xs text-[#22C55E]">{counts.resolved} resolved</span>
              <span className="text-xs text-[#F59E0B]">{counts.warning} warnings</span>
              <span className="text-xs text-[#EF4444]">{counts.failed} failed</span>
            </div>
          </div>

          {/* Filter pills */}
          <div className="flex gap-1 p-1 rounded-lg bg-[#020617] border border-[#1E293B]">
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-200 cursor-pointer ${
                  filter === f ? "bg-[#1E293B] text-[#F8FAFC]" : "text-[#64748B] hover:text-[#94A3B8]"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#1E293B]">
              <th className="text-left px-6 py-3 font-semibold text-[#64748B] uppercase tracking-wider">Package</th>
              <th className="text-left px-6 py-3 font-semibold text-[#64748B] uppercase tracking-wider">Requested</th>
              <th className="text-left px-6 py-3 font-semibold text-[#64748B] uppercase tracking-wider">Resolved</th>
              <th className="text-left px-6 py-3 font-semibold text-[#64748B] uppercase tracking-wider">Source</th>
              <th className="text-left px-6 py-3 font-semibold text-[#64748B] uppercase tracking-wider">Status</th>
              <th className="text-left px-6 py-3 font-semibold text-[#64748B] uppercase tracking-wider">Notes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((dep, i) => {
              const s = STATUS_MAP[dep.status];
              const StatusIcon = s.icon;
              return (
                <tr
                  key={dep.name}
                  className={`border-b border-[#1E293B]/50 hover:bg-[#1E293B]/30 transition-colors ${
                    i === filtered.length - 1 ? "border-b-0" : ""
                  }`}
                >
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-semibold text-[#F8FAFC]">{dep.name}</span>
                      {dep.status === "resolved" && (
                        <a href={`https://pypi.org/project/${dep.name}`} target="_blank" rel="noopener noreferrer" className="text-[#64748B] hover:text-[#3B82F6] cursor-pointer">
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3 font-mono text-[#64748B]">{dep.requested}</td>
                  <td className="px-6 py-3 font-mono" style={{ color: dep.resolved === "—" ? "#EF4444" : dep.resolved !== dep.requested ? "#F59E0B" : "#22C55E" }}>
                    {dep.resolved}
                  </td>
                  <td className="px-6 py-3 text-[#64748B]">{dep.source}</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-1.5">
                      <StatusIcon size={13} style={{ color: s.color }} />
                      <span className="font-medium" style={{ color: s.color }}>{s.label}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-[#64748B] max-w-xs">
                    {dep.note ? <span className="text-[#F59E0B]/80">{dep.note}</span> : <span className="text-[#334155]">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
