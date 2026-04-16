// A-02 RAW_IMPORT row builder.
// Canonical spec: docs/contracts/raw-import-staging.md section 2.

export function rawImportId(jobHash10, seq) {
  if (!/^[0-9a-f]{10}$/.test(jobHash10)) {
    throw new Error(`Invalid jobHash10: ${jobHash10} (expected 10 hex chars)`);
  }
  const seq6 = String(seq).padStart(6, '0');
  if (seq6.length !== 6) throw new Error(`Sequence overflow: ${seq}`);
  return `RAW-${jobHash10}-${seq6}`;
}

// Build a fresh _raw_import row at the moment of scraping.
// All 16 fields are explicitly present per A-02 design (explicit null > missing key).
export function buildRawImportRow({ job, jobHash10, seq, sourceUrl, scrapedAt, payload }) {
  const id = rawImportId(jobHash10, seq);
  return {
    raw_import_id: id,
    source_job_id: job.source_job_id,
    source_portal: job.portal,
    source_url: sourceUrl,
    scraped_at: scrapedAt,
    raw_payload_json: JSON.stringify(payload),
    normalized_status: 'raw',
    normalization_error: null,
    duplicate_candidate: false,
    duplicate_of_lead_id: null,
    lead_id: null,
    import_decision: null,
    decision_reason: null,
    created_at: scrapedAt,
    updated_at: scrapedAt,
    processed_by: 'scraper',
  };
}
