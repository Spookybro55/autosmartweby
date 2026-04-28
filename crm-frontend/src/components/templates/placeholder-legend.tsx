'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { PLACEHOLDER_LEGEND } from '@/lib/templates/render-preview';

interface Props {
  unknownPlaceholders: string[];
}

export function PlaceholderLegend({ unknownPlaceholders }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string>('');

  function copy(name: string) {
    navigator.clipboard.writeText(`{${name}}`).then(() => {
      setCopied(name);
      setTimeout(() => setCopied(''), 1200);
    }).catch(() => {});
  }

  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      {unknownPlaceholders.length > 0 && (
        <div className="mb-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          <strong>Neznámé placeholdery:</strong> {unknownPlaceholders.map((p) => `{${p}}`).join(', ')}
          <span className="ml-1 opacity-80">— vyrenderují se jako prázdné</span>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <span>Dostupné placeholdery ({PLACEHOLDER_LEGEND.length})</span>
        {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      </button>

      {open && (
        <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {PLACEHOLDER_LEGEND.map((p) => (
            <button
              key={p.name}
              onClick={() => copy(p.name)}
              className="group flex items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-background"
              title={p.description}
            >
              <span className="font-mono text-foreground">{`{${p.name}}`}</span>
              {copied === p.name ? (
                <Check className="size-3 text-green-500" />
              ) : (
                <Copy className="size-3 opacity-0 group-hover:opacity-50" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
