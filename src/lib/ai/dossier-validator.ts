/**
 * Dossier Validator - The Skeptic Pass
 *
 * Validates every personalization element in a research dossier before
 * it can be used in outreach copy. This is the quality gate that prevents
 * embarrassing mistakes and fabricated personalization.
 *
 * Ported from the local podcast outreach agent's validator.py
 */

import type { PersonalizationElement, ResearchDossier } from './research-dossier';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Maximum age in days for different source types */
export const FRESHNESS_LIMITS: Record<string, number> = {
  'LinkedIn post': 90,
  'X/Twitter': 90,
  'Blog post': 365,
  'Personal website': 365,
  'Podcast/Interview': 365,
  'Product Hunt': 180,
  'Indie Hackers': 180,
  'News/Press': 365,
  evergreen: 99999,
};

export interface ValidationIssue {
  check: string;
  passed: boolean;
  detail: string;
}

export interface ElementValidationResult {
  status: 'verified' | 'unverified' | 'stale' | 'risky';
  issues: ValidationIssue[];
  checks_passed: number;
  checks_total: number;
}

export interface DossierValidationSummary {
  total_elements: number;
  verified: number;
  unverified: number;
  stale: number;
  risky: number;
  usable_for_copy: boolean;
  validation_date: string;
  element_results: ElementValidationResult[];
}

export interface CopyValidationResult {
  passed: boolean;
  all_claims_traced: boolean;
  no_filler_phrases: boolean;
  booking_link_present: boolean;
  word_count_ok: boolean;
  no_emdashes: boolean;
  issues: string[];
}

// ============================================================================
// DOSSIER VALIDATION
// ============================================================================

/**
 * Run full validation on all personalization elements in a dossier.
 * Returns a summary with per-element results.
 */
export function validateDossier(
  elements: PersonalizationElement[]
): DossierValidationSummary {
  const results: ElementValidationResult[] = elements.map((element) =>
    validateElement(element)
  );

  // Update each element with its validation result
  for (let i = 0; i < elements.length; i++) {
    elements[i].verification_status = results[i].status;
    elements[i].validation_details = results[i];
  }

  const verified = results.filter((r) => r.status === 'verified').length;
  const unverified = results.filter((r) => r.status === 'unverified').length;
  const stale = results.filter((r) => r.status === 'stale').length;
  const risky = results.filter((r) => r.status === 'risky').length;

  return {
    total_elements: elements.length,
    verified,
    unverified,
    stale,
    risky,
    usable_for_copy: verified >= 3,
    validation_date: new Date().toISOString(),
    element_results: results,
  };
}

/**
 * Validate a single personalization element.
 */
export function validateElement(
  element: PersonalizationElement
): ElementValidationResult {
  const TOTAL_CHECKS = 7;
  const issues: ValidationIssue[] = [];

  // Check 1: Has a source URL
  if (!element.source_url) {
    issues.push({
      check: 'url_accessible',
      passed: false,
      detail: 'No source URL provided',
    });
  }

  // Check 2: Has evidence/quote
  if (!element.screenshot_or_quote) {
    issues.push({
      check: 'content_matches',
      passed: false,
      detail: 'No quote or evidence captured from source',
    });
  }

  // Check 3: Freshness
  if (element.date_found && element.date_found !== 'evergreen') {
    try {
      const foundDate = new Date(element.date_found);
      if (!isNaN(foundDate.getTime())) {
        const maxAge =
          FRESHNESS_LIMITS[element.source_type] ??
          FRESHNESS_LIMITS.evergreen;
        const ageMs = Date.now() - foundDate.getTime();
        const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
        if (ageDays > maxAge) {
          issues.push({
            check: 'fresh_enough',
            passed: false,
            detail: `Content is ${ageDays} days old (limit: ${maxAge} for ${element.source_type})`,
          });
        }
      } else {
        issues.push({
          check: 'fresh_enough',
          passed: false,
          detail: `Could not parse date: ${element.date_found}`,
        });
      }
    } catch {
      issues.push({
        check: 'fresh_enough',
        passed: false,
        detail: `Could not parse date: ${element.date_found}`,
      });
    }
  }

  // Check 4: Confidence level
  if (element.confidence === 'low') {
    issues.push({
      check: 'right_person',
      passed: false,
      detail: 'Low confidence; possible name collision or ambiguous source',
    });
  }

  // Check 5: Fact is substantive (not too vague)
  if (element.fact && element.fact.length < 20) {
    issues.push({
      check: 'would_recognize',
      passed: false,
      detail: 'Fact is too vague or short to be useful in outreach',
    });
  }

  // Determine overall status
  let status: ElementValidationResult['status'];
  if (issues.length === 0) {
    status = 'verified';
  } else if (issues.some((i) => i.check === 'url_accessible' && !i.passed)) {
    status = 'unverified';
  } else if (issues.some((i) => i.check === 'fresh_enough' && !i.passed)) {
    status = 'stale';
  } else if (issues.some((i) => i.check === 'right_person' && !i.passed)) {
    status = 'risky';
  } else {
    status = 'unverified';
  }

  return {
    status,
    issues,
    checks_passed: TOTAL_CHECKS - issues.length,
    checks_total: TOTAL_CHECKS,
  };
}

