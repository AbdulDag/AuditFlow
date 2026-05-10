"use client";

import {
  createContext,
  useContext,
  useCallback,
} from "react";
import { useUser } from "@clerk/nextjs";
import type { AuditEntry } from "@/types";

interface AuditContextType {
  saveAudit: (audit: AuditEntry) => void;
  getAudits: () => AuditEntry[];
  getAuditById: (id: string) => AuditEntry | null;
}

const AuditContext = createContext<AuditContextType | null>(null);

const auditsKey = (userId: string) => `auditflow_audits_${userId}`;

export function AuditProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();

  const saveAudit = useCallback(
    (audit: AuditEntry) => {
      if (!user?.id) return;
      const key = auditsKey(user.id);
      const existing: AuditEntry[] = JSON.parse(
        localStorage.getItem(key) || "[]"
      );
      localStorage.setItem(key, JSON.stringify([audit, ...existing]));
    },
    [user?.id]
  );

  const getAudits = useCallback((): AuditEntry[] => {
    if (!user?.id) return [];
    try {
      return JSON.parse(localStorage.getItem(auditsKey(user.id)) || "[]");
    } catch {
      return [];
    }
  }, [user?.id]);

  const getAuditById = useCallback(
    (id: string): AuditEntry | null => {
      return getAudits().find((a) => a.id === id) ?? null;
    },
    [getAudits]
  );

  return (
    <AuditContext.Provider value={{ saveAudit, getAudits, getAuditById }}>
      {children}
    </AuditContext.Provider>
  );
}

export function useAuditStore() {
  const ctx = useContext(AuditContext);
  if (!ctx) throw new Error("useAuditStore must be used within AuditProvider");
  return ctx;
}
