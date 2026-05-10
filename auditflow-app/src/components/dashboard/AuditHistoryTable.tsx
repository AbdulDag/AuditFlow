"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, ChevronUp, ChevronDown, Search, FlaskConical } from "lucide-react";
import type { AuditEntry } from "@/types";

type SortKey = "paper" | "date" | "rindex" | "status";
type SortDir = "asc" | "desc";

const STATUS_STYLES: Record<string, string> = {
  PASS: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  WARN: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  FAIL: "border-red-500/30 bg-red-500/10 text-red-400",
};

function RIndexBadge({ value }: { value: number }) {
  const color = value >= 0.75 ? "#22C55E" : value >= 0.55 ? "#F59E0B" : "#EF4444";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1 rounded-full bg-[#1E1E1E] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${value * 100}%`, background: color }}
        />
      </div>
      <span className="text-sm font-bold" style={{ color }}>{value.toFixed(2)}</span>
    </div>
  );
}

interface Props {
  audits: AuditEntry[];
}

export default function AuditHistoryTable({ audits }: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const filtered = audits
    .filter(a => a.paper.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortKey === "rindex") return (a.rindex - b.rindex) * mul;
      if (sortKey === "date") return a.date.localeCompare(b.date) * mul;
      if (sortKey === "paper") return a.paper.localeCompare(b.paper) * mul;
      return a.status.localeCompare(b.status) * mul;
    });

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k)
      return <ChevronUp size={12} className="text-white/15" />;
    return sortDir === "asc" ? (
      <ChevronUp size={12} className="text-white" />
    ) : (
      <ChevronDown size={12} className="text-white" />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111]">
      <div className="flex flex-col justify-between gap-4 border-b border-white/[0.08] px-6 py-5 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-semibold text-white">Audit history</h2>
          <p className="mt-0.5 text-xs text-white/40">
            {audits.length === 0
              ? "No audits yet"
              : `${audits.length} audit${audits.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        {audits.length > 0 && (
          <div className="relative w-full sm:w-64">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search papers..."
              className="w-full rounded-xl border border-white/[0.08] bg-black/50 py-2 pl-8 pr-4 text-xs text-white placeholder:text-white/25 outline-none focus:border-white/20 focus:ring-1 focus:ring-white/10"
            />
          </div>
        )}
      </div>

      {/* Empty state */}
      {audits.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
            <FlaskConical size={20} className="text-white/50" />
          </div>
          <p className="text-sm font-semibold text-white">No audits yet</p>
          <p className="max-w-xs text-center text-xs leading-relaxed text-white/40">
            Submit a PDF or arXiv ID above. Scorecards are saved per signed-in
            account.
          </p>
        </div>
      )}

      {/* Table */}
      {audits.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.08]">
                {(
                  [
                    ["paper", "Paper"],
                    ["date", "Date"],
                    ["rindex", "R-Index"],
                    ["status", "Status"],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => toggleSort(key)}
                    className="cursor-pointer px-6 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/35 transition-colors select-none hover:text-white/55"
                  >
                    <div className="flex items-center gap-1.5">
                      {label}
                      <SortIcon k={key} />
                    </div>
                  </th>
                ))}
                <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-white/35">
                  Report
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((audit, i) => (
                <tr
                  key={audit.id}
                  className={`border-b border-white/[0.06] transition-colors duration-150 hover:bg-white/[0.03] ${
                    i === filtered.length - 1 ? "border-b-0" : ""
                  }`}
                >
                  <td className="px-6 py-4">
                    <p className="max-w-xs text-xs font-medium leading-tight text-white">
                      {audit.paper}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 font-mono text-xs text-white/40">
                    {audit.date}
                  </td>
                  <td className="px-6 py-4"><RIndexBadge value={audit.rindex} /></td>
                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${STATUS_STYLES[audit.status]}`}
                    >
                      {audit.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={
                        audit.response ? `/scorecard?id=${audit.id}` : "/dashboard"
                      }
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-150 ${
                        audit.response
                          ? "cursor-pointer bg-white text-black hover:bg-white/90"
                          : "cursor-not-allowed bg-white/20 text-white/30"
                      }`}
                      aria-disabled={!audit.response}
                    >
                      <ArrowUpRight size={13} className="text-current" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-white/35">
              No audits match &quot;{query}&quot;
            </div>
          )}
        </div>
      )}
    </div>
  );
}
