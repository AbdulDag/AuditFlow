import { Check, FileText, Package, Container, PlayCircle, Award } from "lucide-react";

const STEPS = [
  { label: "PDF Extraction", sublabel: "OCR + code parsing", icon: FileText },
  { label: "Dependency Resolution", sublabel: "PyPI / Conda resolve", icon: Package },
  { label: "Docker Build", sublabel: "Image construction", icon: Container },
  { label: "Execution", sublabel: "Sandbox run", icon: PlayCircle },
  { label: "Score & Report", sublabel: "R-Index generation", icon: Award },
];

interface Props {
  currentStep: number;
  status: "idle" | "running" | "complete" | "error";
  paperId: string;
}

export default function PipelineStepper({ currentStep, status, paperId }: Props) {
  return (
    <div className="rounded-2xl border border-[#1E1E1E] bg-[#111111] p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-bold text-white">Pipeline Status</h2>
          <p className="text-xs font-mono text-[#4B5563] mt-0.5">{paperId}</p>
        </div>
        <span
          className={`text-xs font-bold px-3 py-1 rounded-full border ${
            status === "complete"
              ? "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20"
              : status === "error"
              ? "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20"
              : "bg-[#F5C518]/10 text-[#F5C518] border-[#F5C518]/20"
          }`}
        >
          {status === "complete" ? "Complete" : status === "error" ? "Failed" : "Running"}
        </span>
      </div>

      {/* Steps */}
      <div className="relative">
        {/* Connector track */}
        <div className="absolute top-5 left-5 right-5 h-px bg-[#1E1E1E]" />
        {/* Progress fill */}
        <div
          className="absolute top-5 left-5 h-px bg-[#F5C518]/60 transition-all duration-700"
          style={{ width: `${Math.min((currentStep / STEPS.length) * 100, 100) * (1 - 10 / 100)}%` }}
        />

        <div className="flex justify-between relative z-10">
          {STEPS.map(({ label, sublabel, icon: Icon }, i) => {
            const done = currentStep > i;
            const active = currentStep === i && status === "running";

            return (
              <div key={label} className="flex flex-col items-center gap-2 flex-1">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500 ${
                    done
                      ? "bg-[#22C55E]/15 border border-[#22C55E]/40"
                      : active
                      ? "bg-[#F5C518]/15 border border-[#F5C518]/40"
                      : "bg-[#0D0D0D] border border-[#1E1E1E]"
                  }`}
                >
                  {done ? (
                    <Check size={16} className="text-[#22C55E]" />
                  ) : (
                    <Icon size={16} className={active ? "text-[#F5C518]" : "text-[#4B5563]"} />
                  )}
                </div>
                <div className="text-center hidden sm:block">
                  <p className={`text-xs font-semibold ${done ? "text-white" : active ? "text-[#F5C518]" : "text-[#4B5563]"}`}>
                    {label}
                  </p>
                  <p className="text-[10px] text-[#4B5563]/70 mt-0.5">{sublabel}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-6 h-1 rounded-full bg-[#1E1E1E] overflow-hidden">
        <div
          className="h-full bg-[#F5C518] rounded-full transition-all duration-700"
          style={{ width: `${(currentStep / STEPS.length) * 100}%` }}
        />
      </div>
      <p className="text-xs text-[#4B5563] mt-2 text-right font-mono">
        Step {Math.min(currentStep, STEPS.length)} of {STEPS.length}
      </p>
    </div>
  );
}
