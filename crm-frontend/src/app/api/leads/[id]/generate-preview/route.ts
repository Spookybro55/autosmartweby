/**
 * Phase 2 KROK 4 — manual "Generate preview" trigger.
 *
 * POST /api/leads/[id]/generate-preview
 *
 * Operator clicks "Vygenerovat preview" in the lead detail drawer; this
 * route relays the call to Apps Script (action `generatePreview`),
 * which writes the brief into `_previews` + LEADS and lifts
 * `preview_stage` to `READY_FOR_REVIEW`. The marketing web at
 * autosmartweb.cz hosts the static `/preview/<slug>` template — the
 * CRM frontend never renders it, only links to it.
 *
 * Eligibility (enforced in Apps Script `processPreviewForLead_`):
 *  - lead must exist
 *  - `qualified_for_preview === 'true'`
 *  - `dedupe_flag !== 'true'`
 *
 * Response shape: `{ success, slug?, previewUrl?, stage?, error? }`.
 * Status codes:
 *  - 200 → success, body has slug + previewUrl
 *  - 400 → eligibility failure (not_qualified / dedupe_blocked / lead_not_found)
 *  - 502 → Apps Script returned ok:false for an internal reason
 *  - 500 → unexpected server error
 */
import { NextResponse } from 'next/server';
import { isMockMode, generateMockPreview } from '@/lib/mock/mock-service';

const ELIGIBILITY_ERRORS = new Set(['not_qualified', 'dedupe_blocked']);

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id || id.length < 3) {
      return NextResponse.json(
        { success: false, error: 'Invalid lead id' },
        { status: 400 },
      );
    }

    if (isMockMode()) {
      const result = generateMockPreview(id);
      if (!result.ok) {
        const status = ELIGIBILITY_ERRORS.has(result.error ?? '') ? 400
          : result.error?.startsWith('lead_not_found') ? 404
          : 500;
        return NextResponse.json(
          { success: false, error: result.error ?? 'mock_generate_failed' },
          { status },
        );
      }
      return NextResponse.json({
        success: true,
        slug: result.slug,
        previewUrl: result.previewUrl,
        stage: result.stage,
        _mock: true,
      });
    }

    const { generatePreview } = await import('@/lib/google/apps-script-writer');
    const result = await generatePreview(id);

    if (!result.success) {
      // Map known eligibility failures to 400 so the UI can render a
      // specific message; everything else is 502 (upstream AS failure).
      const errCode = result.error ?? '';
      const status = ELIGIBILITY_ERRORS.has(errCode) ? 400
        : errCode.startsWith('lead_not_found') ? 404
        : 502;
      return NextResponse.json(
        { success: false, error: result.error ?? 'Generation failed' },
        { status },
      );
    }

    return NextResponse.json({
      success: true,
      slug: result.slug,
      previewUrl: result.previewUrl,
      stage: result.stage,
    });
  } catch (error) {
    console.error('[API] POST /api/leads/[id]/generate-preview failed:', error);
    return NextResponse.json(
      { success: false, error: 'Nepodařilo se vygenerovat preview' },
      { status: 500 },
    );
  }
}
