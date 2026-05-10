"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";

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

          <div className="hidden items-center gap-2 md:flex">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="cursor-pointer px-4 py-2 text-sm font-medium text-white/55 transition-colors hover:text-white"
                >
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button
                  type="button"
                  className="cursor-pointer rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/90"
                >
                  Sign up
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "h-8 w-8 ring-1 ring-white/10",
                  },
                }}
              />
            </Show>
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
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button type="button" className="text-left text-sm text-white/65">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button
                  type="button"
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
                >
                  Sign up
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </div>
        )}
      </nav>
    </div>
  );
}
