// firmy.cz portal-specific parser.
// Primary: JSON-LD schema.org (LocalBusiness, Organization, ProfessionalService).
// Fallback 1: Open Graph meta tags + named meta (ICO, phone, email via regex).
// Fallback 2: regex on stable href patterns (tel:, mailto:, canonical website link).
import {
  extractJsonLd,
  findJsonLdByType,
  extractOgMeta,
  extractNamedMeta,
  findFirst,
  stripTags,
  decodeHtmlEntities,
} from './html-extract.mjs';

const BASE_URL = 'https://www.firmy.cz';
const BUSINESS_TYPES = [
  'LocalBusiness',
  'Organization',
  'ProfessionalService',
  'HomeAndConstructionBusiness',
  'Electrician',
  'Plumber',
  'Store',
];

export function buildListingUrl({ segment, city, district }) {
  const terms = [segment, city, district].filter((v) => v != null && v !== '');
  return `${BASE_URL}/?q=${encodeURIComponent(terms.join(' '))}`;
}

export function extractListingUrls(html, { limit = 50 } = {}) {
  const urls = new Set();
  // Match both absolute (https://www.firmy.cz/detail/...html) and relative (/detail/...html).
  // Strip anchor fragments and query strings. Normalize to canonical https://www.firmy.cz origin.
  const re = /href=["']((?:https?:\/\/(?:www\.)?firmy\.cz)?\/detail\/[A-Za-z0-9][^"'#?\s]*\.html)(?:[#?][^"']*)?["']/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    let u = m[1];
    if (u.startsWith('/')) u = `${BASE_URL}${u}`;
    u = u.replace(/^https?:\/\/(?:www\.)?firmy\.cz/, BASE_URL);
    urls.add(u);
    if (urls.size >= limit) break;
  }
  return Array.from(urls);
}

