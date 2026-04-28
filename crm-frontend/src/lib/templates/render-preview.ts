/**
 * B-13 T8: client-side template renderer.
 *
 * Mirrors apps-script/EmailTemplateStore.gs:renderTemplate_ +
 * buildPlaceholderValues_ behaviour so the editor preview pane
 * matches the actual AS render. Keep these two in sync — drift = bug.
 *
 * Supported placeholders (see Apps Script T3 for canonical list):
 *   LEAD: business_name, contact_name, city, area, service_type, segment,
 *         pain_point
 *   PREVIEW: preview_url
 *   SENDER: sender_name, sender_role, sender_phone, sender_email,
 *           sender_email_display, sender_web
 *   COMPUTED: greeting, firm_ref, contact_name_comma,
 *             service_type_humanized
 *
 * Unknown placeholder → renders as empty string (graceful, matches AS).
 */

import type { SampleLead } from './sample-leads';

export interface RenderInput {
  subject_template: string;
  body_template: string;
  lead: SampleLead;
}

export interface RenderOutput {
  subject: string;
  body: string;
  unknownPlaceholders: string[];
}

const KNOWN_PLACEHOLDERS = new Set([
  'business_name', 'contact_name', 'city', 'area',
  'service_type', 'service_type_humanized',
  'segment', 'pain_point', 'preview_url',
  'sender_name', 'sender_role', 'sender_phone',
  'sender_email', 'sender_email_display', 'sender_web',
  'greeting', 'firm_ref', 'contact_name_comma',
]);

/**
 * Czech humanization for service_type tokens. Mirror of
 * humanizeServiceType_ in PreviewPipeline.gs (best-effort approximation).
 */
function humanizeServiceType(raw: string): string {
  const s = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    'instalatér':       'instalatérské služby',
    'instalater':       'instalatérské služby',
    'elektrikář':       'elektrikářské služby',
    'elektrikar':       'elektrikářské služby',
    'malíř':            'malířské služby',
    'malir':            'malířské služby',
    'podlahář':         'podlahářské služby',
    'podlahar':         'podlahářské služby',
    'úklidová firma':   'úklidové služby',
    'uklidova firma':   'úklidové služby',
    'hodinový manžel':  'služby hodinového manžela',
    'stěhovací služba': 'stěhovací služby',
    'stehovaci sluzba': 'stěhovací služby',
  };
  return map[s] ?? raw;
}

function buildValues(lead: SampleLead): Record<string, string> {
  const businessName = lead.business_name?.trim() ?? '';
  const contactName = lead.contact_name?.trim() ?? '';
  const city = lead.city?.trim() ?? '';
  const area = lead.area?.trim() ?? '';
  const serviceType = lead.service_type?.trim() ?? '';
  const segment = lead.segment?.trim() ?? '';
  const painPoint = lead.pain_point?.trim() ?? '';
  const previewUrl = lead.preview_url?.trim() ?? '';

  const greeting = contactName ? `Dobrý den, ${contactName}` : 'Dobrý den';
  const firmRef = businessName || 'vaši firmu';
  const contactNameComma = contactName ? `, ${contactName}` : '';
  const serviceTypeHumanized = serviceType ? humanizeServiceType(serviceType) : '';

  return {
    business_name: businessName,
    contact_name: contactName,
    city,
    area,
    service_type: serviceType,
    service_type_humanized: serviceTypeHumanized,
    segment,
    pain_point: painPoint,
    preview_url: previewUrl,
    sender_name: lead.sender_name ?? '',
    sender_role: lead.sender_role ?? '',
    sender_phone: lead.sender_phone ?? '',
    sender_email: lead.sender_email ?? '',
    sender_email_display: lead.sender_email_display ?? lead.sender_email ?? '',
    sender_web: lead.sender_web ?? '',
    greeting,
    firm_ref: firmRef,
    contact_name_comma: contactNameComma,
  };
}

const PLACEHOLDER_RE = /\{([a-z_][a-z0-9_]*)\}/gi;

export function renderPreview(input: RenderInput): RenderOutput {
  const values = buildValues(input.lead);
  const unknown = new Set<string>();

  function replacer(_match: string, name: string): string {
    const key = name.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return values[key] ?? '';
    }
    if (!KNOWN_PLACEHOLDERS.has(key)) {
      unknown.add(name);
    }
    return '';
  }

  return {
    subject: input.subject_template.replace(PLACEHOLDER_RE, replacer),
    body: input.body_template.replace(PLACEHOLDER_RE, replacer),
    unknownPlaceholders: Array.from(unknown).sort(),
  };
}

/**
 * Helper for the legend UI — list all placeholders with descriptions.
 */
export const PLACEHOLDER_LEGEND: Array<{
  name: string;
  description: string;
  example: string;
}> = [
  { name: 'business_name',          description: 'Název firmy z LEADS',                     example: 'ALVITO s.r.o.' },
  { name: 'contact_name',           description: 'Jméno kontaktní osoby (může být prázdné)', example: 'Pavel Novák' },
  { name: 'city',                   description: 'Město z LEADS',                           example: 'Praha' },
  { name: 'area',                   description: 'Městská část / oblast',                   example: 'Praha 9' },
  { name: 'service_type',           description: 'Řemeslo / typ služby (raw)',              example: 'instalatér' },
  { name: 'service_type_humanized', description: 'Řemeslo skloňované',                      example: 'instalatérské služby' },
  { name: 'segment',                description: 'Segment z LEADS',                         example: 'instalatér' },
  { name: 'pain_point',             description: 'Bolest / problém (může být prázdný)',     example: 'sezónní výkyvy' },
  { name: 'preview_url',            description: 'URL vygenerovaného náhledu',              example: 'https://autosmartweb.cz/preview/...' },
  { name: 'sender_name',            description: 'Jméno obchodníka (z assignee)',           example: 'Sebastián Fridrich' },
  { name: 'sender_role',            description: 'Role v podpisu',                          example: 'webové návrhy a péče o klienty' },
  { name: 'sender_phone',           description: 'Telefon obchodníka',                      example: '+420 601 557 018' },
  { name: 'sender_email',           description: 'Email obchodníka (technický)',            example: 's.fridrich@autosmartweb.cz' },
  { name: 'sender_email_display',   description: 'Email obchodníka (zobrazení)',            example: 's.fridrich@autosmartweb.cz' },
  { name: 'sender_web',             description: 'Web firmy',                               example: 'autosmartweb.cz' },
  { name: 'greeting',               description: 'Computed: "Dobrý den, [name]" nebo "Dobrý den"', example: 'Dobrý den, Pavle' },
  { name: 'firm_ref',               description: 'Computed: business_name nebo "vaši firmu"', example: 'ALVITO s.r.o.' },
  { name: 'contact_name_comma',     description: 'Computed: ", [name]" nebo prázdné',       example: ', Pavle' },
];
