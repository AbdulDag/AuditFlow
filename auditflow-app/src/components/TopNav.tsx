"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { href: "/", label: "Marketing" },
  { href: "/#features", label: "Features" },
  { href: "/dashboard", label: "Dashboard" },
];

export default function TopNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed left-60 right-0 top-0 z-30 flex flex-col border-b border-white/[0.08] bg-black/80 backdrop-blur-xl">
      <nav>
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="cursor-pointer rounded-md px-4 py-1.5 text-sm text-white/50 transition-colors hover:text-white"
              >
                {label}
              </Link>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="cursor-pointer p-2 text-white/55 hover:text-white md:hidden"
            aria-label="Toggle menu"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {open && (
          <div className="flex flex-col gap-3 border-t border-white/[0.08] px-6 py-4 md:hidden">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="text-sm text-white/65 hover:text-white"
              >
                {label}
              </Link>
            ))}
          </div>
        )}
      </nav>
    </div>
  );
}
