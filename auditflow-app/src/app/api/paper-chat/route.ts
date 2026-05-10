import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, "");
  const apiKey = process.env.AZURE_OPENAI_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o";
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";

  if (!endpoint || !apiKey) {
    return NextResponse.json(
      { error: "Azure OpenAI credentials not configured." },
      { status: 500 }
    );
  }

  let body: {
    messages: { role: string; content: string }[];
    highlight?: string;
    documentContext?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { messages, highlight, documentContext } = body;
  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: "messages array required." }, { status: 400 });
  }

  const systemMessages: { role: string; content: string }[] = [
    {
      role: "system",
      content:
        "You are a helpful AI research assistant. The user is reading a scientific paper. " +
        "Answer questions concisely and accurately. " +
        "You have access to the full document content including tables, figures, and equations " +
        "extracted by Azure Document Intelligence. " +
        "When referencing figures or tables, describe what they show. " +
        "Format responses in clear prose — avoid excessive markdown symbols.",
    },
  ];

  // Inject the full document context (Azure DI Markdown output)
  if (documentContext) {
    systemMessages.push({
      role: "system",
      content:
        "Below is the full paper content extracted by Azure Document Intelligence " +
        "(including text, tables, figure captions, and equations):\n\n" +
        documentContext,
    });
  }

  // Add highlighted text as additional context
  if (highlight) {
    systemMessages.push({
      role: "system",
      content: `The user has highlighted this passage:\n\n"${highlight}"`,
    });
  }

  const fullMessages = [...systemMessages, ...messages];

  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  let azureRes: Response;
  try {
    azureRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        messages: fullMessages,
        temperature: 0.3,
        max_tokens: 800,
      }),
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Could not reach Azure OpenAI: ${e instanceof Error ? e.message : e}` },
      { status: 502 }
    );
  }

  const data = await azureRes.json();
  if (!azureRes.ok) {
    return NextResponse.json(
      { error: data?.error?.message || "Azure OpenAI error." },
      { status: azureRes.status }
    );
  }

  const reply = data?.choices?.[0]?.message?.content ?? "";
  return NextResponse.json({ reply });
}
