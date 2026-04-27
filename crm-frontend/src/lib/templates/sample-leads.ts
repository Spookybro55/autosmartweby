/**
 * B-13 T8: sample lead data for template preview rendering.
 *
 * Used in /settings/templates/[key] editor to render the email body
 * with realistic substitutions WITHOUT calling Apps Script.
 *
 * Fields cover the full T3 placeholder set so all defaults render.
 * Once T9 wires real-leads dropdown, these become the default fallback.
 */

export interface SampleLead {
  id: string;
  business_name: string;
  contact_name: string;
  city: string;
  area: string;
  service_type: string;
  segment: string;
  pain_point: string;
  preview_url: string;
  email: string;
  // Sender block — operator's profile (hard-coded to Sebastián for T8)
  sender_name: string;
  sender_role: string;
  sender_phone: string;
  sender_email: string;
  sender_email_display: string;
  sender_web: string;
}

const SEBASTIAN_SIGNATURE = {
  sender_name: 'Sebastián Fridrich',
  sender_role: 'webové návrhy a péče o klienty',
  sender_phone: '+420 601 557 018',
  sender_email: 's.fridrich@autosmartweb.cz',
  sender_email_display: 's.fridrich@autosmartweb.cz',
  sender_web: 'autosmartweb.cz',
};

export const SAMPLE_LEADS: SampleLead[] = [
  {
    id: 'sample-1',
    business_name: 'ALVITO s.r.o. PLYNOSERVIS',
    contact_name: 'Pavel Novák',
    city: 'Praha',
    area: 'Praha 9',
    service_type: 'instalatér',
    segment: 'instalatér',
    pain_point: 'sezónní výkyvy poptávky',
    preview_url: 'https://autosmartweb.cz/preview/alvito-s-r-o-plynoservis-praha',
    email: 'info@alvito-plynoservis.cz',
    ...SEBASTIAN_SIGNATURE,
  },
  {
    id: 'sample-2',
    business_name: 'Elektroservis Krátký',
    contact_name: '',
    city: 'Brno',
    area: '',
    service_type: 'elektrikář',
    segment: 'elektrikář',
    pain_point: '',
    preview_url: 'https://autosmartweb.cz/preview/elektroservis-kratky-brno',
    email: 'elektro@kratky.cz',
    ...SEBASTIAN_SIGNATURE,
  },
  {
    id: 'sample-3',
    business_name: 'Stěhování Praha-Sever',
    contact_name: 'Jana Dvořáková',
    city: 'Praha',
    area: 'Praha 8',
    service_type: 'stěhovací služba',
    segment: 'stěhování',
    pain_point: 'vytíženost o víkendech',
    preview_url: 'https://autosmartweb.cz/preview/stehovani-praha-sever',
    email: 'info@stehovani-praha-sever.cz',
    ...SEBASTIAN_SIGNATURE,
  },
];
