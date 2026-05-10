"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";

const MONTHLY = [
  { month: "Nov", audits: 4, avgR: 0.71 },
  { month: "Dec", audits: 7, avgR: 0.74 },
  { month: "Jan", audits: 11, avgR: 0.69 },
  { month: "Feb", audits: 9, avgR: 0.76 },
  { month: "Mar", audits: 14, avgR: 0.78 },
  { month: "Apr", audits: 18, avgR: 0.80 },
  { month: "May", audits: 12, avgR: 0.78 },
];

const CUSTOM_TOOLTIP = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0F172A] border border-[#334155] rounded-xl p-3 text-xs">
      <p className="text-[#94A3B8] font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

export default function AnalyticsPage() {
  return (
    <div className="p-6 lg:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#F8FAFC] tracking-tight">Analytics</h1>
        <p className="text-sm text-[#64748B] mt-1">Audit volume and R-Index trends over time.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-[#1E293B] bg-[#0F172A] p-6">
          <h2 className="text-sm font-semibold text-[#F8FAFC] mb-6">Audits per Month</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={MONTHLY} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
              <XAxis dataKey="month" tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CUSTOM_TOOLTIP />} />
              <Bar dataKey="audits" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Audits" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-[#1E293B] bg-[#0F172A] p-6">
          <h2 className="text-sm font-semibold text-[#F8FAFC] mb-6">Average R-Index Trend</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={MONTHLY}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
              <XAxis dataKey="month" tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0.6, 0.9]} tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CUSTOM_TOOLTIP />} />
              <Line type="monotone" dataKey="avgR" stroke="#22C55E" strokeWidth={2} dot={{ fill: "#22C55E", r: 3 }} name="Avg R-Index" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