// Per-field extraction. Each field has a primary path (JSON-LD) and 1-2 fallbacks.
// Returns { payload, canonicalUrl, fieldsExtracted, fieldsFailed }.
export function parseDetail(html, { fallbackCategory = null } = {}) {
  const ld = extractJsonLd(html);
  const business = findJsonLdByType(ld, BUSINESS_TYPES);
  const og = extractOgMeta(html);
  const nm = extractNamedMeta(html);

  const extracted = [];
  const failed = [];
  const take = (name, fn) => {
    try {
      const v = fn();
      if (v != null && v !== '') {
        extracted.push(name);
        return v;
      }
      return null;
    } catch (err) {
      failed.push({ field: name, error: String((err && err.message) || err) });
      return null;
    }
  };

  const business_name = take('business_name', () => {
    if (business && business.name) return stripTags(business.name);
    if (og.title) {
      return og.title
        .replace(/\s*[•|\-—–]\s*(?:firmy\.cz|Firmy\.cz)\s*$/i, '')
        .replace(/\s*\([^)]+\)\s*$/, '')
        .trim();
    }
    const t = findFirst(html, /<title>([^<]+)<\/title>/i);
    return t ? t.replace(/\s*[•|\-—–]\s*Firmy\.cz\s*$/i, '').replace(/\s*\([^)]+\)\s*$/, '').trim() : null;
  });

  const ico = take('ico', () => {
    if (business) {
      if (business.taxID) return String(business.taxID).replace(/\D/g, '').slice(0, 8) || null;
      if (business.identifier) {
        const id = Array.isArray(business.identifier) ? business.identifier[0] : business.identifier;
        const val = id && (id.value || id);
        if (val) return String(val).replace(/\D/g, '').slice(0, 8) || null;
      }
    }
    const m = html.match(/I[CČ]O[:\s]*<?[^>]*>?\s*(\d{8})/i);
    return m ? m[1] : null;
  });

  const contact_name = take('contact_name', () => {
    if (business) {
      if (business.contactPoint) {
        const cp = Array.isArray(business.contactPoint) ? business.contactPoint[0] : business.contactPoint;
        if (cp && cp.name) return stripTags(cp.name);
      }
      if (business.employee) {
        const emp = Array.isArray(business.employee) ? business.employee[0] : business.employee;
        if (emp && emp.name) return stripTags(emp.name);
      }
    }
    return null;
  });

  const phone = take('phone', () => {
    if (business) {
      if (business.telephone) return stripTags(business.telephone);
      if (business.contactPoint) {
        const cp = Array.isArray(business.contactPoint) ? business.contactPoint[0] : business.contactPoint;
        if (cp && cp.telephone) return stripTags(cp.telephone);
      }
    }
    const m = html.match(/href=["']tel:([+0-9\s\-()]+)["']/i);
    return m ? m[1].trim() : null;
  });

  const email = take('email', () => {
    if (business && business.email) return stripTags(business.email);
    const m = html.match(/href=["']mailto:([^"'?]+)/i);
    return m ? decodeHtmlEntities(m[1]).trim() : null;
  });

  const website = take('website', () => {
    if (business) {
      if (business.url && !/(?:^|\.)firmy\.cz\//i.test(business.url)) return stripTags(business.url);
      if (Array.isArray(business.sameAs)) {
        const first = business.sameAs.find(
          (u) => typeof u === 'string' && /^https?:\/\//i.test(u) && !/(?:^|\.)firmy\.cz\//i.test(u)
        );
        if (first) return first;
      }
    }
    const m = html.match(
      /href=["'](https?:\/\/(?!(?:www\.)?firmy\.cz)[^"']+)["'][^>]*>\s*(?:Web|Webov[aáeé]|Stránky|Str[aá]nky)/i
    );
    return m ? m[1] : null;
  });

  const address = business && business.address;
  const addressObj = address && typeof address === 'object' ? address : null;

  // firmy.cz emits addressLocality as "Praha, Troja" — comma separates city from district.
  const city = take('city', () => {
    if (addressObj && addressObj.addressLocality) {
      const loc = stripTags(addressObj.addressLocality);
      const comma = loc.indexOf(',');
      return comma > 0 ? loc.slice(0, comma).trim() : loc;
    }
    return null;
  });

  const district = take('district', () => {
    if (addressObj) {
      if (addressObj.addressLocality) {
        const loc = stripTags(addressObj.addressLocality);
        const comma = loc.indexOf(',');
        if (comma > 0) return loc.slice(comma + 1).trim();
      }
      if (addressObj.addressRegion) return stripTags(addressObj.addressRegion);
    }
    return null;
  });

  const category = take('category', () => {
    if (business && business['@type']) {
      const types = Array.isArray(business['@type']) ? business['@type'] : [business['@type']];
      const specific = types.find(
        (t) => !['LocalBusiness', 'Organization', 'ProfessionalService'].includes(t)
      );
      if (specific) return specific;
    }
    const bc = findJsonLdByType(ld, ['BreadcrumbList']);
    if (bc && bc.itemListElement) {
      const items = Array.isArray(bc.itemListElement) ? bc.itemListElement : [bc.itemListElement];
      const last = items[items.length - 1];
      if (last) {
        if (last.name) return stripTags(last.name);
        if (last.item && last.item.name) return stripTags(last.item.name);
      }
    }
    return fallbackCategory;
  });

  // firmy.cz uses 0-100 scale with bestRating=100. A-03 normalizer expects 0-5.
  // Normalize here so the raw_payload_json carries a 0-5 value matching downstream contract.
  const rating = take('rating', () => {
    if (business && business.aggregateRating && business.aggregateRating.ratingValue != null) {
      const raw = Number(String(business.aggregateRating.ratingValue).replace(',', '.'));
      const best = business.aggregateRating.bestRating;
      const bestNum = best != null ? Number(String(best).replace(',', '.')) : null;
      if (Number.isFinite(raw) && Number.isFinite(bestNum) && bestNum > 0 && bestNum !== 5) {
        return Math.round((raw / bestNum) * 5 * 100) / 100;
      }
      return business.aggregateRating.ratingValue;
    }
    return null;
  });

  const reviews_count = take('reviews_count', () => {
    if (business && business.aggregateRating) {
      const c = business.aggregateRating.reviewCount ?? business.aggregateRating.ratingCount;
      if (c != null) return c;
    }
    return null;
  });

  const canonicalUrl =
    og.url ||
    nm.canonical ||
    findFirst(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);

  const payload = {
    business_name: business_name,
    ico: ico,
    contact_name: contact_name,
    phone: phone,
    email: email,
    website: website,
    city: city,
    district: district,
    area: null,
    segment: null,
    category: category,
    service_type: null,
    pain_point: null,
    rating: rating,
    reviews_count: reviews_count,
  };

  return { payload, canonicalUrl, fieldsExtracted: extracted, fieldsFailed: failed };
}
