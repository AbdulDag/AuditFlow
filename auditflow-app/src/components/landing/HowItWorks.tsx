import { Upload, Search, Container, PlayCircle, Award } from "lucide-react";

const STEPS = [
  { step: "01", icon: Upload, title: "Submit Paper", description: "Paste an arXiv ID or upload a PDF. AuditFlow fetches and pre-processes the document." },
  { step: "02", icon: Search, title: "Extract & Parse", description: "Layout-aware OCR identifies code snippets, figures, and equations with structural precision." },
  { step: "03", icon: Container, title: "Resolve & Build", description: "Dependency engine resolves all packages. A fresh Docker image is constructed." },
  { step: "04", icon: PlayCircle, title: "Execute in Sandbox", description: "Code runs inside an isolated container. Logs stream live to your browser." },
  { step: "05", icon: Award, title: "Score & Report", description: "R-Index is computed across four dimensions and a detailed scorecard is generated." },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 px-6 border-t border-[#1E1E1E] bg-[#0D0D0D]">
      <div className="max-w-7xl mx-auto">
        <div className="mb-12">
          <p className="text-xs font-semibold text-[#F5C518] uppercase tracking-widest mb-3">Pipeline</p>
          <h2 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
            From paper to verdict<br />
            <span className="text-[#6B7280]">in minutes.</span>
          </h2>
        </div>

        <div className="relative">
          {/* Connector */}
          <div className="hidden md:block absolute top-8 left-[8%] right-[8%] h-px bg-[#1E1E1E]" />
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
            {STEPS.map(({ step, icon: Icon, title, description }, i) => (
              <div key={step} className="flex flex-col items-start md:items-center text-left md:text-center">
                <div className="relative z-10 w-16 h-16 rounded-2xl bg-[#161616] border border-[#2A2A2A] flex items-center justify-center mb-4 flex-shrink-0">
                  <Icon size={20} className="text-[#9CA3AF]" />
                  <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[#F5C518] flex items-center justify-center text-[9px] font-extrabold text-black">
                    {i + 1}
                  </span>
                </div>
                <p className="text-[10px] font-mono text-[#6B7280] mb-1">{step}</p>
                <h3 className="text-sm font-bold text-white mb-1">{title}</h3>
                <p className="text-xs text-[#6B7280] leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
