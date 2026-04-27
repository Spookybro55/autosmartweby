'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { EmailTemplate } from '@/types/templates';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateKey: string;
  currentActive: EmailTemplate | null;
  onPublishSuccess: (newActive: EmailTemplate) => void;
}

export function PublishDialog({
  open,
  onOpenChange,
  templateKey,
  currentActive,
  onPublishSuccess,
}: Props) {
  const [commitMessage, setCommitMessage] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');

  const newVersion = (currentActive?.version ?? 0) + 1;
  const tooShort = commitMessage.trim().length < 5;

  async function handlePublish() {
    if (tooShort || publishing) return;
    setPublishing(true);
    setError('');
    try {
      const res = await fetch(`/api/templates/${encodeURIComponent(templateKey)}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commitMessage: commitMessage.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = String(data.error ?? '');
        const msg =
          code === 'commit_message_too_short' ? 'Commit message musí mít alespoň 5 znaků.' :
          code === 'no_draft' ? 'Žádný draft k publikaci.' :
          code === 'empty_draft_content' ? 'Předmět nebo tělo je prázdné — nelze publikovat.' :
          code || 'Publikace selhala.';
        setError(msg);
        return;
      }
      onPublishSuccess(data.template);
      onOpenChange(false);
      setCommitMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba při publikaci');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publikovat verzi v{newVersion}</DialogTitle>
          <DialogDescription>
            Tato verze začne být použita pro všechny nové drafty od chvíle publikace.
            Předchozí verze v{currentActive?.version ?? '?'} bude archivována.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="commit-msg">Co se změnilo? (povinné, min 5 znaků)</Label>
          <Textarea
            id="commit-msg"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Např: 'Přidaný pain point line', 'Změna ceny na 9 900 Kč'…"
            className="min-h-20"
            disabled={publishing}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={publishing}>
            Zrušit
          </Button>
          <Button onClick={handlePublish} disabled={tooShort || publishing}>
            {publishing && <Loader2 className="mr-2 size-4 animate-spin" />}
            Publikovat v{newVersion}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
