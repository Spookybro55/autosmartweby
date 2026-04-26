import type { Metadata } from 'next';
import { PreviewFooter } from '@/components/preview/preview-footer';

export const metadata: Metadata = {
  // Phase 2 KROK 3: previews are intended for direct sharing with the
  // prospect, not for search engines (cf. SEC-009 backlog item).
  robots: { index: false, follow: false },
};

/**
 * Preview pages render full-bleed: sections handle their own gutters
 * and max-width via mx-auto max-w-5xl wrappers. The previous shell
 * (mx-auto max-w-4xl) was constraining the hero from going edge-to-edge.
 */
export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      <main>{children}</main>
      <PreviewFooter />
    </div>
  );
}
