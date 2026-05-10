"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { UserButton } from "@clerk/nextjs";
import {
  FlaskConical,
  LayoutDashboard,
  PlusCircle,
  Clock,
  Settings,
  ChevronLeft,
  ChevronRight,
  Activity,
  LayoutList,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/new", label: "New Audit", icon: PlusCircle },
  { href: "/dashboard/history", label: "Audit History", icon: Clock },
  { href: "/dashboard/analytics", label: "Analytics", icon: Activity },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default function SideNav() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-full w-60 flex-col border-r border-white/[0.08] bg-black">
      <div
        className={`flex h-16 items-center border-b border-white/[0.08] px-4 ${collapsed ? "justify-center" : "gap-2.5"}`}
      >
        <Link
          href="/"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]"
        >
          <FlaskConical size={16} className="text-white/70" />
        </Link>
        {!collapsed && (
          <span className="text-sm font-semibold tracking-tight text-white">
            AuditFlow
          </span>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2 py-4">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 ${
                active
                  ? "border border-white/10 bg-white/[0.08] text-white"
                  : "text-white/45 hover:bg-white/[0.05] hover:text-white/80"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!collapsed && <span className="text-sm font-medium">{label}</span>}
              {!collapsed && active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white" />
              )}
            </Link>
          );
        })}
        <Link
          href="/dashboard/history"
          title={collapsed ? "Audit history" : undefined}
          className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-white/45 transition-all hover:bg-white/[0.05] hover:text-white/80 ${collapsed ? "justify-center" : ""}`}
        >
          <LayoutList size={18} />
          {!collapsed && <span className="text-sm font-medium">All reports</span>}
        </Link>
      </nav>

      <div
        className={`border-t border-white/[0.08] px-3 py-3 ${collapsed ? "flex justify-center" : "flex items-center gap-3 px-4"}`}
      >
        <UserButton
          appearance={{
            elements: {
              avatarBox: "w-8 h-8 ring-1 ring-white/10",
              userButtonPopoverCard:
                "bg-[#111] border border-white/[0.08]",
            },
          }}
        />
        {!collapsed && (
          <span className="truncate text-xs text-white/35">Account</span>
        )}
      </div>

      <div className="border-t border-white/[0.08] p-3">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-white/45 transition-colors hover:bg-white/[0.05] hover:text-white/75 ${collapsed ? "justify-center" : ""}`}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight size={16} />
          ) : (
            <>
              <ChevronLeft size={16} />
              <span className="text-xs font-medium">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
