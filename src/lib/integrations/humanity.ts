import { decryptFromHex } from '../encryption';

// ============================================================================
// HUMANITY API - Shift Matching & Event Attribution
// Shared integration used by both Historian and SEO teams
// ============================================================================

const HUMANITY_API_BASE = 'https://www.humanity.com/api/v2';

// Cache for locations (rarely change)
let locationsCache: { data: Map<string, HumanityLocation>; expiresAt: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ============================================================================
// Types
// ============================================================================

export interface HumanityConfig {
  access_token_encrypted: string;
  app_id: string;
  app_secret_encrypted?: string;
  enabled: boolean;
}

export interface HumanityLocation {
  id: number;
  name: string;
  address: string;
  country: string;
  lat?: number;
  lon?: number;
}

export interface HumanityShift {
  id: string;
  title: string;
  start_date: string;       // ISO datetime
  end_date: string;          // ISO datetime
  start_timestamp: number;   // Unix seconds
  end_timestamp: number;     // Unix seconds
  schedule_name: string;     // crew/team name
  schedule_location_id: string;
  location_name?: string;
  location_address?: string;
  notes: string;
  employees: Array<{ id: string; name: string }>;
}

export interface HumanityMatchResult {
  matched: boolean;
  shift_id: string | null;
  shift_title: string | null;
  client_name: string | null;
  event_date: string | null;
  product_type: string | null;
  location_name: string | null;
  location_address: string | null;
  crew_name: string | null;
  employees: string[];
  notes_summary: string | null;
  match_confidence: 'high' | 'medium' | 'low';
  match_rationale: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Decrypt access token from config.
 */
export function getAccessToken(config: HumanityConfig): string {
  return decryptFromHex(config.access_token_encrypted);
}

/**
 * Parse shift title to extract client name and product type.
 * Common patterns:
 *   "Install: Solove - Balloon Columns (PM2)"
 *   "Delivery: AdventHealth - Arch"
 *   "Strike: Johnson Wedding - Centerpieces"
 */
function parseShiftTitle(title: string): { client: string | null; product: string | null; action: string | null } {
  // Pattern: "Action: Client - Product (Crew)"
  const match = title.match(/^([^:]+):\s*(.+?)\s*-\s*(.+?)(?:\s*\([^)]+\))?$/);
  if (match) {
    return {
      action: match[1].trim(),
      client: match[2].trim(),
      product: match[3].trim(),
    };
  }

  // Pattern: "Client - Product"
  const simpleMatch = title.match(/^(.+?)\s*-\s*(.+?)(?:\s*\([^)]+\))?$/);
  if (simpleMatch) {
    return {
      action: null,
      client: simpleMatch[1].trim(),
      product: simpleMatch[2].trim(),
    };
  }

  return { action: null, client: null, product: null };
}

/**
 * Extract key info from shift notes: address, contact, invoice.
 */
