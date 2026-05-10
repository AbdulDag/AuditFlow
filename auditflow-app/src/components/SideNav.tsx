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
    <aside
      className={`fixed left-0 top-0 h-full bg-[#0D0D0D] border-r border-[#1E1E1E] z-40 flex flex-col transition-all duration-300 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Logo */}
      <div className={`h-16 flex items-center border-b border-[#1E1E1E] px-4 ${collapsed ? "justify-center" : "gap-2.5"}`}>
        <div className="w-8 h-8 rounded-lg bg-[#F5C518]/10 border border-[#F5C518]/30 flex items-center justify-center flex-shrink-0">
          <FlaskConical size={16} className="text-[#F5C518]" />
        </div>
        {!collapsed && (
          <span className="font-bold text-white tracking-tight text-sm">
            AuditFlow
          </span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-4 px-2 flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 cursor-pointer group ${
                active
                  ? "bg-[#F5C518]/10 text-[#F5C518] border border-[#F5C518]/20"
                  : "text-[#6B7280] hover:text-[#9CA3AF] hover:bg-[#1E1E1E]"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!collapsed && <span className="text-sm font-medium">{label}</span>}
              {!collapsed && active && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#F5C518]" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User button from Clerk */}
      <div className={`px-3 py-3 border-t border-[#1E1E1E] ${collapsed ? "flex justify-center" : "flex items-center gap-3 px-4"}`}>
        <UserButton
          appearance={{
            elements: {
              avatarBox: "w-8 h-8",
              userButtonPopoverCard: "bg-[#111111] border border-[#1E1E1E]",
            },
          }}
        />
        {!collapsed && (
          <span className="text-xs text-[#4B5563] truncate">Account</span>
        )}
      </div>

      {/* Collapse button */}
      <div className="p-3 border-t border-[#1E1E1E]">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-[#6B7280] hover:text-[#9CA3AF] hover:bg-[#1E1E1E] transition-all duration-200 cursor-pointer ${
            collapsed ? "justify-center" : ""
          }`}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={16} /> : (
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
