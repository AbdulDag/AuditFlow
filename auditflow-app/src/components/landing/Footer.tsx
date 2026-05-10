import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-[#1E1E1E] py-10 px-6 bg-[#0D0D0D]">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="15" stroke="#F5C518" strokeWidth="1.5" />
            <path d="M10 16c0-4 2.5-7 6-7s6 3 6 7" stroke="#F5C518" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            <path d="M22 16c0 4-2.5 7-6 7s-6-3-6-7" stroke="#F5C518" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            <circle cx="16" cy="16" r="2" fill="#F5C518" />
          </svg>
          <span className="font-bold text-[#9CA3AF] text-sm">AuditFlow</span>
        </div>

        <p className="text-xs text-[#6B7280]">
          © 2026 AuditFlow. Reproducibility Intelligence Platform.
        </p>

        <div className="flex items-center gap-6">
          {[["/#features", "Features"], ["/#how-it-works", "Pipeline"], ["/dashboard", "Dashboard"], ["/scorecard", "Scorecard"]].map(([href, label]) => (
            <Link key={href} href={href} className="text-xs text-[#6B7280] hover:text-[#9CA3AF] transition-colors">
              {label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
