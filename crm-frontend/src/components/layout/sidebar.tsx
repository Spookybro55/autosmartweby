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
  Search,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const navigation = [
  { label: "Přehled", href: "/dashboard", icon: LayoutDashboard },
  { label: "Leady", href: "/leads", icon: Users },
  { label: "Pipeline", href: "/pipeline", icon: Kanban },
  { label: "Follow-upy", href: "/follow-ups", icon: Calendar },
  { label: "Scraping", href: "/scrape", icon: Search },
  { label: "Nastavení", href: "/settings", icon: Settings },
  { label: "Analýza", href: "/analytics", icon: BarChart3 },
] as const;

// Inline theme toggle — small enough to live in sidebar.tsx without
// a dedicated file (no new structural component per task spec).
// Reads / writes localStorage; the pre-hydration script in
// app/layout.tsx handles initial paint.
function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  // Lazy initialiser reads from the <html> class set by the pre-hydration
  // script in app/layout.tsx. SSR returns 'dark' (matches the html default
  // className), and `suppressHydrationWarning` on <html> covers the case
  // where the client picked 'light' from localStorage.
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof document === "undefined") return "dark";
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  });

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private mode — fall back to in-memory */
    }
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Přepnout na světlý režim" : "Přepnout na tmavý režim"}
      title={theme === "dark" ? "Světlý režim" : "Tmavý režim"}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium",
        "text-sidebar-foreground/70 hover:text-sidebar-foreground",
        "hover:bg-sidebar-accent transition-colors",
        collapsed && "lg:justify-center lg:px-2"
      )}
    >
      {theme === "dark" ? (
        <Sun className="h-5 w-5 shrink-0" />
      ) : (
        <Moon className="h-5 w-5 shrink-0" />
      )}
      <span
        className={cn(
          "transition-opacity duration-200",
          collapsed && "lg:hidden"
        )}
      >
        {theme === "dark" ? "Světlý režim" : "Tmavý režim"}
      </span>
    </button>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(true);

  return (
    <>
      {/* Mobile overlay trigger */}
      <button
        type="button"
        className="fixed top-4 left-4 z-50 rounded-lg bg-sidebar p-2 text-sidebar-foreground shadow-lg lg:hidden"
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
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-in-out",
          "lg:relative lg:translate-x-0",
          collapsed
            ? "-translate-x-full lg:w-[72px]"
            : "w-[288px] translate-x-0"
        )}
      >
        {/* Brand */}
        <div className="flex h-20 items-center justify-between px-5">
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center gap-3 overflow-hidden",
              collapsed && "lg:justify-center"
            )}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground glow-cyan">
              S
            </div>
            <span
              className={cn(
                "text-xl font-semibold tracking-tight text-sidebar-foreground transition-opacity duration-200",
                collapsed && "lg:hidden"
              )}
            >
              Sales CRM
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden rounded-md p-1.5 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground lg:flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft
              className={cn(
                "h-5 w-5 transition-transform duration-200",
                collapsed && "rotate-180"
              )}
            />
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-2 flex flex-1 flex-col gap-1 px-3">
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
                  "relative group flex items-center gap-3 rounded-xl px-4 py-3 text-base font-medium transition-all duration-150",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground glow-active"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <item.icon
                  className={cn(
                    "h-5 w-5 shrink-0 transition-colors",
                    isActive
                      ? "text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground"
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
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[3px] rounded-r-full bg-primary glow-cyan" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Theme toggle */}
        <div className="px-3 py-2">
          <ThemeToggle collapsed={collapsed} />
        </div>

        {/* User section */}
        <div
          className={cn(
            "border-t border-sidebar-border p-3",
            collapsed && "lg:px-2"
          )}
        >
          <div
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5",
              collapsed && "lg:justify-center lg:px-0"
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-medium text-secondary-foreground">
              JN
            </div>
            <div
              className={cn(
                "flex flex-col overflow-hidden",
                collapsed && "lg:hidden"
              )}
            >
              <span className="truncate text-sm font-medium text-sidebar-foreground">
                Jan Novák
              </span>
              <span className="truncate text-xs text-sidebar-foreground/50">
                Sales Manager
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
