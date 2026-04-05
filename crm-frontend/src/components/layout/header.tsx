"use client";

import { usePathname, useRouter } from "next/navigation";
import { Bell, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";

const pageTitles: Record<string, string> = {
  "/dashboard": "Přehled",
  "/leads": "Leady",
  "/pipeline": "Pipeline",
  "/follow-ups": "Follow-upy",
};

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];

  // Check prefix matches for nested routes
  for (const [path, title] of Object.entries(pageTitles)) {
    if (pathname.startsWith(path + "/")) return title;
  }

  return "Sales CRM";
}

function getInitials(email: string, name?: string): string {
  if (name) {
    const parts = name.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useSession();
  const title = getPageTitle(pathname);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border bg-white/80 px-6 backdrop-blur-sm">
      {/* Left: Page title (with left padding on mobile for hamburger button) */}
      <div className="pl-12 lg:pl-0">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h1>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {/* Notification dot */}
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-indigo-600" />
        </Button>

        {/* User info */}
        {!loading && user && (
          <div className="ml-2 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-medium text-slate-700">
              {getInitials(user.email, user.name)}
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="text-sm font-medium text-slate-700 truncate max-w-[160px]">
                {user.name || user.email}
              </span>
              {user.name && (
                <span className="text-xs text-slate-400 truncate max-w-[160px]">
                  {user.email}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Odhlásit se"
              title="Odhlásit se"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Fallback while loading */}
        {loading && (
          <div className="ml-2 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 animate-pulse" />
        )}
      </div>
    </header>
  );
}
