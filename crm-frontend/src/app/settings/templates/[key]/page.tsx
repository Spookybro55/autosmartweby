import { TemplateEditor } from '@/components/templates/template-editor';
import { TEMPLATE_KEY_LABELS } from '@/types/templates';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const label = TEMPLATE_KEY_LABELS[key] ?? key;
  return {
    title: `${label} — Šablona | Autosmartweby CRM`,
  };
}

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  return <TemplateEditor templateKey={key} />;
}