function summarizeNotes(notes: string): string | null {
  if (!notes?.trim()) return null;

  const lines: string[] = [];

  // Extract address
  const addressMatch = notes.match(/Address[^:]*:\s*(.+)/i);
  if (addressMatch) lines.push(`Address: ${addressMatch[1].trim()}`);

  // Extract contact
  const contactMatch = notes.match(/Contact\s*(?:Person)?[^:]*:\s*(.+)/i);
  if (contactMatch) lines.push(`Contact: ${contactMatch[1].trim()}`);

  // Extract phone
  const phoneMatch = notes.match(/(?:Cell\s*)?Phone[^:]*:\s*(.+)/i);
  if (phoneMatch) lines.push(`Phone: ${phoneMatch[1].trim()}`);

  // Extract invoice
  const invoiceMatch = notes.match(/Invoice\s*#?\s*(\d+)/i);
  if (invoiceMatch) lines.push(`Invoice: #${invoiceMatch[1]}`);

  return lines.length > 0 ? lines.join(' | ') : notes.substring(0, 200);
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Fetch shifts from Humanity API within a date range.
 */
export async function fetchShifts(
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<HumanityShift[]> {
  const url = `${HUMANITY_API_BASE}/shifts?access_token=${accessToken}&start_date=${startDate}&end_date=${endDate}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Humanity shifts API HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.status !== 1) {
    throw new Error(`Humanity API error: ${json.error || json.data || 'Unknown error'}`);
  }

  const rawShifts: any[] = Array.isArray(json.data) ? json.data : [];

  return rawShifts.map((s: any) => ({
    id: String(s.id),
    title: s.title || '',
    start_date: s.start_date?.iso8601 || s.start_timestamp || '',
    end_date: s.end_date?.iso8601 || s.end_timestamp || '',
    start_timestamp: s.start_date?.timestamp || 0,
    end_timestamp: s.end_date?.timestamp || 0,
    schedule_name: s.schedule_name || '',
    schedule_location_id: String(s.schedule_location_id || s.location || '0'),
    notes: s.notes || '',
    employees: (s.employees || []).map((e: any) => ({
      id: String(e.id),
      name: e.name || '',
    })),
  }));
}

/**
 * Fetch locations with caching (10-minute TTL).
 */
export async function fetchLocations(accessToken: string): Promise<Map<string, HumanityLocation>> {
  const now = Date.now();
  if (locationsCache && locationsCache.expiresAt > now) {
    return locationsCache.data;
  }

  const url = `${HUMANITY_API_BASE}/locations?access_token=${accessToken}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Humanity locations API HTTP ${res.status}`);
  }

  const json = await res.json();
  if (json.status !== 1) {
    throw new Error(`Humanity locations error: ${json.error || 'Unknown'}`);
  }

  const map = new Map<string, HumanityLocation>();
  for (const loc of json.data || []) {
    map.set(String(loc.id), {
      id: loc.id,
      name: loc.name || '',
      address: loc.address || '',
      country: loc.country || '',
      lat: loc.lat,
      lon: loc.lon,
    });
  }

  locationsCache = { data: map, expiresAt: now + CACHE_TTL_MS };
  return map;
}

/**
 * Core matching function. Takes a timestamp, queries shifts within a window,
 * finds the closest shift by time proximity, enriches with location data.
 */
export async function findShiftByTimestamp(
  accessToken: string,
  timestamp: Date,
  windowHours: number = 24,
): Promise<HumanityMatchResult> {
  const NO_MATCH: HumanityMatchResult = {
    matched: false,
    shift_id: null,
    shift_title: null,
    client_name: null,
    event_date: null,
    product_type: null,
    location_name: null,
    location_address: null,
    crew_name: null,
    employees: [],
    notes_summary: null,
    match_confidence: 'low',
    match_rationale: 'No matching shift found within the time window',
  };

  try {
    // Calculate date window
    const msWindow = windowHours * 60 * 60 * 1000;
    const startDate = new Date(timestamp.getTime() - msWindow);
    const endDate = new Date(timestamp.getTime() + msWindow);

    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    const shifts = await fetchShifts(accessToken, formatDate(startDate), formatDate(endDate));

    if (shifts.length === 0) {
      return NO_MATCH;
    }

    // Find shift with smallest time delta
    const tsSeconds = Math.floor(timestamp.getTime() / 1000);
    let bestShift: HumanityShift | null = null;
    let bestDelta = Infinity;

    for (const shift of shifts) {
      // Distance from image timestamp to shift start
      const deltaStart = Math.abs(tsSeconds - shift.start_timestamp);
      // Distance from image timestamp to shift midpoint
      const midpoint = (shift.start_timestamp + shift.end_timestamp) / 2;
      const deltaMid = Math.abs(tsSeconds - midpoint);
      // Use the smaller of the two
      const delta = Math.min(deltaStart, deltaMid);

      if (delta < bestDelta) {
        bestDelta = delta;
        bestShift = shift;
      }
    }

    if (!bestShift) {
      return NO_MATCH;
    }

    // Determine confidence based on time delta (in hours)
    const deltaHours = bestDelta / 3600;
    let confidence: 'high' | 'medium' | 'low';
    if (deltaHours < 4) confidence = 'high';
    else if (deltaHours < 12) confidence = 'medium';
    else confidence = 'low';

    // Enrich with location data
    let locationName: string | null = null;
    let locationAddress: string | null = null;
    try {
      const locations = await fetchLocations(accessToken);
      const loc = locations.get(bestShift.schedule_location_id);
      if (loc) {
        locationName = loc.name;
        locationAddress = loc.address;
      }
    } catch {
      // Non-fatal - proceed without location data
    }

    // Parse title for client/product
    const parsed = parseShiftTitle(bestShift.title);

    const eventDate = bestShift.start_date
      ? new Date(bestShift.start_date).toISOString().split('T')[0]
      : null;

    return {
      matched: true,
      shift_id: bestShift.id,
      shift_title: bestShift.title,
      client_name: parsed.client,
      event_date: eventDate,
      product_type: parsed.product,
      location_name: locationName,
      location_address: locationAddress,
      crew_name: bestShift.schedule_name || null,
      employees: bestShift.employees.map(e => e.name).filter(Boolean),
      notes_summary: summarizeNotes(bestShift.notes),
      match_confidence: confidence,
      match_rationale: `Matched shift "${bestShift.title}" (${deltaHours.toFixed(1)}h from image timestamp). ${confidence === 'high' ? 'Strong time proximity.' : confidence === 'medium' ? 'Same-day match.' : 'Nearest shift in window.'}`,
    };
  } catch (err) {
    return {
      ...NO_MATCH,
      match_rationale: `Humanity API error: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}
