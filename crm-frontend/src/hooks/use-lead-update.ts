'use client';

import { useState, useCallback, useRef } from 'react';
import type { LeadEditableFields } from '@/lib/domain/lead';

export function useLeadUpdate() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const updateLead = useCallback(
    async (id: string, fields: Partial<LeadEditableFields>): Promise<boolean> => {
      // Double submit protection
      if (submittingRef.current) return false;
      submittingRef.current = true;

      try {
        setSaving(true);
        setError(null);

        const res = await fetch(`/api/leads/${encodeURIComponent(id)}/update`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error ?? 'Update failed');
        }

        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Update failed';
        setError(msg);
        return false;
      } finally {
        setSaving(false);
        submittingRef.current = false;
      }
    },
    []
  );

  return { updateLead, saving, error };
}
