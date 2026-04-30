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
  ShieldCheck,
  Sun,
  Moon,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { ASSIGNEE_NAMES } from "@/lib/config";

// Resolve display name + avatar initials for the bottom user section.
// Known email → ASSIGNEE_NAMES lookup. Orphan email (validated by auth
// but not in the assignee roster — happens when a former allowed user
// is removed from the map) → local-part as name + first 2 chars of
// local-part as initials. The full email is rendered as the second
// row regardless, so the user can self-diagnose roster drift.
function deriveUserDisplay(email: string): { name: string; initials: string } {
  const lower = email.toLowerCase().trim();
  const known = ASSIGNEE_NAMES[lower];
  if (known) {
    const parts = known.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
    return { name: known, initials: (first + last).toUpperCase() };
  }
  const local = lower.split("@")[0] ?? lower;
  if (!local) {
    return { name: lower, initials: lower.slice(0, 2).toUpperCase() };
  }
  return {
    name: local.charAt(0).toUpperCase() + local.slice(1),
    initials: local.slice(0, 2).toUpperCase(),
  };
}

const navigation = [
  { label: "Přehled", href: "/dashboard", icon: LayoutDashboard },
  { label: "Leady", href: "/leads", icon: Users },
  { label: "Pipeline", href: "/pipeline", icon: Kanban },
  { label: "Follow-upy", href: "/follow-ups", icon: Calendar },
  { label: "Scraping", href: "/scrape", icon: Search },
  { label: "Nastavení", href: "/settings", icon: Settings },
  { label: "Analýza", href: "/analytics", icon: BarChart3 },
] as const;

// Admin-only nav item — appended at runtime when current user matches
// NEXT_PUBLIC_OWNER_EMAIL. Server-side middleware also enforces this gate;
// hiding the link is purely UX (no point teasing a 4xx redirect).
const ADMIN_NAV = {
  label: "Dev Team",
  href: "/admin/dev-team",
  icon: ShieldCheck,
} as const;

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
  const { email: currentEmail, loading: userLoading } = useCurrentUser();

  const ownerEmail = process.env.NEXT_PUBLIC_OWNER_EMAIL?.toLowerCase().trim();
  const isOwner = !!ownerEmail && currentEmail?.toLowerCase().trim() === ownerEmail;
  const navItems = isOwner ? [...navigation, ADMIN_NAV] : navigation;

  const userDisplay = currentEmail ? deriveUserDisplay(currentEmail) : null;

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
          {navItems.map((item) => {
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

        {/* User section — wired to /api/auth/me via useCurrentUser.
            Hidden entirely when unauthenticated (middleware would have
            redirected, this is just a safety branch). */}
        {(userLoading || userDisplay) && (
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
              {userLoading ? (
                <>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground/60">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                  <div
                    className={cn(
                      "flex flex-col gap-1.5 overflow-hidden",
                      collapsed && "lg:hidden"
                    )}
                  >
                    <span className="h-3 w-24 rounded bg-sidebar-accent/40 animate-pulse" />
                    <span className="h-2.5 w-32 rounded bg-sidebar-accent/30 animate-pulse" />
                  </div>
                </>
              ) : userDisplay ? (
                <>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-medium text-secondary-foreground">
                    {userDisplay.initials}
                  </div>
                  <div
                    className={cn(
                      "flex flex-col overflow-hidden",
                      collapsed && "lg:hidden"
                    )}
                  >
                    <span className="truncate text-sm font-medium text-sidebar-foreground">
                      {userDisplay.name}
                    </span>
                    <span className="truncate text-xs text-sidebar-foreground/50">
                      {currentEmail}
                    </span>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
