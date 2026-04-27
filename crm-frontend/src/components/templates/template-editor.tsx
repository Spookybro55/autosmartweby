'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, History, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

import { TemplatePreviewPane } from './template-preview-pane';
import { PlaceholderLegend } from './placeholder-legend';
import { PublishDialog } from './publish-dialog';
import { HistoryDrawer } from './history-drawer';

import { renderPreview } from '@/lib/templates/render-preview';
import { SAMPLE_LEADS } from '@/lib/templates/sample-leads';
import {
  TEMPLATE_KEY_LABELS,
  type EmailTemplate,
} from '@/types/templates';

interface Props {
  templateKey: string;
}

interface EditorState {
  subject: string;
  body: string;
  name: string;
  description: string;
}

const EMPTY_STATE: EditorState = { subject: '', body: '', name: '', description: '' };

function toState(t: EmailTemplate | null): EditorState {
  if (!t) return EMPTY_STATE;
  return {
    subject: t.subject_template,
    body: t.body_template,
    name: t.name,
    description: t.description,
  };
}

function isDirty(a: EditorState, b: EditorState): boolean {
  return (
    a.subject !== b.subject ||
    a.body !== b.body ||
    a.name !== b.name ||
    a.description !== b.description
  );
}

export function TemplateEditor({ templateKey }: Props) {
  const [active, setActive] = useState<EmailTemplate | null>(null);
  const [draft, setDraft] = useState<EmailTemplate | null>(null);
  const [editor, setEditor] = useState<EditorState>(EMPTY_STATE);
  const [baseline, setBaseline] = useState<EditorState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState(SAMPLE_LEADS[0].id);

  const label = TEMPLATE_KEY_LABELS[templateKey] ?? templateKey;
  const dirty = isDirty(editor, baseline);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [activeRes, draftRes] = await Promise.all([
        fetch(`/api/templates/${encodeURIComponent(templateKey)}`),
        fetch(`/api/templates/${encodeURIComponent(templateKey)}/draft`),
      ]);

      let activeData: EmailTemplate | null = null;
      if (activeRes.ok) {
        const data = await activeRes.json();
        activeData = data.template ?? null;
      } else if (activeRes.status !== 404) {
        const data = await activeRes.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${activeRes.status}`);
      }

      let draftData: EmailTemplate | null = null;
      if (draftRes.ok) {
        const data = await draftRes.json();
        draftData = data.draft ?? null;
      }

      setActive(activeData);
      setDraft(draftData);
      const initial = toState(draftData ?? activeData);
      setEditor(initial);
      setBaseline(initial);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Chyba načítání';
      toast.error(`Nepodařilo se načíst šablonu: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [templateKey]);

  useEffect(() => {
    load();
  }, [load]);

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  async function handleSaveDraft() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/templates/${encodeURIComponent(templateKey)}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: editor.subject,
          body: editor.body,
          name: editor.name,
          description: editor.description,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = String(data.error ?? '');
        const msg =
          code === 'subject_too_long' ? 'Předmět je příliš dlouhý (max 500 znaků).' :
          code === 'body_too_long' ? 'Tělo je příliš dlouhé (max 50 000 znaků).' :
          code === 'unknown_key' ? 'Neznámý template key.' :
          code || 'Uložení selhalo.';
        toast.error(msg);
        return;
      }
      const saved: EmailTemplate = data.draft;
      setDraft(saved);
      const newBaseline = toState(saved);
      setEditor(newBaseline);
      setBaseline(newBaseline);
      toast.success('Draft uložen');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Chyba při ukládání');
    } finally {
      setSaving(false);
    }
  }

  async function handleDiscard() {
    if (discarding) return;
    if (!draft) {
      const reset = toState(active);
      setEditor(reset);
      setBaseline(reset);
      return;
    }
    if (!confirm('Opravdu zahodit rozpracovaný draft? Tato akce je nevratná.')) return;
    setDiscarding(true);
    try {
      const res = await fetch(`/api/templates/${encodeURIComponent(templateKey)}/draft`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? 'Zahození selhalo');
        return;
      }
      setDraft(null);
      const reset = toState(active);
      setEditor(reset);
      setBaseline(reset);
      toast.success('Draft zahozen');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Chyba');
    } finally {
      setDiscarding(false);
    }
  }

  function handlePublishSuccess(newActive: EmailTemplate) {
    setActive(newActive);
    setDraft(null);
    const reset = toState(newActive);
    setEditor(reset);
    setBaseline(reset);
    toast.success(`v${newActive.version} publikováno`);
  }

  const canPublish = editor.subject.trim().length > 0 && editor.body.trim().length > 0;
  const previewRender = renderPreview({
    subject_template: editor.subject,
    body_template: editor.body,
    lead: SAMPLE_LEADS.find((l) => l.id === selectedLeadId) ?? SAMPLE_LEADS[0],
  });

  return (
    <div className="container mx-auto max-w-7xl p-6">
      <Link
        href="/settings/templates"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Zpět na šablony
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{templateKey}</p>
          <h1 className="text-2xl font-semibold">{label}</h1>
          {active && (
            <p className="mt-1 text-sm text-muted-foreground">
              Aktivní verze: v{active.version} · {active.name}
            </p>
          )}
          {!active && !loading && (
            <p className="mt-1 text-sm italic text-muted-foreground">
              Zatím žádná publikovaná verze. Vytvoř první draft a publikuj.
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
          <History className="mr-1 size-4" />
          Historie
        </Button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Načítám…
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Editor side */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="tpl-name">Název (interní)</Label>
              <Input
                id="tpl-name"
                value={editor.name}
                onChange={(e) => setEditor((s) => ({ ...s, name: e.target.value }))}
                placeholder="No website — initial outreach"
              />
            </div>
            <div>
              <Label htmlFor="tpl-desc">Popis (komu se posílá)</Label>
              <Input
                id="tpl-desc"
                value={editor.description}
                onChange={(e) => setEditor((s) => ({ ...s, description: e.target.value }))}
                placeholder="První oslovení firem bez webu…"
              />
            </div>
            <div>
              <Label htmlFor="tpl-subject">Předmět</Label>
              <Input
                id="tpl-subject"
                value={editor.subject}
                onChange={(e) => setEditor((s) => ({ ...s, subject: e.target.value }))}
                placeholder="Dotaz k vašemu webu {business_name}"
                maxLength={500}
              />
            </div>
            <div>
              <Label htmlFor="tpl-body">Tělo</Label>
              <Textarea
                id="tpl-body"
                value={editor.body}
                onChange={(e) => setEditor((s) => ({ ...s, body: e.target.value }))}
                placeholder={'Dobrý den,\n\n…'}
                className="min-h-80 font-mono text-sm"
              />
            </div>

            <PlaceholderLegend unknownPlaceholders={previewRender.unknownPlaceholders} />

            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Button
                variant="ghost"
                onClick={handleDiscard}
                disabled={discarding || (!dirty && !draft)}
              >
                {discarding && <Loader2 className="mr-2 size-4 animate-spin" />}
                Zahodit změny
              </Button>
              <Button variant="outline" onClick={handleSaveDraft} disabled={saving || !dirty}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Uložit draft
              </Button>
              <Button onClick={() => setPublishOpen(true)} disabled={!canPublish}>
                Publikovat…
              </Button>
              {dirty && (
                <span className="text-xs text-amber-700 dark:text-amber-400">
                  Neuložené změny
                </span>
              )}
            </div>
          </div>

          {/* Preview side */}
          <div className="space-y-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Náhled</p>
            <TemplatePreviewPane
              subject={editor.subject}
              body={editor.body}
              selectedLeadId={selectedLeadId}
              onLeadChange={setSelectedLeadId}
            />
          </div>
        </div>
      )}

      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        templateKey={templateKey}
        currentActive={active}
        onPublishSuccess={handlePublishSuccess}
      />

      <HistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        templateKey={templateKey}
      />
    </div>
  );
}
