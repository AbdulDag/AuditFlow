/**
 * AuditFlow dashboard.
 *
 * A single-page React app that lets a user upload an ML research paper
 * (PDF), POSTs it to `/api/audit`, and renders the resulting
 * `ReproducibilityScorecard` in three sections:
 *
 *   1. A drag-and-drop upload zone.
 *   2. A processing state with a spinner + a step indicator while the
 *      backend is talking to Azure / building the Docker image.
 *   3. A scorecard with the reproducibility index, the extracted GitHub
 *      link + dependencies, and a black "terminal" panel that streams
 *      the raw Docker logs returned by the API.
 *
 * The component is intentionally self-contained: no router, no global
 * store, no UI library beyond Tailwind utilities. All state is local.
 */

import { useCallback, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_ENDPOINT = "/api/audit";
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // mirrors the FastAPI ceiling

const PROCESSING_STEPS = [
  "Uploading PDF",
  "Extracting layout with Azure Document Intelligence",
  "Inferring dependencies with gpt-4o",
  "Building Docker image",
  "Running container & collecting logs",
];

// ---------------------------------------------------------------------------
// Top-level component
// ---------------------------------------------------------------------------

export default function App() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [stepIndex, setStepIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const inputRef = useRef(null);
  const stepTimerRef = useRef(null);

  // -------------------------------------------------------------------------
  // File selection
  // -------------------------------------------------------------------------

  const acceptFile = useCallback((picked) => {
    if (!picked) return;
    if (picked.type && picked.type !== "application/pdf") {
      setErrorMessage("Only PDF files are supported.");
      return;
    }
    if (picked.size > MAX_UPLOAD_BYTES) {
      setErrorMessage("File too large — the backend caps uploads at 100 MB.");
      return;
    }
    setErrorMessage("");
    setResult(null);
    setStatus("idle");
    setFile(picked);
  }, []);

  const onInputChange = (event) => acceptFile(event.target.files?.[0]);

  const onDragOver = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    acceptFile(event.dataTransfer.files?.[0]);
  };

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  const startStepTicker = () => {
    setStepIndex(0);
    // Visual-only progress through the pipeline stages. The backend is a
    // single round-trip, so this is purely for UX — it advances on a
    // timer and stops at the last step until the response lands.
    stepTimerRef.current = setInterval(() => {
      setStepIndex((idx) =>
        idx < PROCESSING_STEPS.length - 1 ? idx + 1 : idx
      );
    }, 4500);
  };

  const stopStepTicker = () => {
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  };

  const submit = async () => {
    if (!file || status === "loading") return;

    setStatus("loading");
    setErrorMessage("");
    setResult(null);
    startStepTicker();

    const form = new FormData();
    form.append("file", file);

    try {
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        body: form,
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload?.detail || `Audit request failed (HTTP ${response.status})`
        );
      }

      setResult(payload);
      setStatus("done");
    } catch (err) {
      setErrorMessage(err.message || "Unknown error from /api/audit");
      setStatus("error");
    } finally {
      stopStepTicker();
      setStepIndex(PROCESSING_STEPS.length - 1);
    }
  };

  const reset = () => {
    stopStepTicker();
    setFile(null);
    setResult(null);
    setStatus("idle");
    setErrorMessage("");
    setStepIndex(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <Header />

      <main className="mx-auto max-w-5xl px-6 pb-24 pt-10 sm:pt-16">
        {status !== "done" && (
          <UploadCard
            file={file}
            isDragging={isDragging}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onPick={() => inputRef.current?.click()}
            onSubmit={submit}
            onReset={reset}
            disabled={status === "loading"}
            inputRef={inputRef}
            onInputChange={onInputChange}
          />
        )}

        {errorMessage && status !== "loading" && (
          <ErrorBanner message={errorMessage} />
        )}

        {status === "loading" && <ProcessingPanel stepIndex={stepIndex} />}

        {status === "done" && result && (
          <Scorecard payload={result} onReset={reset} />
        )}
      </main>

      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Header() {
  return (
    <header className="border-b border-slate-800/60 bg-slate-950/40 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30">
            <BeakerIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">AuditFlow</h1>
            <p className="text-xs text-slate-400">
              Automated reproducibility auditing for ML research papers
            </p>
          </div>
        </div>
        <a
          href="https://github.com"
          className="hidden rounded-md border border-slate-700/60 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60 sm:inline-block"
        >
          docs
        </a>
      </div>
    </header>
  );
}

function UploadCard({
  file,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onPick,
  onSubmit,
  onReset,
  disabled,
  inputRef,
  onInputChange,
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-2xl shadow-black/30 sm:p-8">
      <h2 className="text-base font-semibold text-slate-100">
        Upload a research paper
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        Drop a PDF below. AuditFlow will extract the GitHub repo, infer
        dependencies, and run the project inside a sandboxed container.
      </p>

      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onPick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPick()}
        className={[
          "mt-6 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition",
          isDragging
            ? "border-emerald-400 bg-emerald-500/5"
            : "border-slate-700 hover:border-slate-500 hover:bg-slate-800/40",
        ].join(" ")}
      >
        <UploadIcon className="h-10 w-10 text-slate-400" />
        <p className="mt-4 text-sm text-slate-200">
          <span className="font-medium text-emerald-300">Click to upload</span>{" "}
          or drag and drop
        </p>
        <p className="mt-1 text-xs text-slate-500">PDF only, up to 100 MB</p>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={onInputChange}
        />
      </div>

      {file && (
        <div className="mt-5 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm">
          <div className="flex items-center gap-3 truncate">
            <FileIcon className="h-5 w-5 flex-shrink-0 text-slate-400" />
            <div className="truncate">
              <p className="truncate text-slate-100">{file.name}</p>
              <p className="text-xs text-slate-500">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onReset();
            }}
            className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            remove
          </button>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          onClick={onSubmit}
          disabled={!file || disabled}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
        >
          <PlayIcon className="h-4 w-4" />
          Run reproducibility audit
        </button>
      </div>
    </section>
  );
}

function ProcessingPanel({ stepIndex }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 shadow-2xl shadow-black/30">
      <div className="flex items-center gap-4">
        <Spinner />
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            Auditing paper…
          </h2>
          <p className="text-sm text-slate-400">
            This usually takes 30–120 seconds depending on the repository.
          </p>
        </div>
      </div>

      <ol className="mt-8 space-y-3">
        {PROCESSING_STEPS.map((label, idx) => {
          const state =
            idx < stepIndex
              ? "done"
              : idx === stepIndex
              ? "active"
              : "pending";
          return (
            <li
              key={label}
              className="flex items-center gap-3 text-sm"
            >
              <StepDot state={state} />
              <span
                className={
                  state === "done"
                    ? "text-slate-400 line-through"
                    : state === "active"
                    ? "font-medium text-slate-100"
                    : "text-slate-500"
                }
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Scorecard({ payload, onReset }) {
  const { scorecard, source, error } = payload;
  const { metadata, execution, reproducibility_index: index } = scorecard;

  const tone = useMemo(() => scoreTone(index), [index]);

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-2xl shadow-black/30 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">
              Reproducibility Scorecard
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-50">
              {metadata.github_url
                ? metadata.github_url.replace(/^https?:\/\//, "")
                : "No repository detected"}
            </h2>
            {error && (
              <p className="mt-2 text-sm text-amber-300/90">⚠ {error}</p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              extraction source: <span className="font-mono">{source}</span>
            </p>
          </div>

          <ScoreDial value={index} tone={tone} />
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Docker build"
            value={execution.build_success ? "succeeded" : "failed"}
            tone={execution.build_success ? "good" : "bad"}
          />
          <StatCard
            label="Exit code"
            value={String(execution.exit_code)}
            tone={execution.exit_code === 0 ? "good" : "bad"}
          />
          <StatCard
            label="Dependencies"
            value={String(metadata.dependencies?.length ?? 0)}
            tone="neutral"
          />
        </div>
      </div>

      <MetadataPanel metadata={metadata} />

      <LogsTerminal logs={execution.logs} />

      <div className="flex justify-end">
        <button
          onClick={onReset}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
        >
          <RefreshIcon className="h-4 w-4" />
          Audit another paper
        </button>
      </div>
    </section>
  );
}

function MetadataPanel({ metadata }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-2xl shadow-black/30">
      <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
        Extracted metadata
      </h3>

      <dl className="mt-4 space-y-4 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wider text-slate-500">
            GitHub repository
          </dt>
          <dd className="mt-1">
            {metadata.github_url ? (
              <a
                href={metadata.github_url}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all font-mono text-emerald-300 hover:text-emerald-200 hover:underline"
              >
                {metadata.github_url}
              </a>
            ) : (
              <span className="text-slate-500">— none detected —</span>
            )}
          </dd>
        </div>

        <div>
          <dt className="text-xs uppercase tracking-wider text-slate-500">
            Entry point
          </dt>
          <dd className="mt-1 font-mono text-slate-200">
            {metadata.entry_point || "—"}
          </dd>
        </div>

        <div>
          <dt className="text-xs uppercase tracking-wider text-slate-500">
            Inferred dependencies
          </dt>
          <dd className="mt-2 flex flex-wrap gap-2">
            {metadata.dependencies?.length ? (
              metadata.dependencies.map((dep) => (
                <span
                  key={dep}
                  className="rounded-md border border-slate-700 bg-slate-800/60 px-2 py-1 font-mono text-xs text-slate-200"
                >
                  {dep}
                </span>
              ))
            ) : (
              <span className="text-sm text-slate-500">— none inferred —</span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function LogsTerminal({ logs }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-black shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2 border-b border-slate-900 bg-slate-950/80 px-4 py-2">
        <span className="h-3 w-3 rounded-full bg-red-500/80" />
        <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
        <span className="h-3 w-3 rounded-full bg-green-500/80" />
        <span className="ml-3 font-mono text-xs uppercase tracking-widest text-slate-400">
          docker logs
        </span>
      </div>
      <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-emerald-300/90">
        {logs?.trim() ? logs : "(no output captured)"}
      </pre>
    </div>
  );
}

function ScoreDial({ value, tone }) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  const radius = 42;
  const circ = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circ;

  return (
    <div className="relative h-32 w-32 flex-shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke="currentColor"
          strokeWidth="8"
          fill="none"
          className="text-slate-800"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke="currentColor"
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
          className={tone.ring}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-semibold ${tone.text}`}>
          {clamped.toFixed(0)}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-slate-500">
          / 100
        </span>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }) {
  const palette = {
    good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    bad: "border-red-500/30 bg-red-500/10 text-red-200",
    neutral: "border-slate-700 bg-slate-800/40 text-slate-200",
  }[tone];

  return (
    <div className={`rounded-xl border px-4 py-3 ${palette}`}>
      <p className="text-[10px] uppercase tracking-widest opacity-70">
        {label}
      </p>
      <p className="mt-1 text-base font-medium">{value}</p>
    </div>
  );
}

function ErrorBanner({ message }) {
  return (
    <div className="mt-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
      {message}
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-800/60 py-6 text-center text-xs text-slate-500">
      AuditFlow · Azure Document Intelligence + gpt-4o + Docker sandbox
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Tiny presentational helpers
// ---------------------------------------------------------------------------

function StepDot({ state }) {
  if (state === "done") {
    return (
      <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40">
        <CheckIcon className="h-3 w-3" />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="relative grid h-5 w-5 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/40" />
        <span className="relative h-2.5 w-2.5 rounded-full bg-emerald-400" />
      </span>
    );
  }
  return <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />;
}

function Spinner() {
  return (
    <svg
      className="h-8 w-8 animate-spin text-emerald-400"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-20"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

// Map a 0-100 score to a Tailwind colour palette for the dial.
function scoreTone(value) {
  const v = Number(value) || 0;
  if (v >= 80) return { ring: "text-emerald-400", text: "text-emerald-300" };
  if (v >= 40) return { ring: "text-amber-400", text: "text-amber-300" };
  return { ring: "text-red-400", text: "text-red-300" };
}

// ---------------------------------------------------------------------------
// Inline SVG icons (avoids an extra runtime dependency on an icon library)
// ---------------------------------------------------------------------------

function BeakerIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3h6v4l4.5 8.5A3 3 0 0116.8 20H7.2a3 3 0 01-2.7-4.5L9 7V3z" />
      <path strokeLinecap="round" d="M8 14h8" />
    </svg>
  );
}

function UploadIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0l-4 4m4-4l4 4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
    </svg>
  );
}

function FileIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5" />
    </svg>
  );
}

function PlayIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M6 4l14 8L6 20V4z" />
    </svg>
  );
}

function RefreshIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 20v-6h-6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 14a7 7 0 0011.7 3M19 10A7 7 0 007.3 7" />
    </svg>
  );
}

function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
