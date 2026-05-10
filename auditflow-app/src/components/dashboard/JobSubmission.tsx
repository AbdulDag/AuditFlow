"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, Link2, ArrowRight, FileUp, X, AlertCircle, Database } from "lucide-react";
import type { JobSubmitPayload } from "@/types";

interface Props {
  onSubmit: (payload: JobSubmitPayload) => void | Promise<void>;
  isRunning: boolean;
  defaultArxivId?: string;
}

export default function JobSubmission({
  onSubmit,
  isRunning,
  defaultArxivId = "",
}: Props) {
  const [mode, setMode] = useState<"arxiv" | "pdf">("arxiv");
  const [arxivId, setArxivId] = useState(defaultArxivId);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [datasetFile, setDatasetFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const datasetRef = useRef<HTMLInputElement>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (defaultArxivId) {
      setArxivId(defaultArxivId);
      setMode("arxiv");
    }
  }, [defaultArxivId]);

  useEffect(() => {
    return () => {
      if (errorTimer.current) clearTimeout(errorTimer.current);
    };
  }, []);

  function showError(msg: string) {
    setError(msg);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 6000);
  }

  async function handleSubmit(e: React.FormEvent) {
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
    try {
      if (mode === "arxiv") {
        await onSubmit({ mode: "arxiv", arxivId: arxivId.trim(), dataset: datasetFile ?? undefined });
      } else {
        await onSubmit({ mode: "pdf", file: droppedFile!, dataset: datasetFile ?? undefined });
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : "Audit failed to start.");
    }
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
    <div className="relative rounded-2xl border border-white/[0.08] bg-[#111] p-6">
      <div
        className={`absolute top-4 right-4 z-10 flex max-w-[min(100%-380px,320px)] items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-400 shadow-lg transition-all duration-300 ${
          error
            ? "opacity-100 translate-y-0"
            : "pointer-events-none opacity-0 -translate-y-2"
        }`}
      >
        <AlertCircle size={14} className="flex-shrink-0" />
        <span className="line-clamp-3">{error}</span>
        <button
          type="button"
          onClick={() => setError(null)}
          className="ml-1 cursor-pointer opacity-60 transition-opacity hover:opacity-100"
        >
          <X size={12} />
        </button>
      </div>

      <h2 className="mb-1 text-base font-semibold text-white">New audit</h2>
      <p className="mb-6 text-sm text-white/45">
        Upload the paper PDF or paste an arXiv ID. The FastAPI pipeline runs
        Azure Document Intelligence, metadata extraction, and Docker execution.
      </p>

      <div className="mb-6 flex w-fit gap-1 rounded-xl border border-white/[0.08] bg-black/40 p-1">
        {(["arxiv", "pdf"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
              mode === m
                ? "bg-white text-black"
                : "text-white/45 hover:text-white/70"
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
                className="w-full rounded-xl border border-white/[0.08] bg-black/50 px-4 py-3 font-mono text-sm text-white placeholder:text-white/25 outline-none transition-all focus:border-white/20 focus:ring-1 focus:ring-white/10 disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={isRunning}
              className="flex shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition-opacity hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRunning ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                  Running…
                </>
              ) : (
                <>
                  Run audit
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-all duration-200 ${
                dragging
                  ? "border-white/40 bg-white/[0.04]"
                  : droppedFile
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-white/[0.1] bg-black/40 hover:border-white/20"
              }`}
            >
              <FileUp
                size={28}
                className={droppedFile ? "text-emerald-400" : "text-white/30"}
              />
              {droppedFile ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-emerald-400">
                    {droppedFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDroppedFile(null);
                    }}
                    className="cursor-pointer text-white/40 hover:text-red-400"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-white/45">
                    Drop a PDF here or{" "}
                    <span className="text-white/80">browse</span>
                  </p>
                  <p className="text-xs text-white/25">
                    PDF only · max 100 MB (server limit)
                  </p>
                </>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setDroppedFile(f);
              }}
            />
            {droppedFile && (
              <button
                type="submit"
                disabled={isRunning}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-semibold text-black transition-opacity hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isRunning ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                    Running…
                  </>
                ) : (
                  <>
                    Run audit <ArrowRight size={14} />
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Optional dataset attachment — available in both modes */}
        <div className="mt-5 border-t border-white/[0.06] pt-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database size={13} className="text-white/35" />
              <span className="text-xs font-medium text-white/45">
                Attach dataset{" "}
                <span className="text-white/25 font-normal">(optional — improves scoring accuracy)</span>
              </span>
            </div>
            {datasetFile ? (
              <div className="flex items-center gap-2">
                <span className="max-w-[180px] truncate font-mono text-[11px] text-blue-400">
                  {datasetFile.name}
                </span>
                <button
                  type="button"
                  onClick={() => setDatasetFile(null)}
                  className="cursor-pointer text-white/35 hover:text-red-400"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => datasetRef.current?.click()}
                disabled={isRunning}
                className="cursor-pointer rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-white/55 transition-colors hover:border-white/20 hover:text-white/80 disabled:opacity-40"
              >
                Browse…
              </button>
            )}
          </div>
          <input
            ref={datasetRef}
            type="file"
            accept=".csv,.json,.jsonl,.parquet,.zip,.tar,.gz,.h5,.hdf5,.npz,.npy"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setDatasetFile(f);
            }}
          />
          {!datasetFile && (
            <p className="mt-1.5 text-[11px] text-white/25">
              CSV, JSON, Parquet, HDF5, NumPy or ZIP archives
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
