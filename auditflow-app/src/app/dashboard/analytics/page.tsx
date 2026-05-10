"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from "recharts";
import { useAuditStore } from "@/context/AuditContext";
import type { AuditEntry } from "@/types";
import { FlaskConical } from "lucide-react";

interface MonthlyPoint {
  month: string;
  audits: number;
  avgR: number;
}

function buildMonthlyData(audits: AuditEntry[]): MonthlyPoint[] {
  const grouped: Record<string, { label: string; count: number; totalR: number }> = {};

  audits.forEach((audit) => {
    const date = new Date(audit.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

    if (!grouped[key]) {
      grouped[key] = { label, count: 0, totalR: 0 };
    }
    grouped[key].count++;
    grouped[key].totalR += audit.rindex;
  });

  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      month: v.label,
      audits: v.count,
      avgR: parseFloat((v.totalR / v.count).toFixed(2)),
    }));
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#111111] border border-[#1E1E1E] rounded-xl px-4 py-3 text-xs shadow-xl">
      <p className="text-[#6B7280] font-medium mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const { getAudits } = useAuditStore();
  const [audits, setAudits] = useState<AuditEntry[]>([]);

  useEffect(() => {
    setAudits(getAudits());
  }, [getAudits]);

  const monthly = buildMonthlyData(audits);

  const totalAudits = audits.length;
  const passCount = audits.filter((a) => a.status === "PASS").length;
  const warnCount = audits.filter((a) => a.status === "WARN").length;
  const failCount = audits.filter((a) => a.status === "FAIL").length;
  const avgRIndex = totalAudits > 0
    ? (audits.reduce((s, a) => s + a.rindex, 0) / totalAudits).toFixed(2)
    : null;

  const rValues = monthly.map((m) => m.avgR);
  const minR = rValues.length > 0 ? Math.max(0, Math.min(...rValues) - 0.1) : 0;
  const maxR = rValues.length > 0 ? Math.min(1, Math.max(...rValues) + 0.1) : 1;

  const statusData = [
    { label: "Pass", value: passCount, color: "#22C55E" },
    { label: "Warn", value: warnCount, color: "#F59E0B" },
    { label: "Fail", value: failCount, color: "#EF4444" },
  ];

  const isEmpty = totalAudits === 0;

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div>
        <p className="text-[11px] font-semibold text-[#F5C518] uppercase tracking-[0.18em] mb-1">
          Your Data
        </p>
        <h1 className="text-4xl font-bold text-white tracking-tight">Analytics</h1>
        <p className="text-sm text-[#6B7280] mt-1.5">
          Audit volume and R-Index trends based on your actual submitted papers.
        </p>
      </div>

      {isEmpty ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#F5C518]/10 border border-[#F5C518]/20 flex items-center justify-center">
            <FlaskConical size={24} className="text-[#F5C518]" />
          </div>
          <p className="text-base font-semibold text-white">No data yet</p>
          <p className="text-sm text-[#6B7280] text-center max-w-sm leading-relaxed">
            Run your first audit from the Dashboard and your analytics will appear here automatically.
          </p>
        </div>
      ) : (
        <>
          {/* Summary stat cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 divide-x divide-y xl:divide-y-0 divide-[#1E1E1E] border border-[#1E1E1E] rounded-2xl overflow-hidden">
            {[
              { label: "Total Audits", value: String(totalAudits) },
              { label: "Avg R-Index", value: String(avgRIndex) },
              { label: "Pass Rate", value: totalAudits > 0 ? `${Math.round((passCount / totalAudits) * 100)}%` : "—" },
              { label: "Months Active", value: String(monthly.length) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-[#0D0D0D] px-7 py-6">
                <p className="text-3xl font-bold text-white tracking-tight">{value}</p>
                <p className="text-xs text-[#6B7280] mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Audits per Month */}
            <div className="rounded-2xl border border-[#1E1E1E] bg-[#111111] p-6">
              <h2 className="text-sm font-bold text-white mb-1">Audits per Month</h2>
              <p className="text-xs text-[#6B7280] mb-6">Number of papers audited each month</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthly} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E1E1E" />
                  <XAxis dataKey="month" tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "#F5C518", opacity: 0.05 }} />
                  <Bar dataKey="audits" fill="#F5C518" radius={[4, 4, 0, 0]} name="Audits" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Avg R-Index Trend */}
            <div className="rounded-2xl border border-[#1E1E1E] bg-[#111111] p-6">
              <h2 className="text-sm font-bold text-white mb-1">Avg R-Index Trend</h2>
              <p className="text-xs text-[#6B7280] mb-6">Average reproducibility score over time</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E1E1E" />
                  <XAxis dataKey="month" tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    domain={[parseFloat(minR.toFixed(2)), parseFloat(maxR.toFixed(2))]}
                    tick={{ fill: "#6B7280", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => v.toFixed(2)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="avgR"
                    stroke="#F5C518"
                    strokeWidth={2}
                    dot={{ fill: "#F5C518", r: 4, strokeWidth: 0 }}
                    activeDot={{ r: 6, fill: "#F5C518" }}
                    name="Avg R-Index"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Status breakdown */}
          <div className="rounded-2xl border border-[#1E1E1E] bg-[#111111] p-6">
            <h2 className="text-sm font-bold text-white mb-1">Result Breakdown</h2>
            <p className="text-xs text-[#6B7280] mb-6">Distribution of audit outcomes across all your papers</p>
            <div className="grid grid-cols-3 gap-4">
              {statusData.map(({ label, value, color }) => {
                const pct = totalAudits > 0 ? Math.round((value / totalAudits) * 100) : 0;
                return (
                  <div key={label} className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold" style={{ color }}>{label}</span>
                      <span className="text-xs text-[#6B7280]">{value} audit{value !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#1E1E1E] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                    <p className="text-2xl font-bold text-white">{pct}%</p>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
