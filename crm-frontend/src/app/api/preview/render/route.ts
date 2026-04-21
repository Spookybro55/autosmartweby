/**
 * B-04: Preview render endpoint.
 *
 * POST /api/preview/render
 * Auth: header `X-Preview-Webhook-Secret` must equal env PREVIEW_WEBHOOK_SECRET.
 * Body: MinimalRenderRequest (B-01 contract).
 * Response: MinimalRenderResponseOk | MinimalRenderResponseError (B-01).
 *
 * This endpoint:
 * - validates payload at runtime (see validate-render-request.ts)
 * - upserts the brief into the in-memory preview store
 * - returns preview_url = `${PUBLIC_BASE_URL}/preview/${preview_slug}`
 *
 * Out of scope (B-05): preview_slug generation, write-back into LEADS,
 * PREVIEW_STAGES transitions, retries, Apps Script changes.
 * Out of scope (B-06): external storage, screenshot capture, versioning,
 * multi-instance persistence.
 */
import { timingSafeEqual } from 'node:crypto';
import {
  resolveTemplateFamily,
  resolveTemplateRenderHints,
} from '../../../../lib/domain/template-family.ts';
import type {
  MinimalRenderResponseError,
  MinimalRenderResponseOk,
} from '../../../../lib/domain/preview-contract.ts';
import { validateRenderRequest } from '../../../../lib/preview/validate-render-request.ts';
import { putPreviewRecord } from '../../../../lib/preview/preview-store.ts';
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
  const hints = resolveTemplateRenderHints(req.template_type);

  // --- Quality evaluation ---
  const quality = evaluateQuality(req.preview_brief.confidence_level, req.template_type);

  // --- Upsert into runtime store ---
  const { created } = putPreviewRecord(req.preview_slug, {
    brief: req.preview_brief,
    template_type: req.template_type,
    family,
    hints,
    version: PREVIEW_VERSION,
  });

  console.log(
    `[B-04] preview render ${created ? 'CREATE' : 'UPDATE'} slug=${req.preview_slug} ` +
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
