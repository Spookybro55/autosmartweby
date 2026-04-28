import { NextResponse } from 'next/server';
import { triggerScrape } from '@/lib/google/apps-script-writer';
import type { ScrapeJobInput, SupportedPortal } from '@/types/scrape';
import { SUPPORTED_SCRAPE_PORTALS } from '@/types/scrape';

/**
 * A-11: Two-stage scrape trigger.
 *
 * Stage 1 — POST to Apps Script triggerScrape action:
 *   - Validates portal/segment/city
 *   - If duplicate query exists and force!=true → returns 409 with previousJob
 *   - Else registers a new pending job, returns {job_id, job_token}
 *
 * Stage 2 — only on stage-1 success-non-duplicate, this route dispatches
 * a GitHub Actions workflow_dispatch that runs the scraper. The job_token
 * is passed as workflow input so GH Actions can authenticate its callback
 * to the AS ingest endpoint.
 *
 * GH Actions PAT is read from GITHUB_ACTIONS_TOKEN env var. If unset,
 * the AS-side job is registered but no dispatch happens — operator can
 * trigger manually from GitHub Actions UI as fallback.
 *
 * Response shapes:
 *   200 + { duplicate: false, job_id }              — dispatched
 *   200 + { duplicate: true,  previousJob }         — already searched, frontend shows confirm
 *   400 + { error: ... }                            — validation failure
 *   429 + { error: 'rate_limit_exceeded', details } — A-11 followup rate limit;
 *                                                     Retry-After header set
 *   502 + { error: ... }                            — AS upstream failure
 *   500 + { error: ... }                            — unexpected
 */

const GH_REPO_OWNER = 'Spookybro55';
const GH_REPO_NAME = 'autosmartweby';
const GH_WORKFLOW_FILE = 'scrape.yml';

interface TriggerRequestBody {
  portal?: string;
  segment?: string;
  city?: string;
  district?: string;
  max_results?: number;
  force?: boolean;
}

export async function POST(req: Request) {
  let body: TriggerRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  // Frontend-side validation (defense in depth — AS validates again)
  const portal = String(body.portal ?? '').trim();
  const segment = String(body.segment ?? '').trim();
  const city = String(body.city ?? '').trim();
  const district = String(body.district ?? '').trim();
  const maxResults = Number(body.max_results) || 30;
  const force = body.force === true;

  if (!portal) return NextResponse.json({ error: 'missing_portal' }, { status: 400 });
  if (!segment) return NextResponse.json({ error: 'missing_segment' }, { status: 400 });
  if (!city) return NextResponse.json({ error: 'missing_city' }, { status: 400 });
  if (!SUPPORTED_SCRAPE_PORTALS.includes(portal as SupportedPortal)) {
    return NextResponse.json({ error: 'unsupported_portal', supported: SUPPORTED_SCRAPE_PORTALS }, { status: 400 });
  }
  if (segment.length > 100) return NextResponse.json({ error: 'segment_too_long' }, { status: 400 });
  if (city.length > 100) return NextResponse.json({ error: 'city_too_long' }, { status: 400 });
  if (district.length > 100) return NextResponse.json({ error: 'district_too_long' }, { status: 400 });
  if (maxResults < 1 || maxResults > 500) {
    return NextResponse.json({ error: 'invalid_max_results' }, { status: 400 });
  }

  const input: ScrapeJobInput = {
    portal: portal as SupportedPortal,
    segment, city, district, max_results: maxResults, force,
  };

  try {
    // ── Stage 1 — register with Apps Script ──
    const result = await triggerScrape(input);
    if (!result.success || !result.data) {
      const code = String(result.error ?? '');
      // A-11 followup: rate-limit gate fires before any side effect.
      // RFC 9110 §15.5.27: 429 + Retry-After header lets HTTP clients
      // (curl, future API consumers) handle backoff without parsing the body.
      if (code === 'rate_limit_exceeded') {
        const details = (result.details ?? {}) as { retry_after_seconds?: number };
        const retryAfter = typeof details.retry_after_seconds === 'number'
          ? details.retry_after_seconds
          : null;
        return NextResponse.json(
          { error: code, details: result.details ?? null },
          {
            status: 429,
            headers: retryAfter !== null ? { 'Retry-After': String(retryAfter) } : undefined,
          },
        );
      }
      return NextResponse.json(
        { error: code || 'trigger_failed' },
        { status: 502 },
      );
    }

    if (result.data.duplicate) {
      // Frontend will show confirm modal. 409 = "needs decision before retry".
      return NextResponse.json(
        { duplicate: true, previousJob: result.data.previousJob },
        { status: 409 },
      );
    }

    const jobId = result.data.job_id;
    const jobToken = result.data.job_token;
    if (!jobId || !jobToken) {
      return NextResponse.json(
        { error: 'as_returned_no_job_id' },
        { status: 502 },
      );
    }

    // ── Stage 2 — dispatch GitHub Actions workflow ──
    const ghToken = process.env.GITHUB_ACTIONS_TOKEN;
    if (!ghToken) {
      // Job registered but dispatch unavailable. Operator can trigger
      // GH Actions manually from the repo UI; the job_id + job_token
      // are recorded server-side, GH Actions just needs them as inputs.
      return NextResponse.json(
        {
          duplicate: false,
          job_id: jobId,
          dispatched: false,
          warning: 'github_token_not_configured — job registered, but GH Actions not auto-dispatched. Trigger workflow manually with these inputs.',
          gh_inputs: { jobId, portal, segment, city, district, max_results: maxResults },
        },
        { status: 200 },
      );
    }

    const ghRes = await fetch(
      `https://api.github.com/repos/${GH_REPO_OWNER}/${GH_REPO_NAME}/actions/workflows/${GH_WORKFLOW_FILE}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${ghToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            jobId,
            jobToken,
            portal,
            segment,
            city,
            district,
            max_results: String(maxResults),
          },
        }),
      },
    );

    if (!ghRes.ok) {
      const text = await ghRes.text();
      console.error('[scrape/trigger] GH dispatch failed:', ghRes.status, text);
      // Job is registered in AS but dispatch failed — operator can re-trigger.
      // We DO NOT mark the job failed here; let the AS-side fail handler
      // (timeout-driven) catch it later, OR allow manual trigger.
      return NextResponse.json(
        {
          duplicate: false,
          job_id: jobId,
          dispatched: false,
          gh_status: ghRes.status,
          warning: 'gh_dispatch_failed — job registered, manual GH Actions trigger needed.',
          gh_inputs: { jobId, portal, segment, city, district, max_results: maxResults },
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      duplicate: false,
      job_id: jobId,
      dispatched: true,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
