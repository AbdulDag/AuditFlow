import Link from "next/link";
import { ArrowUpRight, ScanLine, Container, Braces, GitBranch, BarChart3, ShieldCheck } from "lucide-react";

const FEATURES = [
  {
    icon: ScanLine,
    title: "Layout-Aware OCR",
    subtitle: "Precise Extraction",
    description:
      "Multi-column PDF parser understands figure captions, table structures, and inline code — extracting exactly what matters.",
  },
  {
    icon: Container,
    title: "Dynamic Docker Sandboxing",
    subtitle: "Isolated Execution",
    description:
      "Every audit runs in a fresh, isolated Docker container. No environment contamination. No shared state. Pure reproducibility.",
  },
  {
    icon: Braces,
    title: "Zero-Hallucination Extraction",
    subtitle: "Deterministic Results",
    description:
      "Code extraction without LLM guessing. Every line is traceable to its source paragraph in the original paper.",
  },
  {
    icon: GitBranch,
    title: "Dependency Resolution",
    subtitle: "Full Package Coverage",
    description:
      "Resolves Python, R, and Julia packages via PyPI, CRAN, and Conda. Flags version conflicts with actionable diagnostics.",
  },
  {
    icon: BarChart3,
    title: "R-Index Scoring",
    subtitle: "Composable Metric",
    description:
      "Reproducibility Index combining environment fidelity, dependency coverage, execution success, and artifact matching.",
  },
  {
    icon: ShieldCheck,
    title: "Verified Artifacts",
    subtitle: "Output Matching",
    description:
      "Compares generated figures, tables, and model weights against claimed results using perceptual hashing and numeric diff.",
  },
];

export default function FeatureGrid() {
  return (
    <section id="features" className="py-20 px-6 bg-[#0D0D0D]">
      <div className="max-w-7xl mx-auto">
        {/* Section header */}
        <div className="mb-12">
          <p className="text-xs font-semibold text-[#F5C518] uppercase tracking-widest mb-3">
            Core Capabilities
          </p>
          <h2 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight max-w-xl">
            Built for the complexity<br />
            <span className="text-[#6B7280]">science demands.</span>
          </h2>
        </div>

        {/* Feature cards — equal 3-col, FutureTech style */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, subtitle, description }) => (
            <div
              key={title}
              className="group relative bg-[#161616] rounded-2xl p-6 flex flex-col gap-4 hover:bg-[#1A1A1A] transition-colors duration-200 cursor-default"
            >
              {/* Icon container */}
              <div className="w-12 h-12 rounded-xl bg-[#0D0D0D] flex items-center justify-center flex-shrink-0">
                <Icon size={20} className="text-[#6B7280] group-hover:text-[#9CA3AF] transition-colors" />
              </div>

              {/* Text */}
              <div className="flex-1">
                <p className="text-white font-bold text-sm mb-0.5">{title}</p>
                <p className="text-[#6B7280] text-xs mb-3">{subtitle}</p>
                <p className="text-[#6B7280] text-sm leading-relaxed">{description}</p>
              </div>

              {/* Arrow button — yellow circle, bottom-right */}
              <div className="flex justify-end mt-auto pt-2">
                <Link
                  href="/dashboard"
                  className="w-9 h-9 rounded-full bg-[#F5C518] flex items-center justify-center hover:bg-[#D4AC15] transition-colors duration-150 cursor-pointer flex-shrink-0"
                  aria-label={`Learn more about ${title}`}
                >
                  <ArrowUpRight size={16} className="text-black" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
