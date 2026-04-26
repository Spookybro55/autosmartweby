/**
 * B-04: Preview render endpoint.
 *
 * POST /api/preview/render
 * Auth: header `X-Preview-Webhook-Secret` must equal env PREVIEW_WEBHOOK_SECRET.
 * Body: MinimalRenderRequest (B-01 contract).
 * Response: MinimalRenderResponseOk | MinimalRenderResponseError (B-01).
 *
 * ⚠ DEPRECATED — Phase 2 KROK 5
 * ─────────────────────────────────────────────────────────────────
 * Preview templates are now static on autosmartweb.cz. The default
 * Apps Script flow (`processPreviewQueue` and the per-lead manual
 * `processPreviewForLead_`) writes preview_stage=READY_FOR_REVIEW
 * directly after the `_previews` upsert and does NOT call this
 * webhook anymore.
 *
 * The endpoint is kept for backward compatibility with deployments
 * that still flip `ENABLE_WEBHOOK=true` in Config.gs to feed an
 * external Vercel render. When invoked, it validates the payload
 * and invalidates the in-memory frontend cache so the next
 * /preview/<slug> read fetches fresh data from `_previews`.
 *
 * Backlog: drop the route once no AS deployment flips ENABLE_WEBHOOK
 * (track via `_asw_logs` and external usage telemetry). The frontend
 * `/preview/[slug]` route itself is also slated for deprecation —
 * autosmartweb.cz hosts the render now.
 *
 * Out of scope (B-05): preview_slug generation, write-back into LEADS,
 * PREVIEW_STAGES transitions, retries, Apps Script changes.
 * Out of scope (B-06): external storage, screenshot capture, versioning,
 * multi-instance persistence.
 */
import { timingSafeEqual } from 'node:crypto';
import { resolveTemplateFamily } from '../../../../lib/domain/template-family.ts';
import type {
  MinimalRenderResponseError,
  MinimalRenderResponseOk,
} from '../../../../lib/domain/preview-contract.ts';
import { validateRenderRequest } from '../../../../lib/preview/validate-render-request.ts';
import { invalidatePreviewRecord } from '../../../../lib/preview/preview-store.ts';
import { evaluateQuality } from '../../../../lib/preview/quality-score.ts';

const PREVIEW_VERSION = 'b04-mvp-1';
const AUTH_HEADER = 'x-preview-webhook-secret';

type ErrorBody = MinimalRenderResponseError & { error?: string };

function jsonResponse(status: number, body: MinimalRenderResponseOk | ErrorBody): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fail(status: number, error: string): Response {
  return jsonResponse(status, { ok: false, error });
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function buildPreviewUrl(slug: string): string {
  const base = (process.env.PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');
  return `${base}/preview/${slug}`;
}

export async function POST(request: Request): Promise<Response> {
  // --- Auth ---
  const expected = process.env.PREVIEW_WEBHOOK_SECRET;
  if (!expected) {
    console.error('[B-04] PREVIEW_WEBHOOK_SECRET not configured');
    return fail(500, 'Server misconfigured: PREVIEW_WEBHOOK_SECRET missing');
  }
  const provided = request.headers.get(AUTH_HEADER);
  if (!provided || !timingSafeStringEqual(provided, expected)) {
    return fail(401, 'Unauthorized');
  }

  // --- Parse ---
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'Malformed JSON body');
  }

  // --- Validate ---
  const validation = validateRenderRequest(body);
  if (!validation.ok) {
    return fail(400, validation.error);
  }
  const { request: req } = validation;

  // --- Family routing (B-03) ---
  const family = resolveTemplateFamily(req.template_type);

  // --- Quality evaluation ---
  const quality = evaluateQuality(req.preview_brief.confidence_level, req.template_type);

  // --- Phase 2 KROK 2: invalidate stale frontend cache.
  //
  // Apps Script (`processPreviewQueue` → `upsertPreviewRecord_`) has
  // already persisted the brief into the `_previews` hidden sheet
  // BEFORE invoking this webhook. The frontend cache is per-instance
  // and may hold an older entry; dropping it makes the next /preview
  // read fetch the fresh record from AS.
  invalidatePreviewRecord(req.preview_slug);

  console.log(
    `[B-04] preview render WARM slug=${req.preview_slug} ` +
      `family=${family} unknown_base=${quality.unknown_template_base}`,
  );

  const response: MinimalRenderResponseOk = {
    ok: true,
    preview_url: buildPreviewUrl(req.preview_slug),
    preview_version: PREVIEW_VERSION,
    preview_quality_score: quality.preview_quality_score,
    preview_needs_review: quality.preview_needs_review,
  };

  return jsonResponse(200, response);
}
