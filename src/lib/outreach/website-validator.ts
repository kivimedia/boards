/**
 * Website Validator - Validates discovered websites for LinkedIn outreach leads
 *
 * Checks:
 * 1. Domain resolves (HTTP 200 or redirect to live page)
 * 2. Page content contains the lead's name or variant
 * 3. Page references entertainment, magic, kids shows, or party services
 * 4. Location on site is consistent with LinkedIn location
 *
 * Confidence: HIGH (3+ signals), MEDIUM (2 signals), LOW (1 signal)
 */

import type { LILead, LIWebsiteConfidence } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  confidence: LIWebsiteConfidence;
  signals: string[];
  copyright_year: number | null;
  is_professional: boolean;
  has_booking: boolean;
  has_testimonials: boolean;
  has_video: boolean;
  has_press: boolean;
  has_corporate_clients: boolean;
  has_packages: boolean;
  error: string | null;
}

// ============================================================================
// MAIN VALIDATOR
// ============================================================================

export async function validateWebsite(
  url: string,
  lead: LILead
): Promise<ValidationResult> {
  const result: ValidationResult = {
    valid: false,
    confidence: 'LOW',
    signals: [],
    copyright_year: null,
    is_professional: false,
    has_booking: false,
    has_testimonials: false,
    has_video: false,
    has_press: false,
    has_corporate_clients: false,
    has_packages: false,
    error: null,
  };

  // Step 1: Fetch the page
  let html: string;
  try {
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
    const res = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      result.error = `HTTP ${res.status}`;
      return result;
    }

    html = await res.text();
    result.signals.push('Domain resolves');
  } catch (err) {
    result.error = err instanceof Error ? err.message : 'Failed to fetch';
    return result;
  }

  const htmlLower = html.toLowerCase();

  // Step 2: Check for lead's name
  if (lead.full_name) {
    const nameParts = lead.full_name.toLowerCase().split(' ').filter(p => p.length > 2);
    const nameFound = nameParts.every(part => htmlLower.includes(part));
    if (nameFound) {
      result.signals.push('Name found on page');
    } else {
      // Try first name + last name separately
      const firstName = lead.first_name?.toLowerCase();
      const lastName = lead.last_name?.toLowerCase();
      if (firstName && lastName && htmlLower.includes(firstName) && htmlLower.includes(lastName)) {
        result.signals.push('Name parts found on page');
      }
    }
  }

  // Step 3: Check for entertainment content
  const entertainmentKeywords = [
    'magician', 'magic show', 'magic performance',
    'kids entertainer', 'children\'s entertainer', 'party entertainer',
    'birthday party', 'birthday show', 'birthday entertainment',
    'family entertainment', 'corporate entertainment',
    'close-up magic', 'stage magic', 'illusion',
    'kids show', 'children\'s show', 'family show',
    'book now', 'book a show', 'hire a magician',
    'party entertainment', 'event entertainment',
    'comedy magic', 'strolling magic', 'mentalism',
  ];

  const entertainmentMatches = entertainmentKeywords.filter(kw => htmlLower.includes(kw));
  if (entertainmentMatches.length > 0) {
    result.signals.push(`Entertainment content: ${entertainmentMatches.slice(0, 3).join(', ')}`);
  }

  // Step 4: Check location consistency
  if (lead.city || lead.state) {
    const locationParts = [lead.city, lead.state].filter(Boolean).map(p => p!.toLowerCase());
    const locationFound = locationParts.some(part => htmlLower.includes(part));
    if (locationFound) {
      result.signals.push('Location matches');
    }
  }

  // Step 5: Extract copyright year
  const yearMatch = html.match(/(?:copyright|&copy;|©)\s*(?:\d{4}\s*[-,]\s*)?(\d{4})/i);
  if (yearMatch) {
    result.copyright_year = parseInt(yearMatch[1]);
  }

  // Step 6: Detect professional signals
  result.is_professional = detectProfessionalDesign(htmlLower);
  result.has_booking = htmlLower.includes('book') && (htmlLower.includes('form') || htmlLower.includes('contact') || htmlLower.includes('request'));
  result.has_testimonials = htmlLower.includes('testimonial') || htmlLower.includes('review') || htmlLower.includes('what people say') || htmlLower.includes('client says');
  result.has_video = htmlLower.includes('youtube.com/embed') || htmlLower.includes('vimeo.com') || htmlLower.includes('<video') || htmlLower.includes('wistia');
  result.has_press = htmlLower.includes('press') || htmlLower.includes('media') || htmlLower.includes('featured in') || htmlLower.includes('as seen on');
  result.has_corporate_clients = htmlLower.includes('corporate') || htmlLower.includes('fortune 500') || htmlLower.includes('client logos') || htmlLower.includes('trusted by');
  result.has_packages = (htmlLower.match(/package/g) || []).length >= 2 || htmlLower.includes('pricing') || htmlLower.includes('rates');

  // Calculate confidence
  const signalCount = result.signals.length;
  if (signalCount >= 3) {
    result.confidence = 'HIGH';
    result.valid = true;
  } else if (signalCount >= 2) {
    result.confidence = 'MEDIUM';
    result.valid = true;
  } else if (signalCount >= 1) {
    result.confidence = 'LOW';
    result.valid = true; // Valid but needs review
  }

  return result;
}

// ============================================================================
// BATCH VALIDATION
// ============================================================================

export async function validateBatch(
  leads: Array<{ id: string; website: string; lead: LILead }>
): Promise<Map<string, ValidationResult>> {
  const results = new Map<string, ValidationResult>();

  for (const item of leads) {
    // Rate limit: 500ms between requests
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      const result = await validateWebsite(item.website, item.lead);
      results.set(item.id, result);
    } catch (err) {
      results.set(item.id, {
        valid: false,
        confidence: 'LOW',
        signals: [],
        copyright_year: null,
        is_professional: false,
        has_booking: false,
        has_testimonials: false,
        has_video: false,
        has_press: false,
        has_corporate_clients: false,
        has_packages: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return results;
}

// ============================================================================
// HELPERS
// ============================================================================

function detectProfessionalDesign(html: string): boolean {
  // Professional site indicators
  const proSignals = [
    // Custom CSS frameworks or professional builders
    html.includes('wp-content') || html.includes('wordpress'),
    html.includes('squarespace') || html.includes('webflow'),
    // SEO meta tags
    html.includes('og:image') || html.includes('twitter:card'),
    // Schema markup
    html.includes('schema.org') || html.includes('ld+json'),
    // Google Analytics or tracking
    html.includes('gtag') || html.includes('google-analytics') || html.includes('gtm'),
    // SSL and security headers
    html.includes('https://'),
    // Multiple pages (nav with links)
    (html.match(/<nav/gi) || []).length > 0,
    // Custom domain email
    html.includes('mailto:') && !html.includes('gmail.com') && !html.includes('yahoo.com'),
  ].filter(Boolean).length;

  return proSignals >= 3;
}
