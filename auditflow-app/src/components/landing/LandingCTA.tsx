import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export default function LandingCTA() {
  return (
    <section className="py-24 px-6 border-t border-[#1E1E1E] bg-[#0D0D0D]">
      <div className="max-w-3xl mx-auto text-center">
        <p className="text-xs font-semibold text-[#F5C518] uppercase tracking-widest mb-4">
          Ready to verify?
        </p>
        <h2 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-6">
          Audit your first paper<br />
          <span className="text-[#F5C518]">in under 5 minutes.</span>
        </h2>
        <p className="text-[#6B7280] text-lg mb-10 leading-relaxed max-w-xl mx-auto">
          No configuration required. Paste an arXiv ID and AuditFlow handles extraction, execution, and scoring.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-8 py-4 bg-[#F5C518] text-black font-extrabold rounded-xl hover:bg-[#D4AC15] transition-colors duration-150 cursor-pointer text-sm"
        >
          Start Auditing for Free
          <ArrowUpRight size={16} />
        </Link>
      </div>
    </section>
  );
}