// ============================================================================
// COPY VALIDATION (Post-Draft)
// ============================================================================

/** Banned filler phrases that should never appear in cold outreach */
const FILLER_PHRASES = [
  'game-changer',
  'game changer',
  'invaluable',
  'breath of fresh air',
  'next level',
  'next-level',
  "let's be real",
  "let's be honest",
  "i'd be thrilled",
  'incredibly valuable',
  'absolute gold',
  'beyond inspiring',
  'truly inspiring',
  'empowering',
  'your success story deserves to be heard',
  'truly remarkable',
  'it would be an honor',
  'phenomenal',
  'groundbreaking',
  'revolutionary',
  'incredible journey',
  'amazing work',
  'blown away',
];

/**
 * Validate generated outreach copy against dossier and quality rules.
 * This is the Copy Authenticity Check from the spec.
 *
 * @param emailBody - The generated email body text
 * @param dossier - The research dossier to check claims against
 * @param bookingUrl - The booking link that should be in the email
 */
export function validateCopy(
  emailBody: string,
  dossier: PersonalizationElement[],
  bookingUrl: string = 'kivimedia.co'
): CopyValidationResult {
  const issues: string[] = [];
  const bodyLower = emailBody.toLowerCase();

  // Check for banned filler phrases
  let noFillerPhrases = true;
  for (const phrase of FILLER_PHRASES) {
    if (bodyLower.includes(phrase.toLowerCase())) {
      noFillerPhrases = false;
      issues.push(`Filler phrase detected: '${phrase}'`);
    }
  }

  // Check for em dashes
  let noEmdashes = true;
  if (emailBody.includes('\u2014') || emailBody.includes(' -- ')) {
    noEmdashes = false;
    issues.push(
      'Em dash or double dash detected. Use commas, periods, or rewrite.'
    );
  }

  // Check word count
  const wordCount = emailBody.split(/\s+/).filter(Boolean).length;
  let wordCountOk = true;
  if (wordCount > 180) {
    wordCountOk = false;
    issues.push(`Email is ${wordCount} words (target: 100-150, max: 180)`);
  }
  if (wordCount < 50) {
    wordCountOk = false;
    issues.push(`Email is only ${wordCount} words (minimum: 50)`);
  }

  // Check booking link
  let bookingLinkPresent = true;
  if (
    !emailBody.includes(bookingUrl) &&
    !bodyLower.includes('booking') &&
    !bodyLower.includes('calendly') &&
    !bodyLower.includes('schedule')
  ) {
    bookingLinkPresent = false;
    issues.push('No booking link or scheduling reference found in email body');
  }

  // Check claims are traced to verified dossier elements
  const verifiedElements = dossier.filter(
    (e) => e.verification_status === 'verified'
  );
  const allClaimsTraced = verifiedElements.length >= 1;
  if (!allClaimsTraced) {
    issues.push(
      'No verified personalization elements available to back claims'
    );
  }

  const passed =
    allClaimsTraced &&
    noFillerPhrases &&
    bookingLinkPresent &&
    wordCountOk &&
    noEmdashes;

  return {
    passed,
    all_claims_traced: allClaimsTraced,
    no_filler_phrases: noFillerPhrases,
    booking_link_present: bookingLinkPresent,
    word_count_ok: wordCountOk,
    no_emdashes: noEmdashes,
    issues,
  };
}
