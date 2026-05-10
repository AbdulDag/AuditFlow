import type { AuditResponse } from "@/types";

export class AuditClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail?: string
  ) {
    super(message);
    this.name = "AuditClientError";
  }
}

function parseErrorDetail(text: string): string {
  try {
    const j = JSON.parse(text) as { detail?: unknown };
    if (typeof j.detail === "string") return j.detail;
    if (Array.isArray(j.detail)) return JSON.stringify(j.detail);
  } catch {
    /* plain text */
  }
  return text.slice(0, 500);
}

export async function runAuditWithPdf(file: File): Promise<AuditResponse> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/run-audit", {
    method: "POST",
    body: fd,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new AuditClientError(
      "Audit failed",
      res.status,
      parseErrorDetail(text)
    );
  }
  return JSON.parse(text) as AuditResponse;
}

export async function runAuditWithArxiv(arxivId: string): Promise<AuditResponse> {
  const res = await fetch("/api/run-audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ arxivId }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new AuditClientError(
      "Audit failed",
      res.status,
      parseErrorDetail(text)
    );
  }
  return JSON.parse(text) as AuditResponse;
}
