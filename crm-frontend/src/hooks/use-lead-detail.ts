'use client';

import { useState, useCallback } from 'react';
import type { Lead } from '@/lib/domain/lead';

export function useLeadDetail() {
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLead = useCallback(async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      setLead(null);
      const res = await fetch(`/api/leads/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLead(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch lead');
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setLead(null);
    setError(null);
  }, []);

  return { lead, loading, error, fetchLead, clear };
}
