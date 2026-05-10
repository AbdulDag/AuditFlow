"use client";

import { useEffect, useState } from "react";
import AuditHistoryTable from "@/components/dashboard/AuditHistoryTable";
import { useAuditStore } from "@/context/AuditContext";
import type { AuditEntry } from "@/types";

export default function HistoryPage() {
  const { getAudits } = useAuditStore();
  const [audits, setAudits] = useState<AuditEntry[]>([]);

  useEffect(() => {
    setAudits(getAudits());
  }, [getAudits]);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Audit History</h1>
        <p className="text-sm text-[#6B7280] mt-1">All past reproducibility audits, sortable and filterable.</p>
      </div>
      <AuditHistoryTable audits={audits} />
    </div>
  );
}
