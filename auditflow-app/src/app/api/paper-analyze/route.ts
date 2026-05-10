import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120; // DI can take up to 2 min for long PDFs

const DI_API_VERSION = "2024-11-30";

export async function POST(req: NextRequest) {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?.replace(/\/$/, "");
  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

  if (!endpoint || !apiKey) {
    return NextResponse.json(
      { error: "Azure Document Intelligence credentials not configured." },
      { status: 500 }
    );
  }

  // Accept multipart form with field "file"
  let pdfBytes: ArrayBuffer;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file field in form data." }, { status: 400 });
    }
    pdfBytes = await file.arrayBuffer();
  } catch {
    return NextResponse.json({ error: "Failed to parse uploaded file." }, { status: 400 });
  }

  // 1. Submit analysis job (prebuilt-layout with Markdown output)
  const analyzeUrl =
    `${endpoint}/documentintelligence/documentModels/prebuilt-layout:analyze` +
    `?api-version=${DI_API_VERSION}&outputContentFormat=markdown`;

  let submitRes: Response;
  try {
    submitRes = await fetch(analyzeUrl, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey,
        "Content-Type": "application/pdf",
      },
      body: pdfBytes,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Could not reach Azure Document Intelligence: ${e instanceof Error ? e.message : e}` },
      { status: 502 }
    );
  }

  if (!submitRes.ok) {
    const body = await submitRes.text();
    return NextResponse.json(
      { error: `Azure DI submission failed (${submitRes.status}): ${body}` },
      { status: 502 }
    );
  }

  // 2. Poll the Operation-Location header until succeeded
  const operationUrl = submitRes.headers.get("Operation-Location");
  if (!operationUrl) {
    return NextResponse.json(
      { error: "Azure DI did not return an Operation-Location header." },
      { status: 502 }
    );
  }

  const MAX_POLLS = 40;
  const POLL_INTERVAL_MS = 3000;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    let pollRes: Response;
    try {
      pollRes = await fetch(operationUrl, {
        headers: { "Ocp-Apim-Subscription-Key": apiKey },
      });
    } catch (e) {
      return NextResponse.json(
        { error: `Polling failed: ${e instanceof Error ? e.message : e}` },
        { status: 502 }
      );
    }

    const result = await pollRes.json();
    const status: string = result?.status ?? "";

    if (status === "succeeded") {
      const markdown: string = result?.analyzeResult?.content ?? "";
      // Trim to first 60 000 chars so we don't blow GPT-4o's context
      return NextResponse.json({ markdown: markdown.slice(0, 60_000) });
    }

    if (status === "failed") {
      return NextResponse.json(
        { error: `Azure DI analysis failed: ${JSON.stringify(result?.error)}` },
        { status: 502 }
      );
    }
    // status === "running" or "notStarted" — keep polling
  }

  return NextResponse.json(
    { error: "Azure DI analysis timed out after 2 minutes." },
    { status: 504 }
  );
}
