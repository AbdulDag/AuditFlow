"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/#features", label: "Features" },
  { href: "/dashboard", label: "Dashboard" },
];

export default function TopNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex flex-col">
      {/* Announcement bar */}
      <div className="bg-[#161616] border-b border-[#2A2A2A] py-2 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
          <p className="text-xs text-[#9CA3AF]">
            Subscribe to our Newsletter for new audit alerts &amp; reproducibility insights
          </p>
          <ArrowUpRight size={12} className="text-[#F5C518] flex-shrink-0" />
        </div>
      </div>

      {/* Main nav */}
      <nav className="bg-[#0D0D0D]/95 backdrop-blur-xl border-b border-[#1E1E1E]">
        <div className="max-w-7xl mx-auto px-6 h-[60px] flex items-center justify-between">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="15" stroke="#F5C518" strokeWidth="1.5" />
              <path d="M10 16c0-4 2.5-7 6-7s6 3 6 7" stroke="#F5C518" strokeWidth="1.5" strokeLinecap="round" fill="none" />
              <path d="M22 16c0 4-2.5 7-6 7s-6-3-6-7" stroke="#F5C518" strokeWidth="1.5" strokeLinecap="round" fill="none" />
              <circle cx="16" cy="16" r="2" fill="#F5C518" />
            </svg>
            <span className="font-bold text-[#FFFFFF] text-[15px] tracking-tight">AuditFlow</span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="px-4 py-1.5 rounded-md text-sm text-[#9CA3AF] hover:text-white transition-colors duration-150 cursor-pointer"
              >
                {label}
              </Link>
            ))}
          </div>

          {/* Auth area */}
          <div className="hidden md:flex items-center gap-2">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="px-4 py-2 text-sm font-semibold text-[#9CA3AF] hover:text-white transition-colors duration-150 cursor-pointer">
                  Sign In
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="px-5 py-2 bg-[#F5C518] text-black text-sm font-bold rounded-lg hover:bg-[#D4AC15] transition-colors duration-150 cursor-pointer">
                  Sign Up
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <UserButton
                appearance={{
                  elements: { avatarBox: "w-8 h-8" },
                }}
              />
            </Show>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setOpen(!open)}
            className="md:hidden p-2 text-[#9CA3AF] hover:text-white cursor-pointer"
            aria-label="Toggle menu"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="md:hidden border-t border-[#1E1E1E] bg-[#0D0D0D] px-6 py-4 flex flex-col gap-3">
            {NAV_LINKS.map(({ href, label }) => (
              <Link key={href} href={href} onClick={() => setOpen(false)} className="text-sm text-[#9CA3AF] hover:text-white">
                {label}
              </Link>
            ))}
            <div className="flex gap-2 mt-2">
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <button className="flex-1 py-2.5 border border-[#1E1E1E] text-[#9CA3AF] text-sm font-semibold rounded-lg cursor-pointer">
                    Sign In
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="flex-1 py-2.5 bg-[#F5C518] text-black text-sm font-bold rounded-lg cursor-pointer">
                    Sign Up
                  </button>
                </SignUpButton>
              </Show>
              <Show when="signed-in">
                <UserButton />
              </Show>
            </div>
          </div>
        )}
      </nav>
    </div>
  );
}
