"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, ChevronUp, ChevronDown, Search, FlaskConical } from "lucide-react";
import type { AuditEntry } from "@/types";

type SortKey = "paper" | "date" | "rindex" | "status";
type SortDir = "asc" | "desc";

const STATUS_STYLES: Record<string, string> = {
  PASS: "bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20",
  WARN: "bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20",
  FAIL: "bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20",
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
    if (sortKey !== k) return <ChevronUp size={12} className="text-[#2A2A2A]" />;
    return sortDir === "asc"
      ? <ChevronUp size={12} className="text-[#F5C518]" />
      : <ChevronDown size={12} className="text-[#F5C518]" />;
  }

  return (
    <div className="rounded-2xl border border-[#1E1E1E] bg-[#111111] overflow-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-6 py-5 border-b border-[#1E1E1E]">
        <div>
          <h2 className="text-base font-bold text-white">Audit History</h2>
          <p className="text-xs text-[#6B7280] mt-0.5">
            {audits.length === 0 ? "No audits yet" : `${audits.length} audit${audits.length !== 1 ? "s" : ""} · sortable & filterable`}
          </p>
        </div>
        {audits.length > 0 && (
          <div className="relative w-full sm:w-64">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4B5563]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search papers..."
              className="w-full pl-8 pr-4 py-2 text-xs bg-[#0D0D0D] border border-[#1E1E1E] rounded-xl text-white placeholder-[#4B5563] focus:outline-none focus:border-[#F5C518]/40 focus:ring-1 focus:ring-[#F5C518]/15 transition-colors"
            />
          </div>
        )}
      </div>

      {/* Empty state */}
      {audits.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-6 gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#F5C518]/10 border border-[#F5C518]/20 flex items-center justify-center">
            <FlaskConical size={20} className="text-[#F5C518]" />
          </div>
          <p className="text-sm font-semibold text-white">No audits yet</p>
          <p className="text-xs text-[#6B7280] text-center max-w-xs leading-relaxed">
            Submit your first arXiv paper or PDF above to start a reproducibility audit. Results will appear here.
          </p>
        </div>
      )}

      {/* Table */}
      {audits.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1E1E1E]">
                {([
                  ["paper", "Paper"],
                  ["date", "Date"],
                  ["rindex", "R-Index"],
                  ["status", "Status"],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => toggleSort(key)}
                    className="text-left px-6 py-3 text-[10px] font-bold text-[#4B5563] uppercase tracking-widest cursor-pointer hover:text-[#9CA3AF] transition-colors select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      {label}
                      <SortIcon k={key} />
                    </div>
                  </th>
                ))}
                <th className="px-6 py-3 text-right text-[10px] font-bold text-[#4B5563] uppercase tracking-widest">
                  Report
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((audit, i) => (
                <tr
                  key={audit.id}
                  className={`border-b border-[#1E1E1E]/60 hover:bg-[#1A1A1A] transition-colors duration-150 ${
                    i === filtered.length - 1 ? "border-b-0" : ""
                  }`}
                >
                  <td className="px-6 py-4">
                    <p className="font-semibold text-white text-xs leading-tight max-w-xs">{audit.paper}</p>
                  </td>
                  <td className="px-6 py-4 text-xs text-[#6B7280] font-mono whitespace-nowrap">{audit.date}</td>
                  <td className="px-6 py-4"><RIndexBadge value={audit.rindex} /></td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${STATUS_STYLES[audit.status]}`}>
                      {audit.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link href="/scorecard" className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#F5C518] hover:bg-[#D4AC15] transition-colors duration-150 cursor-pointer">
                      <ArrowUpRight size={13} className="text-black" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-[#4B5563]">
              No audits match &quot;{query}&quot;
            </div>
          )}
        </div>
      )}
    </div>
  );
}
