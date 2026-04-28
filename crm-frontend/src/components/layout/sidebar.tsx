"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Kanban,
  Calendar,
  ChevronLeft,
  Menu,
  Settings,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const navigation = [
  { label: "Přehled", href: "/dashboard", icon: LayoutDashboard },
  { label: "Leady", href: "/leads", icon: Users },
  { label: "Pipeline", href: "/pipeline", icon: Kanban },
  { label: "Follow-upy", href: "/follow-ups", icon: Calendar },
  { label: "Nastavení", href: "/settings", icon: Settings },
  { label: "Analýza", href: "/analytics", icon: BarChart3 },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(true);

  return (
    <>
      {/* Mobile overlay trigger */}
      <button
        type="button"
        className="fixed top-4 left-4 z-50 rounded-lg bg-slate-900 p-2 text-white shadow-lg lg:hidden"
        onClick={() => setCollapsed(!collapsed)}
        aria-label="Toggle navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile backdrop */}
      {!collapsed && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setCollapsed(true)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-800 bg-slate-950 transition-all duration-300 ease-in-out",
          "lg:relative lg:translate-x-0",
          collapsed
            ? "-translate-x-full lg:w-[68px]"
            : "w-[240px] translate-x-0"
        )}
      >
        {/* Brand */}
        <div className="flex h-16 items-center justify-between px-4">
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center gap-2.5 overflow-hidden",
              collapsed && "lg:justify-center"
            )}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white text-sm">
              S
            </div>
            <span
              className={cn(
                "text-lg font-semibold tracking-tight text-white transition-opacity duration-200",
                collapsed && "lg:hidden"
              )}
            >
              Sales CRM
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white lg:flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft
              className={cn(
                "h-4 w-4 transition-transform duration-200",
                collapsed && "rotate-180"
              )}
            />
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-4 flex flex-1 flex-col gap-1 px-3">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  // Close mobile menu on navigation
                  if (window.innerWidth < 1024) setCollapsed(true);
                }}
                className={cn(
                  "relative group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-indigo-600/15 text-indigo-400"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                )}
              >
                <item.icon
                  className={cn(
                    "h-5 w-5 shrink-0 transition-colors",
                    isActive
                      ? "text-indigo-400"
                      : "text-slate-500 group-hover:text-white"
                  )}
                />
                <span
                  className={cn(
                    "truncate transition-opacity duration-200",
                    collapsed && "lg:hidden"
                  )}
                >
                  {item.label}
                </span>
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full bg-indigo-500" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div
          className={cn(
            "border-t border-slate-800 p-3",
            collapsed && "lg:px-2"
          )}
        >
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5",
              collapsed && "lg:justify-center lg:px-0"
            )}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-medium text-white">
              JN
            </div>
            <div
              className={cn(
                "flex flex-col overflow-hidden",
                collapsed && "lg:hidden"
              )}
            >
              <span className="truncate text-sm font-medium text-white">
                Jan Novák
              </span>
              <span className="truncate text-xs text-slate-500">
                Sales Manager
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
