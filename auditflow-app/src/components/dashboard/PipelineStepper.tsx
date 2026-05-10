import { Check, FileText, Package, Container, PlayCircle, Award } from "lucide-react";

const STEPS = [
  { label: "PDF extraction", sublabel: "Azure DI → Markdown", icon: FileText },
  { label: "Metadata", sublabel: "GPT-4o JSON", icon: Package },
  { label: "Docker build", sublabel: "Image + deps", icon: Container },
  { label: "Execution", sublabel: "Sandbox run", icon: PlayCircle },
  { label: "Scorecard", sublabel: "R-index + justification", icon: Award },
];

interface Props {
  currentStep: number;
  status: "idle" | "running" | "complete" | "error";
  paperId: string;
}

export default function PipelineStepper({
  currentStep,
  status,
  paperId,
}: Props) {
  const pct = Math.min(100, (currentStep / STEPS.length) * 100);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#111] p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Pipeline status</h2>
          <p className="mt-0.5 truncate font-mono text-xs text-white/35">
            {paperId}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-bold ${
            status === "complete"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : status === "error"
                ? "border-red-500/30 bg-red-500/10 text-red-400"
                : "border-white/15 bg-white/[0.06] text-white/70"
          }`}
        >
          {status === "complete"
            ? "Complete"
            : status === "error"
              ? "Failed"
              : "Running"}
        </span>
      </div>

      <div className="relative">
        <div className="absolute right-5 left-5 top-5 h-px bg-white/[0.08]" />
        <div
          className="absolute top-5 left-5 h-px bg-white/40 transition-all duration-700"
          style={{ width: `calc(${pct}% - 10%)` }}
        />

        <div className="relative z-10 flex justify-between">
          {STEPS.map(({ label, sublabel, icon: Icon }, i) => {
            const done =
              status === "complete" ||
              (status === "running" && currentStep > i + 1);
            const active =
              status === "running" && currentStep === i + 1 && !done;

            return (
              <div key={label} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all duration-500 ${
                    done
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : active
                        ? "border-white/30 bg-white/[0.08]"
                        : "border-white/[0.08] bg-black/40"
                  }`}
                >
                  {done ? (
                    <Check size={16} className="text-emerald-400" />
                  ) : (
                    <Icon
                      size={16}
                      className={
                        active ? "text-white" : "text-white/30"
                      }
                    />
                  )}
                </div>
                <div className="hidden text-center sm:block">
                  <p
                    className={`text-xs font-semibold ${
                      done ? "text-white" : active ? "text-white" : "text-white/30"
                    }`}
                  >
                    {label}
                  </p>
                  <p className="mt-0.5 text-[10px] text-white/25">{sublabel}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 h-1 overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="h-full rounded-full bg-white transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-right font-mono text-xs text-white/35">
        Step {Math.min(currentStep, STEPS.length)} of {STEPS.length}
      </p>
    </div>
  );
}
