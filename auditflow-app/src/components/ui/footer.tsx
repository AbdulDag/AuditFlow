"use client";

import { ExternalLink } from "lucide-react";

export const Footer = () => {
  return (
    <footer className="w-full border-t border-white/[0.06] px-5 py-14 sm:px-8 md:px-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">

          <div className="max-w-xs">
            <div className="mb-3">
              <span className="font-mono text-sm font-semibold tracking-widest text-white uppercase">
                AuditFlow
              </span>
            </div>
            <p className="text-xs leading-relaxed text-white/30">
              The first deterministic reproducibility auditor for ML research.
              Built on Azure AI, Docker, and FastAPI.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-10">
            {[
              {
                heading: "Product",
                links: [
                  { label: "How It Works", href: "/#how-it-works" },
                  { label: "Scorecard", href: "/#scorecard" },
                  { label: "Features", href: "/#features" },
                  { label: "Dashboard", href: "/dashboard" },
                ],
              },
              {
                heading: "Research",
                links: [
                  { label: "R-Index Formula", href: "/#scorecard" },
                  { label: "Comparison Mode", href: "#" },
                  { label: "API Docs", href: "#" },
                  { label: "Changelog", href: "#" },
                ],
              },
              {
                heading: "Stack",
                links: [
                  { label: "Azure AI", href: "https://azure.microsoft.com/products/ai-services" },
                  { label: "Docker SDK", href: "https://docs.docker.com/engine/api/" },
                  { label: "FastAPI", href: "https://fastapi.tiangolo.com" },
                  { label: "Next.js", href: "https://nextjs.org" },
                ],
              },
            ].map((col) => (
              <div key={col.heading}>
                <div className="mb-3 font-mono text-[9px] font-semibold tracking-[0.2em] text-white/20 uppercase">
                  {col.heading}
                </div>
                <ul className="space-y-2">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-[12px] text-white/35 transition-colors hover:text-white/70"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-start justify-between gap-2 border-t border-white/[0.05] pt-6 text-[11px] text-white/20 sm:flex-row sm:items-center">
          <span>© 2026 AuditFlow. Science should be reproducible.</span>
          <a
            href="https://azure.microsoft.com"
            className="inline-flex items-center gap-1 transition-colors hover:text-white/40"
          >
            Powered by Azure AI <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      </div>
    </footer>
  );
};
