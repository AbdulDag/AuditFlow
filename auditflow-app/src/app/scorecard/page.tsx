"use client";

import RIndexGauge from "@/components/scorecard/RIndexGauge";
import StatusBadgeGrid from "@/components/scorecard/StatusBadgeGrid";
import DependencyTable from "@/components/scorecard/DependencyTable";
import { ExternalLink, ArrowLeft, Calendar, FlaskConical } from "lucide-react";
import Link from "next/link";

export default function ScorecardPage() {
  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Back + Header */}
      <div className="flex flex-col gap-4">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors w-fit cursor-pointer">
          <ArrowLeft size={13} />
          Back to Dashboard
        </Link>

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-md bg-[#3B82F6]/10 border border-[#3B82F6]/20 flex items-center justify-center">
                <FlaskConical size={12} className="text-[#3B82F6]" />
              </div>
              <span className="text-xs font-mono text-[#64748B]">REPORT #af-002</span>
            </div>
            <h1 className="text-2xl font-bold text-[#F8FAFC] tracking-tight">
              CLIP: Learning Transferable Visual Models
            </h1>
            <div className="flex items-center gap-4 mt-2">
              <a
                href="https://arxiv.org/abs/2103.00020"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-[#3B82F6] hover:text-[#60A5FA] transition-colors cursor-pointer"
              >
                arxiv:2103.00020 <ExternalLink size={10} />
              </a>
              <span className="flex items-center gap-1 text-xs text-[#64748B]">
                <Calendar size={11} />
                Audited May 8, 2026
              </span>
            </div>
          </div>

          <span className="self-start px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20 whitespace-nowrap">
            HIGH REPRODUCIBILITY
          </span>
        </div>
      </div>

      {/* R-Index + Status grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <RIndexGauge score={0.78} />
        <div className="lg:col-span-2">
          <StatusBadgeGrid />
        </div>
      </div>

      {/* Dependency table */}
      <DependencyTable />
    </div>
  );
}
