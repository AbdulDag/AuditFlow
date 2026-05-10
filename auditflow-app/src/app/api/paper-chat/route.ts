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

  let body: { messages: { role: string; content: string }[]; highlight?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { messages, highlight } = body;
  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: "messages array required." }, { status: 400 });
  }

  // Build system prompt — if there's a highlighted selection, add context
  const systemPrompt =
    "You are a helpful research assistant. The user is reading a scientific paper. " +
    "Answer questions concisely and accurately. If a text selection is provided, use it as context. " +
    "Format responses in plain prose — no excessive markdown.";

  const fullMessages: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt },
    ...(highlight
      ? [
          {
            role: "system",
            content: `The user has highlighted this passage from the paper:\n\n"${highlight}"`,
          },
        ]
      : []),
    ...messages,
  ];

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
