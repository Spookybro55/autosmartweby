"use client";

import { useEffect, useState } from "react";

// KROK 5: Client-side hook that fetches /api/auth/me once on mount.
// Returns the lowercased email of the logged-in user (or null while
// loading / unauthenticated). Used to drive "Mé leady" filter default
// and assignee labels.
export function useCurrentUser(): { email: string | null; loading: boolean } {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : { email: null }))
      .then((d: { email: string | null }) => {
        if (!cancelled) setEmail(d.email);
      })
      .catch(() => {
        if (!cancelled) setEmail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { email, loading };
}
