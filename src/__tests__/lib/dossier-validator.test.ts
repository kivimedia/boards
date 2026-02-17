import { describe, it, expect } from 'vitest';
import {
  validateDossier,
  validateElement,
  validateCopy,
  FRESHNESS_LIMITS,
} from '@/lib/ai/dossier-validator';
import type { PersonalizationElement } from '@/lib/ai/research-dossier';

// ============================================================================
// Helper to build elements
// ============================================================================

function makeElement(overrides: Partial<PersonalizationElement> = {}): PersonalizationElement {
  return {
    fact: 'Built a SaaS app that generates $5K MRR using Cursor',
    source_url: 'https://linkedin.com/in/testuser/posts/12345',
    source_type: 'LinkedIn post',
    screenshot_or_quote: 'Just hit $5K MRR on my AI-built SaaS',
    date_found: new Date().toISOString().split('T')[0], // today
    confidence: 'high',
    verification_status: 'unverified',
    ...overrides,
  };
}

// ============================================================================
// validateElement
// ============================================================================

describe('validateElement', () => {
  it('returns verified when all checks pass', () => {
    const element = makeElement();
    const result = validateElement(element);
    expect(result.status).toBe('verified');
    expect(result.issues).toHaveLength(0);
    expect(result.checks_passed).toBe(7);
  });

  it('returns unverified when source_url is missing', () => {
    const element = makeElement({ source_url: '' });
    const result = validateElement(element);
    expect(result.status).toBe('unverified');
    expect(result.issues.some((i) => i.check === 'url_accessible')).toBe(true);
  });

  it('returns unverified when evidence/quote is missing', () => {
    const element = makeElement({ screenshot_or_quote: '' });
    const result = validateElement(element);
    expect(result.status).toBe('unverified');
    expect(result.issues.some((i) => i.check === 'content_matches')).toBe(true);
  });

  it('returns stale when content is too old for source type', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100); // 100 days ago
    const element = makeElement({
      source_type: 'LinkedIn post', // limit: 90 days
      date_found: oldDate.toISOString().split('T')[0],
    });
    const result = validateElement(element);
    expect(result.status).toBe('stale');
    expect(result.issues.some((i) => i.check === 'fresh_enough')).toBe(true);
  });

  it('passes freshness for LinkedIn post within 90 days', () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 30); // 30 days ago
    const element = makeElement({
      source_type: 'LinkedIn post',
      date_found: recentDate.toISOString().split('T')[0],
    });
    const result = validateElement(element);
    expect(result.issues.some((i) => i.check === 'fresh_enough')).toBe(false);
  });

  it('allows evergreen content to pass freshness', () => {
    const element = makeElement({ date_found: 'evergreen' });
    const result = validateElement(element);
    expect(result.issues.some((i) => i.check === 'fresh_enough')).toBe(false);
  });

  it('returns risky when confidence is low', () => {
    const element = makeElement({ confidence: 'low' });
    const result = validateElement(element);
    expect(result.status).toBe('risky');
    expect(result.issues.some((i) => i.check === 'right_person')).toBe(true);
  });

  it('flags facts that are too short', () => {
    const element = makeElement({ fact: 'Has a website' });
    const result = validateElement(element);
    expect(result.issues.some((i) => i.check === 'would_recognize')).toBe(true);
  });

  it('handles unparseable dates', () => {
    const element = makeElement({ date_found: 'not-a-date' });
    const result = validateElement(element);
    expect(result.issues.some((i) => i.check === 'fresh_enough')).toBe(true);
    expect(result.issues.find((i) => i.check === 'fresh_enough')!.detail).toContain(
      'Could not parse date'
    );
  });

  it('returns correct checks_total', () => {
    const result = validateElement(makeElement());
    expect(result.checks_total).toBe(7);
  });
});

// ============================================================================
// validateDossier
// ============================================================================

describe('validateDossier', () => {
  it('marks dossier as usable when >= 3 elements are verified', () => {
    const elements = [
      makeElement(),
      makeElement({ fact: 'Launched ProductA on Product Hunt with 500+ upvotes' }),
      makeElement({ fact: 'Runs a YouTube channel with 10K subscribers about AI coding' }),
    ];
    const summary = validateDossier(elements);
    expect(summary.verified).toBe(3);
    expect(summary.usable_for_copy).toBe(true);
  });

  it('marks dossier as not usable when < 3 elements are verified', () => {
    const elements = [
      makeElement(),
      makeElement({ source_url: '' }), // unverified
      makeElement({ confidence: 'low' }), // risky
    ];
    const summary = validateDossier(elements);
    expect(summary.verified).toBe(1);
    expect(summary.usable_for_copy).toBe(false);
  });

  it('counts statuses correctly', () => {
    const elements = [
      makeElement(), // verified
      makeElement({ source_url: '' }), // unverified
      makeElement({ confidence: 'low' }), // risky
    ];
    const summary = validateDossier(elements);
    expect(summary.total_elements).toBe(3);
    expect(summary.verified).toBe(1);
    expect(summary.unverified).toBe(1);
    expect(summary.risky).toBe(1);
    expect(summary.stale).toBe(0);
  });

  it('mutates element verification_status', () => {
    const elements = [makeElement()];
    validateDossier(elements);
    expect(elements[0].verification_status).toBe('verified');
  });

  it('includes validation_date', () => {
    const summary = validateDossier([makeElement()]);
    expect(summary.validation_date).toBeTruthy();
    expect(new Date(summary.validation_date).getTime()).not.toBeNaN();
  });

  it('handles empty elements array', () => {
    const summary = validateDossier([]);
    expect(summary.total_elements).toBe(0);
    expect(summary.usable_for_copy).toBe(false);
  });
});

