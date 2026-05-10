"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";

type DepRow = {
  name: string;
  requested: string;
  resolved: string;
  source: string;
  status: "resolved" | "warning";
  note: string;
};

function toRows(packages: string[]): DepRow[] {
  return packages.map((name) => ({
    name,
    requested: "—",
    resolved: "pip install",
    source: "PyPI",
    status: "resolved" as const,
    note: "Inferred from paper / LLM extraction",
  }));
}

const STATUS_MAP = {
  resolved: { icon: CheckCircle2, label: "Listed", color: "#34d399" },
  warning: { icon: AlertTriangle, label: "Review", color: "#fbbf24" },
} as const;

const FILTERS = ["All", "Listed", "Review"] as const;

interface Props {
  dependencies: string[];
}

export default function DependencyTable({ dependencies }: Props) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const rows =
    dependencies.length > 0
      ? toRows(dependencies)
      : [
          {
            name: "—",
            requested: "—",
            resolved: "—",
            source: "—",
            status: "warning" as const,
            note: "No Python packages were extracted from this PDF.",
          },
        ];

  const filtered = rows.filter((d) => {
    if (filter === "All") return true;
    if (filter === "Listed") return d.status === "resolved";
    return d.status === "warning";
  });

  const counts = {
    resolved: rows.filter((d) => d.status === "resolved").length,
    warning: rows.filter((d) => d.status === "warning").length,
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111]">
      <div className="border-b border-white/[0.08] px-6 py-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-base font-semibold text-white">
              Dependencies (extracted)
            </h3>
            <div className="mt-1 flex items-center gap-4">
              <span className="text-xs text-emerald-400/90">
                {counts.resolved} packages
              </span>
              {counts.warning > 0 && (
                <span className="text-xs text-amber-400/90">
                  {counts.warning} note(s)
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-1 rounded-lg border border-white/[0.08] bg-black/40 p-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-all duration-200 ${
                  filter === f
                    ? "bg-white/10 text-white"
                    : "text-white/40 hover:text-white/70"
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
            <tr className="border-b border-white/[0.08]">
              <th className="px-6 py-3 text-left font-semibold uppercase tracking-wider text-white/40">
                Package
              </th>
              <th className="px-6 py-3 text-left font-semibold uppercase tracking-wider text-white/40">
                Requested
              </th>
              <th className="px-6 py-3 text-left font-semibold uppercase tracking-wider text-white/40">
                Plan
              </th>
              <th className="px-6 py-3 text-left font-semibold uppercase tracking-wider text-white/40">
                Source
              </th>
              <th className="px-6 py-3 text-left font-semibold uppercase tracking-wider text-white/40">
                Status
              </th>
              <th className="px-6 py-3 text-left font-semibold uppercase tracking-wider text-white/40">
                Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((dep, i) => {
              const s = STATUS_MAP[dep.status];
              const StatusIcon = s.icon;
              return (
                <tr
                  key={`${dep.name}-${i}`}
                  className={`border-b border-white/[0.05] transition-colors hover:bg-white/[0.03] ${
                    i === filtered.length - 1 ? "border-b-0" : ""
                  }`}
                >
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-semibold text-white">
                        {dep.name}
                      </span>
                      {dep.name !== "—" && (
                        <a
                          href={`https://pypi.org/project/${encodeURIComponent(dep.name)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="cursor-pointer text-white/35 hover:text-white/70"
                        >
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3 font-mono text-white/40">{dep.requested}</td>
                  <td className="px-6 py-3 font-mono text-emerald-400/90">{dep.resolved}</td>
                  <td className="px-6 py-3 text-white/40">{dep.source}</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-1.5">
                      <StatusIcon size={13} style={{ color: s.color }} />
                      <span className="font-medium" style={{ color: s.color }}>
                        {s.label}
                      </span>
                    </div>
                  </td>
                  <td className="max-w-xs px-6 py-3 text-white/45">{dep.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
