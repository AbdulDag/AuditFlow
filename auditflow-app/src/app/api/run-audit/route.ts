import { NextRequest, NextResponse } from "next/server";
import { Agent, fetch as undiciFetch, FormData as UndiciFormData } from "undici";

export const runtime = "nodejs";

const MAX_BYTES = 100 * 1024 * 1024;

// Node.js built-in fetch (undici) has a hard 5-minute headersTimeout that
// kills long-running audit requests before the Python server can respond.
// A custom Agent overrides that default for this route only.
const _auditAgent = new Agent({
  headersTimeout: 15 * 60 * 1000, // 15 minutes
  bodyTimeout: 15 * 60 * 1000,
});

function backendBase(): string {
  const u =
    process.env.AUDITFLOW_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_AUDITFLOW_API_URL?.trim() ||
    "http://127.0.0.1:8000";
  return u.replace(/\/$/, "");
}

function normalizeArxivId(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^arxiv:/i, "");
  const abs = s.match(/arxiv\.org\/abs\/([\d.]+)(v\d+)?/i);
  if (abs) return abs[1];
  const pdf = s.match(/arxiv\.org\/pdf\/([\d.]+)/i);
  if (pdf) return pdf[1];
  const m = s.match(/([\d]{4}\.[\d]{4,5})(v\d+)?/i);
  if (m) return m[1];
  throw new Error("invalid arxiv id");
}

export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") || "";

  let file: File | null = null;

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } else if (ct.includes("application/json")) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ detail: "Invalid JSON body" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || !("arxivId" in body)) {
      return NextResponse.json(
        { detail: "Expected { arxivId: string }" },
        { status: 400 }
      );
    }
    const arxivId = String((body as { arxivId: unknown }).arxivId || "");
    let id: string;
    try {
      id = normalizeArxivId(arxivId);
    } catch {
      return NextResponse.json(
        { detail: "Could not parse arXiv ID" },
        { status: 400 }
      );
    }
    const pdfUrl = `https://arxiv.org/pdf/${id}.pdf`;
    const pdfRes = await undiciFetch(pdfUrl, { redirect: "follow" }) as unknown as Response;
    if (!pdfRes.ok) {
      return NextResponse.json(
        {
          detail: `arXiv returned ${pdfRes.status} for ${pdfUrl}`,
        },
        { status: 502 }
      );
    }
    const buf = await pdfRes.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ detail: "PDF exceeds 100 MB" }, { status: 413 });
    }
    file = new File([buf], `${id}.pdf`, { type: "application/pdf" });
  } else {
    return NextResponse.json(
      { detail: "Use multipart file or JSON { arxivId }" },
      { status: 415 }
    );
  }

  if (!file || file.size === 0) {
    return NextResponse.json({ detail: "Empty upload" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ detail: "File exceeds 100 MB" }, { status: 413 });
  }

  const fileBytes = await file.arrayBuffer();
  const fd = new UndiciFormData();
  fd.append("file", new Blob([fileBytes], { type: file.type }), file.name);

  let auditRes: Response;
  try {
    auditRes = await undiciFetch(`${backendBase()}/api/audit`, {
      method: "POST",
      body: fd,
      dispatcher: _auditAgent,
    }) as unknown as Response;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        detail: `Could not reach AuditFlow API at ${backendBase()}: ${msg}`,
      },
      { status: 502 }
    );
  }

  const text = await auditRes.text();
  return new NextResponse(text, {
    status: auditRes.status,
    headers: {
      "Content-Type":
        auditRes.headers.get("content-type") || "application/json",
    },
  });
}