// ============================================================================
// validateCopy
// ============================================================================

describe('validateCopy', () => {
  const goodEmail = `Your recent Product Hunt launch of TaskFlow caught my eye. Building a SaaS product entirely with Cursor is exactly the kind of story our listeners love.

I host the Vibe Coding Deals podcast where we interview builders making real money with AI tools. Would love to have you share your $5K MRR journey.

Open to a 30-min chat? Here's my booking link: kivimedia.co/book

Cheers,
Ravi`;

  const verifiedElements: PersonalizationElement[] = [
    makeElement(),
    makeElement({ fact: 'Launched TaskFlow on Product Hunt with 500+ upvotes' }),
    makeElement({ fact: 'Runs a YouTube channel about AI coding', verification_status: 'verified' }),
  ];

  it('passes for a well-written email', () => {
    // Mark elements as verified
    const elements = verifiedElements.map((e) => ({ ...e, verification_status: 'verified' as const }));
    const result = validateCopy(goodEmail, elements);
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('detects filler phrases', () => {
    const badEmail = goodEmail.replace('caught my eye', 'was truly inspiring and a game-changer');
    const elements = verifiedElements.map((e) => ({ ...e, verification_status: 'verified' as const }));
    const result = validateCopy(badEmail, elements);
    expect(result.no_filler_phrases).toBe(false);
    expect(result.issues.some((i) => i.includes('game-changer'))).toBe(true);
  });

  it('detects em dashes', () => {
    const badEmail = goodEmail.replace('.', ' \u2014 ');
    const elements = verifiedElements.map((e) => ({ ...e, verification_status: 'verified' as const }));
    const result = validateCopy(badEmail, elements);
    expect(result.no_emdashes).toBe(false);
  });

  it('detects double dashes', () => {
    const badEmail = goodEmail.replace('.', ' -- ');
    const elements = verifiedElements.map((e) => ({ ...e, verification_status: 'verified' as const }));
    const result = validateCopy(badEmail, elements);
    expect(result.no_emdashes).toBe(false);
  });

  it('flags emails that are too long', () => {
    const longEmail = goodEmail + ' ' + 'word '.repeat(200);
    const elements = verifiedElements.map((e) => ({ ...e, verification_status: 'verified' as const }));
    const result = validateCopy(longEmail, elements);
    expect(result.word_count_ok).toBe(false);
    expect(result.issues.some((i) => i.includes('words'))).toBe(true);
  });

  it('flags emails that are too short', () => {
    const shortEmail = 'Hi, book a call.';
    const elements = verifiedElements.map((e) => ({ ...e, verification_status: 'verified' as const }));
    const result = validateCopy(shortEmail, elements);
    expect(result.word_count_ok).toBe(false);
  });

  it('flags missing booking link', () => {
    const noLink = goodEmail.replace('kivimedia.co/book', 'my website');
    const elements = verifiedElements.map((e) => ({ ...e, verification_status: 'verified' as const }));
    const result = validateCopy(noLink, elements);
    // Should still pass if "booking" is mentioned
    // Let's remove booking references entirely
    const realNoLink = noLink.replace(/booking/gi, 'page').replace(/schedule/gi, 'page');
    const result2 = validateCopy(realNoLink, elements, 'nonexistent.com');
    expect(result2.booking_link_present).toBe(false);
  });

  it('flags when no verified elements exist', () => {
    const noVerified = verifiedElements.map((e) => ({ ...e, verification_status: 'unverified' as const }));
    const result = validateCopy(goodEmail, noVerified);
    expect(result.all_claims_traced).toBe(false);
  });

  it('accepts calendly as booking reference', () => {
    const calEmail = goodEmail.replace('kivimedia.co/book', 'calendly.com/ravi');
    const elements = verifiedElements.map((e) => ({ ...e, verification_status: 'verified' as const }));
    const result = validateCopy(calEmail, elements);
    expect(result.booking_link_present).toBe(true);
  });
});

// ============================================================================
// FRESHNESS_LIMITS config
// ============================================================================

describe('FRESHNESS_LIMITS', () => {
  it('has limits for all source types', () => {
    expect(FRESHNESS_LIMITS['LinkedIn post']).toBe(90);
    expect(FRESHNESS_LIMITS['X/Twitter']).toBe(90);
    expect(FRESHNESS_LIMITS['Personal website']).toBe(365);
    expect(FRESHNESS_LIMITS['Podcast/Interview']).toBe(365);
    expect(FRESHNESS_LIMITS['Product Hunt']).toBe(180);
    expect(FRESHNESS_LIMITS['News/Press']).toBe(365);
    expect(FRESHNESS_LIMITS.evergreen).toBe(99999);
  });
});
