'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { TemplateCard } from '@/components/templates/template-card';
import { TemplatesPageSkeleton } from '@/components/templates/templates-page-skeleton';
import {
  DEFAULT_TEMPLATE_KEYS,
  type EmailTemplate,
} from '@/types/templates';
import { toast } from 'sonner';

interface TemplateGroup {
  key: string;
  active: EmailTemplate | null;
  draft: EmailTemplate | null;
  empty: EmailTemplate | null;
}

/**
 * Group raw template list by template_key. Each key has at most one
 * active, one draft, and one empty entry. Archived versions belong to
 * history view (T8) and are filtered out here.
 */
function groupByKey(templates: EmailTemplate[]): TemplateGroup[] {
  const map = new Map<string, TemplateGroup>();

  // Seed with the canonical default keys so empty slots show up even
  // before bootstrap has run on a fresh DB.
  for (const key of DEFAULT_TEMPLATE_KEYS) {
    map.set(key, { key, active: null, draft: null, empty: null });
  }

  for (const t of templates) {
    let group = map.get(t.template_key);
    if (!group) {
      group = { key: t.template_key, active: null, draft: null, empty: null };
      map.set(t.template_key, group);
    }
    if (t.status === 'active') group.active = t;
    else if (t.status === 'draft') group.draft = t;
    else if (t.status === 'empty') group.empty = t;
    // archived: ignore on listing
  }

  // Stable order: DEFAULT_TEMPLATE_KEYS order first, then any custom
  // keys discovered in the data (alphabetical).
  const out: TemplateGroup[] = [];
  for (const key of DEFAULT_TEMPLATE_KEYS) {
    const g = map.get(key);
    if (g) out.push(g);
  }
  const extras: TemplateGroup[] = [];
  for (const [key, g] of map.entries()) {
    if (DEFAULT_TEMPLATE_KEYS.includes(key as typeof DEFAULT_TEMPLATE_KEYS[number])) continue;
    extras.push(g);
  }
  extras.sort((a, b) => (a.key < b.key ? -1 : 1));
  return out.concat(extras);
}

export default function TemplatesListingPage() {
  const [groups, setGroups] = useState<TemplateGroup[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/templates');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const templates: EmailTemplate[] = data.templates ?? [];
      setGroups(groupByKey(templates));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Chyba načítání';
      setError(msg);
      toast.error('Šablony se nepodařilo načíst');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  return (
    <div className="container mx-auto max-w-5xl p-6">
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Zpět na nastavení
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Šablony emailů</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Spravuj texty, které se posílají leadům. Změna textu vytvoří novou verzi —
          předchozí verze zůstávají v historii.
        </p>
      </div>

      {loading && <TemplatesPageSkeleton />}

      {!loading && error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Chyba načítání</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <button
            onClick={fetchTemplates}
            className="mt-3 text-sm font-medium text-primary hover:underline"
          >
            Zkusit znovu
          </button>
        </div>
      )}

      {!loading && !error && groups && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {groups.map((g) => (
            <TemplateCard key={g.key} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}
