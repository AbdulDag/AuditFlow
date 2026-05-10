"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, Link2, ArrowRight, FileUp, X, AlertCircle } from "lucide-react";

interface Props {
  onSubmit: (paperId: string) => void;
  isRunning: boolean;
}

export default function JobSubmission({ onSubmit, isRunning }: Props) {
  const [mode, setMode] = useState<"arxiv" | "pdf">("arxiv");
  const [arxivId, setArxivId] = useState("");
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (errorTimer.current) clearTimeout(errorTimer.current); };
  }, []);

  function showError(msg: string) {
    setError(msg);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 4000);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isRunning) return;
    if (mode === "arxiv" && !arxivId.trim()) {
      showError("Please enter an arXiv ID or URL before running the audit.");
      return;
    }
    if (mode === "pdf" && !droppedFile) {
      showError("Please upload a PDF file before running the audit.");
      return;
    }
    const id = mode === "arxiv" ? arxivId.trim() : droppedFile!.name;
    onSubmit(id);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.type === "application/pdf") {
      setDroppedFile(file);
      setMode("pdf");
    }
  }

  return (
    <div className="rounded-2xl border border-[#1E1E1E] bg-[#111111] p-6 relative">
      {/* Error toast */}
      <div
        className={`absolute top-4 right-4 z-10 flex items-center gap-2.5 px-4 py-3 rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444] text-xs font-medium shadow-lg transition-all duration-300 ${
          error ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
        }`}
      >
        <AlertCircle size={14} className="flex-shrink-0" />
        {error}
        <button onClick={() => setError(null)} className="ml-1 opacity-60 hover:opacity-100 cursor-pointer transition-opacity">
          <X size={12} />
        </button>
      </div>

      <h2 className="text-base font-bold text-white mb-1">New Audit</h2>
      <p className="text-sm text-[#6B7280] mb-6">
        Submit an arXiv paper or upload a PDF to begin reproducibility analysis.
      </p>

      {/* Mode tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-[#0D0D0D] border border-[#1E1E1E] w-fit mb-6">
        {(["arxiv", "pdf"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
              mode === m
                ? "bg-[#F5C518] text-black"
                : "text-[#6B7280] hover:text-[#9CA3AF]"
            }`}
          >
            {m === "arxiv" ? <Link2 size={12} /> : <Upload size={12} />}
            {m === "arxiv" ? "arXiv ID" : "Upload PDF"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {mode === "arxiv" ? (
          <div className="flex gap-3">
            <div className="flex-1">
              <input
                type="text"
                value={arxivId}
                onChange={(e) => setArxivId(e.target.value)}
                placeholder="e.g. 2401.12345 or https://arxiv.org/abs/2401.12345"
                disabled={isRunning}
                className="w-full bg-[#0D0D0D] border border-[#1E1E1E] rounded-xl px-4 py-3 text-sm text-white placeholder-[#4B5563] focus:outline-none focus:border-[#F5C518]/40 focus:ring-1 focus:ring-[#F5C518]/15 transition-all font-mono disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={isRunning}
              className="flex items-center gap-2 px-5 py-3 bg-[#F5C518] text-black text-sm font-bold rounded-xl hover:bg-[#D4AC15] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex-shrink-0"
            >
              {isRunning ? (
                <>
                  <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Running…
                </>
              ) : (
                <>
                  Run Audit
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-10 cursor-pointer transition-all duration-200 ${
                dragging
                  ? "border-[#F5C518] bg-[#F5C518]/5"
                  : droppedFile
                  ? "border-[#22C55E]/40 bg-[#22C55E]/5"
                  : "border-[#1E1E1E] hover:border-[#2A2A2A] bg-[#0D0D0D]"
              }`}
            >
              <FileUp size={28} className={droppedFile ? "text-[#22C55E]" : "text-[#4B5563]"} />
              {droppedFile ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[#22C55E] font-medium">{droppedFile.name}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDroppedFile(null); }}
                    className="text-[#4B5563] hover:text-[#EF4444] cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-[#6B7280]">
                    Drop a PDF here or <span className="text-[#F5C518]">browse</span>
                  </p>
                  <p className="text-xs text-[#4B5563]">PDF files only · Max 50MB</p>
                </>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && setDroppedFile(e.target.files[0])}
            />
            {droppedFile && (
              <button
                type="submit"
                disabled={isRunning}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-[#F5C518] text-black text-sm font-bold rounded-xl hover:bg-[#D4AC15] transition-all duration-200 disabled:opacity-50 cursor-pointer"
              >
                {isRunning ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Running…
                  </>
                ) : (
                  <>Run Audit <ArrowRight size={14} /></>
                )}
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
