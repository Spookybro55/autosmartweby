import { google, Auth } from 'googleapis';
import { SHEET_CONFIG } from '@/lib/config';
import type { Lead } from '@/lib/domain/lead';
import { buildHeaderMap, mapRowToLead } from '@/lib/mappers/sheet-to-domain';

let cachedAuth: Auth.GoogleAuth | null = null;

function getAuth() {
  if (cachedAuth) return cachedAuth;

  cachedAuth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  return cachedAuth;
}

function getSheets() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

// Cache for header map — rebuilt on first call or after TTL
let headerMapCache: { map: Map<string, number>; timestamp: number } | null = null;
const HEADER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getHeaderMap(): Promise<Map<string, number>> {
  if (headerMapCache && Date.now() - headerMapCache.timestamp < HEADER_CACHE_TTL) {
    return headerMapCache.map;
  }

  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_CONFIG.SPREADSHEET_ID,
    range: `${SHEET_CONFIG.LEADS_SHEET}!1:1`,
  });

  const headerRow = (res.data.values?.[0] ?? []) as string[];
  const map = buildHeaderMap(headerRow);
  headerMapCache = { map, timestamp: Date.now() };
  return map;
}

export async function fetchAllLeads(): Promise<Lead[]> {
  const [headers, sheets] = await Promise.all([
    getHeaderMap(),
    Promise.resolve(getSheets()),
  ]);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_CONFIG.SPREADSHEET_ID,
    // KROK 9 hotfix: A2:BZ truncated reads at column 78. After KROK 5 added
    // assignee_email (extension column #56 + ~20 legacy → column 76+), values
    // beyond BZ were silently lost — header map knew the index, data row
    // didn't reach it. A2:ZZ (702 cols) is safe headroom for pilot.
    range: `${SHEET_CONFIG.LEADS_SHEET}!A2:ZZ`,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });

  const rows = res.data.values ?? [];
  return rows.map((row, i) => mapRowToLead(row, headers, i + 2));
}

export async function fetchContactReadyLeads(): Promise<Lead[]> {
  const all = await fetchAllLeads();
  return all.filter(l => l.contactReady);
}

export async function fetchLeadById(leadId: string): Promise<Lead | null> {
  const all = await fetchAllLeads();
  return all.find(l => l.id === leadId) ?? null;
}

export async function fetchLeadByRow(rowNumber: number): Promise<Lead | null> {
  const all = await fetchAllLeads();
  return all.find(l => l.rowNumber === rowNumber) ?? null;
}
