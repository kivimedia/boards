/**
 * Lead Parser - CSV and paste-and-parse import for LinkedIn leads
 *
 * Handles:
 * - CSV file parsing (standard and Sales Navigator formats)
 * - Paste-and-parse from LinkedIn search results
 * - Plain LinkedIn URL list parsing
 * - Deduplication against existing leads
 * - Preview generation with pre-qualification hints
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { LI_APPROVED_TITLES } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface ParsedLead {
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  linkedin_url: string | null;
  email: string | null;
  job_position: string | null;
  company_name: string | null;
  company_url: string | null;
  country: string | null;
  city: string | null;
  state: string | null;
  connection_degree: number | null;
  connections_count: number | null;
}

export interface ParsedLeadWithStatus extends ParsedLead {
  row_index: number;
  selected: boolean;
  qualification_hint: 'QUALIFIED' | 'MAYBE' | 'SKIP';
  qualification_reason: string;
  is_duplicate: boolean;
  duplicate_lead_id: string | null;
}

export interface ParseResult {
  leads: ParsedLeadWithStatus[];
  total_parsed: number;
  duplicates_found: number;
  auto_qualified: number;
  auto_skipped: number;
  needs_review: number;
  errors: string[];
}

// ============================================================================
// CSV HEADER MAPPINGS
// ============================================================================

// Standard CSV headers
const STANDARD_HEADERS: Record<string, keyof ParsedLead> = {
  'full_name': 'full_name',
  'name': 'full_name',
  'full name': 'full_name',
  'first_name': 'first_name',
  'first name': 'first_name',
  'firstname': 'first_name',
  'last_name': 'last_name',
  'last name': 'last_name',
  'lastname': 'last_name',
  'linkedin_url': 'linkedin_url',
  'linkedin url': 'linkedin_url',
  'linkedin': 'linkedin_url',
  'profile url': 'linkedin_url',
  'profile_url': 'linkedin_url',
  'url': 'linkedin_url',
  'email': 'email',
  'email address': 'email',
  'email_address': 'email',
  'job_position': 'job_position',
  'job position': 'job_position',
  'title': 'job_position',
  'job title': 'job_position',
  'job_title': 'job_position',
  'position': 'job_position',
  'company_name': 'company_name',
  'company name': 'company_name',
  'company': 'company_name',
  'company_url': 'company_url',
  'company url': 'company_url',
  'company website': 'company_url',
  'website': 'company_url',
  'country': 'country',
  'city': 'city',
  'state': 'state',
  'location': 'country', // Will be parsed further
};

// Sales Navigator export column mappings
const SN_HEADERS: Record<string, keyof ParsedLead | 'location_combined'> = {
  'first name': 'first_name',
  'last name': 'last_name',
  'profile url': 'linkedin_url',
  'geography': 'country',
  'current company': 'company_name',
  'current position': 'job_position',
  'email': 'email',
};

// ============================================================================
// CSV PARSING
// ============================================================================

export function parseCSV(csvText: string): ParseResult {
  const errors: string[] = [];
  const lines = csvText.trim().split('\n');

  if (lines.length < 2) {
    return { leads: [], total_parsed: 0, duplicates_found: 0, auto_qualified: 0, auto_skipped: 0, needs_review: 0, errors: ['CSV must have at least a header row and one data row'] };
  }

  // Detect delimiter (comma vs semicolon vs tab)
  const headerLine = lines[0];
  const delimiter = headerLine.includes('\t') ? '\t' : headerLine.includes(';') ? ';' : ',';

  // Parse headers
  const rawHeaders = parseCSVLine(headerLine, delimiter).map(h => h.trim().toLowerCase());

  // Detect if this is a Sales Navigator export
  const isSN = rawHeaders.some(h => h === 'geography' || h === 'current company' || h === 'current position');
  const headerMap = isSN ? SN_HEADERS : STANDARD_HEADERS;

  // Map headers to field names
  const fieldMap: Record<number, keyof ParsedLead | 'location_combined'> = {};
  rawHeaders.forEach((header, i) => {
    const mapped = headerMap[header];
    if (mapped) fieldMap[i] = mapped;
  });

  // Check for required fields
  const mappedFields = Object.values(fieldMap);
  const hasName = mappedFields.includes('full_name') || (mappedFields.includes('first_name') && mappedFields.includes('last_name'));
  if (!hasName) {
    errors.push('CSV must contain full_name or first_name + last_name columns');
  }

  // Parse rows
  const leads: ParsedLeadWithStatus[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line, delimiter);
    const lead: ParsedLead = {
      full_name: '',
      first_name: null,
      last_name: null,
      linkedin_url: null,
      email: null,
      job_position: null,
      company_name: null,
      company_url: null,
      country: null,
      city: null,
      state: null,
      connection_degree: null,
      connections_count: null,
    };

    for (const [colIdx, field] of Object.entries(fieldMap)) {
      const val = values[Number(colIdx)]?.trim() || null;
      if (!val) continue;

      if (field === 'location_combined') {
        // Parse combined location field
        const parts = val.split(',').map(p => p.trim());
        if (parts.length >= 2) {
          lead.city = parts[0];
          lead.state = parts.length === 3 ? parts[1] : null;
          lead.country = parts[parts.length - 1];
        } else {
          lead.country = val;
        }
      } else {
        (lead as unknown as Record<string, unknown>)[field] = val;
      }
    }

    // Build full_name from parts if not provided
    if (!lead.full_name && lead.first_name && lead.last_name) {
      lead.full_name = `${lead.first_name} ${lead.last_name}`;
    }

    // Extract first/last name from full_name if not provided
    if (lead.full_name && (!lead.first_name || !lead.last_name)) {
      const nameParts = lead.full_name.trim().split(/\s+/);
      lead.first_name = nameParts[0] || null;
      lead.last_name = nameParts.slice(1).join(' ') || null;
    }

    // Clean up names
    lead.full_name = cleanName(lead.full_name);
    lead.first_name = lead.first_name ? cleanName(lead.first_name) : null;
    lead.last_name = lead.last_name ? cleanName(lead.last_name) : null;

    // Normalize LinkedIn URL
    if (lead.linkedin_url) {
      lead.linkedin_url = normalizeLinkedInUrl(lead.linkedin_url);
    }

    // Skip malformed rows
    if (!lead.full_name && !lead.linkedin_url) {
      errors.push(`Row ${i + 1}: Missing both name and LinkedIn URL - skipped`);
      continue;
    }

    // Filter out company pages
    if (lead.linkedin_url && lead.linkedin_url.includes('/company/')) {
      errors.push(`Row ${i + 1}: Company page URL detected - skipped`);
      continue;
    }

    // Pre-qualify based on job title
    const { hint, reason } = preQualify(lead);

    leads.push({
      ...lead,
      row_index: i,
      selected: hint !== 'SKIP',
      qualification_hint: hint,
      qualification_reason: reason,
      is_duplicate: false,
      duplicate_lead_id: null,
    });
  }

  const auto_qualified = leads.filter(l => l.qualification_hint === 'QUALIFIED').length;
  const auto_skipped = leads.filter(l => l.qualification_hint === 'SKIP').length;
  const needs_review = leads.filter(l => l.qualification_hint === 'MAYBE').length;

  return {
    leads,
    total_parsed: leads.length,
    duplicates_found: 0, // Set after dedup check
    auto_qualified,
    auto_skipped,
    needs_review,
    errors,
  };
}

// ============================================================================
// PASTE-AND-PARSE
// ============================================================================

export function parsePastedText(text: string): ParseResult {
  const errors: string[] = [];
  const leads: ParsedLeadWithStatus[] = [];
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);

  // Check if it's just a list of LinkedIn URLs
  const isUrlList = lines.every(l => l.match(/linkedin\.com\/in\//i));
  if (isUrlList) {
    lines.forEach((url, i) => {
      const normalized = normalizeLinkedInUrl(url);
      if (normalized) {
        leads.push({
          full_name: '', // Will need enrichment
          first_name: null,
          last_name: null,
          linkedin_url: normalized,
          email: null,
          job_position: null,
          company_name: null,
          company_url: null,
          country: null,
          city: null,
          state: null,
          connection_degree: null,
          connections_count: null,
          row_index: i,
          selected: true,
          qualification_hint: 'MAYBE',
          qualification_reason: 'URL only - needs enrichment',
          is_duplicate: false,
          duplicate_lead_id: null,
        });
      }
    });
  } else {
    // Parse LinkedIn search results paste
    // LinkedIn search results have a pattern of name blocks separated by connection degree markers
    const blocks = extractLinkedInSearchBlocks(text);

    blocks.forEach((block, i) => {
      const lead: ParsedLead = {
        full_name: block.name,
        first_name: block.name.split(/\s+/)[0] || null,
        last_name: block.name.split(/\s+/).slice(1).join(' ') || null,
        linkedin_url: block.linkedinUrl,
        email: null,
        job_position: block.title,
        company_name: block.company,
        company_url: null,
        country: null,
        city: block.location,
        state: null,
        connection_degree: block.degree,
        connections_count: null,
      };

      const { hint, reason } = preQualify(lead);

      leads.push({
        ...lead,
        row_index: i,
        selected: hint !== 'SKIP',
        qualification_hint: hint,
        qualification_reason: reason,
        is_duplicate: false,
        duplicate_lead_id: null,
      });
    });
  }

  const auto_qualified = leads.filter(l => l.qualification_hint === 'QUALIFIED').length;
  const auto_skipped = leads.filter(l => l.qualification_hint === 'SKIP').length;
  const needs_review = leads.filter(l => l.qualification_hint === 'MAYBE').length;

  return {
    leads,
    total_parsed: leads.length,
    duplicates_found: 0,
    auto_qualified,
    auto_skipped,
    needs_review,
    errors,
  };
}

// ============================================================================
// DEDUPLICATION
// ============================================================================

export async function checkDuplicates(
  supabase: SupabaseClient,
  userId: string,
  leads: ParsedLeadWithStatus[]
): Promise<ParsedLeadWithStatus[]> {
  // Get existing leads for comparison
  const linkedinUrls = leads
    .map(l => l.linkedin_url)
    .filter((u): u is string => !!u);

  const { data: existingByUrl } = await supabase
    .from('li_leads')
    .select('id, linkedin_url, full_name, city')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .in('linkedin_url', linkedinUrls.length > 0 ? linkedinUrls : ['__none__']);

  const urlMap = new Map((existingByUrl || []).map(l => [l.linkedin_url, l]));

  // Also check by name for fuzzy matching
  const names = leads.map(l => l.full_name.toLowerCase()).filter(Boolean);
  const { data: existingByName } = await supabase
    .from('li_leads')
    .select('id, full_name, city, linkedin_url')
    .eq('user_id', userId)
    .is('deleted_at', null);

  const nameMap = new Map<string, typeof existingByName>();
  (existingByName || []).forEach(l => {
    const key = l.full_name?.toLowerCase();
    if (key) {
      const existing = nameMap.get(key) || [];
      existing.push(l);
      nameMap.set(key, existing);
    }
  });

  return leads.map(lead => {
    // Check exact URL match
    if (lead.linkedin_url && urlMap.has(lead.linkedin_url)) {
      const existing = urlMap.get(lead.linkedin_url)!;
      return {
        ...lead,
        is_duplicate: true,
        duplicate_lead_id: existing.id,
        selected: false,
        qualification_hint: 'SKIP' as const,
        qualification_reason: `Duplicate: exact LinkedIn URL match with existing lead`,
      };
    }

    // Check fuzzy name match (same name + same city)
    const nameKey = lead.full_name?.toLowerCase();
    if (nameKey && nameMap.has(nameKey)) {
      const matches = nameMap.get(nameKey)!;
      const cityMatch = matches.find(m =>
        m.city?.toLowerCase() === lead.city?.toLowerCase() && lead.city
      );
      if (cityMatch) {
        return {
          ...lead,
          is_duplicate: true,
          duplicate_lead_id: cityMatch.id,
          qualification_hint: 'MAYBE' as const,
          qualification_reason: `Possible duplicate: same name + city as existing lead`,
        };
      }
    }

    return lead;
  });
}

// ============================================================================
// HELPERS
// ============================================================================

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function cleanName(name: string): string {
  return name
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^a-zA-Z]+/, '') // Strip leading non-alpha chars
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function normalizeLinkedInUrl(url: string): string | null {
  // Extract the /in/username part
  const match = url.match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  if (!match) return null;
  return `https://www.linkedin.com/in/${match[1].toLowerCase()}/`;
}

function preQualify(lead: ParsedLead): { hint: 'QUALIFIED' | 'MAYBE' | 'SKIP'; reason: string } {
  if (!lead.job_position) {
    return { hint: 'MAYBE', reason: 'No job title - needs review' };
  }

  const titleLower = lead.job_position.toLowerCase();

  // Check for approved entertainment titles
  const isEntertainment = LI_APPROVED_TITLES.some(t => titleLower.includes(t));
  if (isEntertainment) {
    return { hint: 'QUALIFIED', reason: `Title matches: ${lead.job_position}` };
  }

  // Check for obvious tech/non-entertainment signals
  const techSignals = ['developer', 'engineer', 'programmer', 'software', 'data', 'analyst', 'consultant', 'director of it'];
  const isTech = techSignals.some(s => titleLower.includes(s));
  if (isTech && titleLower.includes('magician')) {
    return { hint: 'SKIP', reason: 'Likely metaphorical "magician" in tech context' };
  }
  if (isTech) {
    return { hint: 'SKIP', reason: 'Tech/non-entertainment title' };
  }

  // Check for competitor signals
  const competitorSignals = ['talent agent', 'booking manager', 'event planner', 'party planner'];
  const isCompetitor = competitorSignals.some(s => titleLower.includes(s));
  if (isCompetitor) {
    return { hint: 'SKIP', reason: 'Possible competitor or non-target role' };
  }

  return { hint: 'MAYBE', reason: 'Title needs manual review' };
}

interface LinkedInSearchBlock {
  name: string;
  title: string | null;
  company: string | null;
  location: string | null;
  degree: number | null;
  linkedinUrl: string | null;
}

function extractLinkedInSearchBlocks(text: string): LinkedInSearchBlock[] {
  const blocks: LinkedInSearchBlock[] = [];

  // LinkedIn search results typically show patterns like:
  // Name\n1st|2nd|3rd+\nTitle at Company\nLocation
  // Or: Name - Title - Company | LinkedIn
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Skip common LinkedIn UI text
    if (line.match(/^(people|connect|message|follow|pending|mutual|see all|show more)/i)) {
      i++;
      continue;
    }

    // Detect connection degree marker (1st, 2nd, 3rd+)
    const degreeMatch = line.match(/^(1st|2nd|3rd\+?)$/);
    if (degreeMatch && i > 0) {
      // The previous line was likely a name
      const name = lines[i - 1];
      const degree = degreeMatch[1].startsWith('1') ? 1 : degreeMatch[1].startsWith('2') ? 2 : 3;

      // Next lines are title/company and location
      let title: string | null = null;
      let company: string | null = null;
      let location: string | null = null;

      if (i + 1 < lines.length && !lines[i + 1].match(/^(1st|2nd|3rd\+?)$/)) {
        const titleLine = lines[i + 1];
        // Parse "Title at Company" pattern
        const atMatch = titleLine.match(/^(.+?)\s+at\s+(.+)$/i);
        if (atMatch) {
          title = atMatch[1].trim();
          company = atMatch[2].trim();
        } else {
          title = titleLine;
        }
      }

      if (i + 2 < lines.length && !lines[i + 2].match(/^(1st|2nd|3rd\+?)$/)) {
        const locLine = lines[i + 2];
        // Skip if it looks like another person's name or title
        if (!locLine.includes(' at ') && locLine.length < 80) {
          location = locLine;
        }
      }

      // Don't add if name is too short or looks like UI text
      if (name && name.length > 2 && !name.match(/^(people|connect|message)/i)) {
        blocks.push({
          name: cleanName(name),
          title,
          company,
          location,
          degree,
          linkedinUrl: null, // URLs are not in paste text
        });
      }
    }

    i++;
  }

  return blocks;
}
