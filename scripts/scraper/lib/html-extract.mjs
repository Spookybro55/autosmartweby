// HTML extraction helpers. No external deps.
// Strategy: prefer structured data (JSON-LD, Open Graph) over DOM traversal.

export function extractJsonLd(html) {
  const results = [];
  const re = /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) results.push(...parsed);
      else results.push(parsed);
    } catch {
      // Malformed JSON-LD block — skip, fall through to next.
    }
  }
  return results;
}

export function findJsonLdByType(ldList, types) {
  const typeSet = new Set(types.map((t) => String(t).toLowerCase()));
  const visit = (node) => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const r = visit(item);
        if (r) return r;
      }
      return null;
    }
    const t = node['@type'];
    if (t) {
      const arr = Array.isArray(t) ? t : [t];
      for (const v of arr) {
        if (typeSet.has(String(v).toLowerCase())) return node;
      }
    }
    if (node['@graph']) {
      const r = visit(node['@graph']);
      if (r) return r;
    }
    return null;
  };
  for (const ld of ldList) {
    const r = visit(ld);
    if (r) return r;
  }
  return null;
}

export function extractOgMeta(html) {
  const map = {};
  // property="og:X" first, then content="..."
  const re1 = /<meta\b[^>]*\bproperty=["']og:([a-z_:]+)["'][^>]*\bcontent=["']([^"']*)["'][^>]*>/gi;
  let m;
  while ((m = re1.exec(html)) !== null) {
    if (!(m[1] in map)) map[m[1]] = decodeHtmlEntities(m[2]);
  }
  // content="..." first, then property="og:X"
  const re2 = /<meta\b[^>]*\bcontent=["']([^"']*)["'][^>]*\bproperty=["']og:([a-z_:]+)["'][^>]*>/gi;
  while ((m = re2.exec(html)) !== null) {
    if (!(m[2] in map)) map[m[2]] = decodeHtmlEntities(m[1]);
  }
  return map;
}

export function extractNamedMeta(html) {
  const map = {};
  const re = /<meta\b[^>]*\bname=["']([a-z_:-]+)["'][^>]*\bcontent=["']([^"']*)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) map[m[1]] = decodeHtmlEntities(m[2]);
  return map;
}

export function findFirst(html, re) {
  const m = html.match(re);
  return m ? m[1] : null;
}

export function decodeHtmlEntities(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, c) => String.fromCharCode(parseInt(c, 16)));
}

export function stripTags(html) {
  return decodeHtmlEntities(String(html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
}
