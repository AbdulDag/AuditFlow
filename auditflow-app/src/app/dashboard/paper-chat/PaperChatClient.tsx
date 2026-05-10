"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  Upload,
  Send,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  MessageSquare,
  Sparkles,
  X,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

// Use the bundled worker from pdfjs-dist
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface Message {
  role: "user" | "assistant";
  content: string;
  highlight?: string;
}

export default function PaperChatClient() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [highlight, setHighlight] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Capture text selection from the PDF container
  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (text && text.length > 3) {
      setHighlight(text);
      setInput(`Explain: "${text.length > 120 ? text.slice(0, 120) + "…" : text}"`);
    }
  }, []);

  function handleFile(f: File) {
    if (!f.type.includes("pdf")) return;
    setPdfFile(f);
    const url = URL.createObjectURL(f);
    setPdfUrl(url);
    setPage(1);
    setMessages([
      {
        role: "assistant",
        content:
          "PDF loaded! Highlight any text in the paper to ask questions about it, or just type your question below.",
      },
    ]);
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text, highlight: highlight || undefined };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setHighlight("");
    setLoading(true);

    try {
      const res = await fetch("/api/paper-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: text }],
          highlight: userMsg.highlight,
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply || data.error || "No response." },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Could not reach the AI — check your connection." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* ── Left: PDF Viewer ─────────────────────────────────── */}
      <div className="flex w-[55%] flex-col border-r border-white/[0.08]">
        {/* Toolbar */}
        <div className="flex h-11 items-center gap-2 border-b border-white/[0.08] bg-black/60 px-4">
          <Link
            href="/dashboard"
            className="mr-2 flex items-center gap-1 text-xs text-white/40 hover:text-white/70"
          >
            <ArrowLeft size={13} /> Back
          </Link>
          <span className="flex-1 truncate font-mono text-[11px] text-white/35">
            {pdfFile ? pdfFile.name : "No PDF loaded"}
          </span>
          {pdfUrl && (
            <>
              <button
                type="button"
                onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}
                className="cursor-pointer rounded p-1 text-white/50 hover:text-white"
              >
                <ZoomOut size={14} />
              </button>
              <span className="min-w-[3rem] text-center font-mono text-[11px] text-white/40">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}
                className="cursor-pointer rounded p-1 text-white/50 hover:text-white"
              >
                <ZoomIn size={14} />
              </button>
              <div className="mx-2 h-4 w-px bg-white/10" />
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="cursor-pointer rounded p-1 text-white/50 hover:text-white disabled:opacity-30"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="font-mono text-[11px] text-white/40">
                {page} / {numPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(numPages, p + 1))}
                disabled={page >= numPages}
                className="cursor-pointer rounded p-1 text-white/50 hover:text-white disabled:opacity-30"
              >
                <ChevronRight size={14} />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="ml-2 flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-white/60 hover:text-white"
          >
            <Upload size={11} />
            {pdfFile ? "Replace" : "Load PDF"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>

        {/* PDF canvas */}
        <div
          ref={pdfContainerRef}
          className="flex-1 overflow-auto bg-[#0a0a0a]"
          onMouseUp={handleMouseUp}
        >
          {!pdfUrl ? (
            <div
              className="flex h-full cursor-pointer flex-col items-center justify-center gap-4 text-center"
              onClick={() => fileRef.current?.click()}
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                <Upload size={24} className="text-white/30" />
              </div>
              <p className="text-sm font-medium text-white/50">
                Click or drop a PDF to load the paper
              </p>
              <p className="text-xs text-white/25">
                Then highlight any passage to ask the AI about it
              </p>
            </div>
          ) : (
            <div className="flex justify-center py-4">
              <Document
                file={pdfUrl}
                onLoadSuccess={({ numPages: n }) => setNumPages(n)}
                loading={
                  <div className="p-8 text-sm text-white/35">Loading PDF…</div>
                }
              >
                <Page
                  pageNumber={page}
                  scale={scale}
                  renderTextLayer
                  renderAnnotationLayer={false}
                />
              </Document>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Chat Panel ────────────────────────────────── */}
      <div className="flex w-[45%] flex-col bg-[#0c0c0c]">
        {/* Chat header */}
        <div className="flex h-11 items-center gap-2 border-b border-white/[0.08] px-4">
          <MessageSquare size={14} className="text-white/40" />
          <span className="text-sm font-semibold text-white">Paper Chat</span>
          <span className="ml-auto rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/35">
            GPT-4o · Azure
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 pt-16 text-center">
              <Sparkles size={28} className="text-white/20" />
              <p className="text-sm font-medium text-white/40">
                Load a PDF and start asking questions
              </p>
              <p className="max-w-xs text-xs text-white/25">
                Highlight text in the paper — it auto-fills the chat input as context for your question.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              {msg.highlight && (
                <div className="max-w-[85%] rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] italic text-amber-300/70">
                  &ldquo;{msg.highlight.length > 100 ? msg.highlight.slice(0, 100) + "…" : msg.highlight}&rdquo;
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-white text-black"
                    : "bg-white/[0.06] text-white/85"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-start gap-2">
              <div className="rounded-2xl bg-white/[0.06] px-4 py-2.5">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-white/30 animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Highlight pill */}
        {highlight && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-[11px] text-amber-300/80">
            <Sparkles size={11} className="flex-shrink-0" />
            <span className="flex-1 truncate">
              Context: &ldquo;{highlight.slice(0, 80)}{highlight.length > 80 ? "…" : ""}&rdquo;
            </span>
            <button
              type="button"
              onClick={() => { setHighlight(""); setInput(""); }}
              className="cursor-pointer text-amber-300/50 hover:text-amber-300"
            >
              <X size={11} />
            </button>
          </div>
        )}

        {/* Input */}
        <form onSubmit={sendMessage} className="flex items-end gap-2 border-t border-white/[0.08] p-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(e as unknown as React.FormEvent);
              }
            }}
            placeholder={pdfUrl ? "Ask about the paper… (Shift+Enter for new line)" : "Load a PDF first"}
            disabled={!pdfUrl || loading}
            rows={2}
            className="flex-1 resize-none rounded-xl border border-white/[0.08] bg-black/50 px-4 py-2.5 text-sm text-white placeholder:text-white/25 outline-none transition-all focus:border-white/20 disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading || !pdfUrl}
            className="flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-xl bg-white text-black transition-opacity hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send size={15} />
          </button>
        </form>
      </div>
    </div>
  );
}
