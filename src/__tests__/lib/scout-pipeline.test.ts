import { describe, it, expect } from 'vitest';
import {
  parseLinkedInSuggestions,
  parseFullProfile,
  validateConfidence,
} from '@/lib/ai/scout-pipeline';
import type { EnrichedProfile } from '@/lib/types';

// ===========================================================================
// Factory helpers
// ===========================================================================

function makeSuggestionJson(overrides: Record<string, unknown>[] = []): string {
  const defaults = [
    {
      index: 1,
      name: 'Alice Smith',
      title: 'AI Developer',
      location: 'San Francisco, CA',
      linkedin_url: 'https://www.linkedin.com/in/alicesmith',
      summary: 'Builds AI tools for startups',
      source_query: 'site:linkedin.com/in AI developer',
    },
    {
      index: 2,
      name: 'Bob Jones',
      title: 'Vibe Coder',
      location: 'Austin, TX',
      linkedin_url: 'https://www.linkedin.com/in/bobjones',
      summary: 'Makes money with Cursor',
      source_query: 'site:linkedin.com/in vibe coding',
    },
  ];
  const arr = overrides.length > 0 ? overrides : defaults;
  return JSON.stringify(arr);
}

function makeEnrichedProfile(overrides: Partial<EnrichedProfile> = {}): EnrichedProfile {
  return {
    index: 1,
    name: 'Alice Smith',
    title: 'AI Developer',
    location: 'San Francisco, CA',
    company: 'Acme Corp',
    domain: 'acme.com',
    industry: 'Technology',
    linkedin_url: 'https://www.linkedin.com/in/alicesmith',
    email: 'alice@acme.com',
    email_source: 'hunter',
    email_confidence: 95,
    email_verified: true,
    ...overrides,
  };
}

function makeFullProfileJson(overrides: Record<string, unknown> = {}): string {
  const defaults = {
    index: 1,
    name: 'Alice Smith',
    one_liner: 'Builds AI tools for startups',
    email: 'alice@acme.com',
    email_verified: true,
    location: 'San Francisco, CA',
    platform_presence: {
      linkedin: 'https://www.linkedin.com/in/alicesmith',
      website: 'https://alice.dev',
    },
    evidence_of_paid_work: [
      { project: 'Widget App', description: 'Built with Cursor', url: 'https://widget.app' },
    ],
    estimated_reach: { linkedin_connections: 500 },
    tools_used: ['Cursor', 'v0'],
    contact_method: 'email',
    scout_confidence: 'high',
    source: { channel: 'linkedin_scout', linkedin_url: 'https://www.linkedin.com/in/alicesmith' },
  };
  return JSON.stringify({ ...defaults, ...overrides });
}

// ===========================================================================
// parseLinkedInSuggestions
// ===========================================================================

describe('Scout Pipeline - parseLinkedInSuggestions', () => {
  it('parses a valid JSON array of suggestions', () => {
    const result = parseLinkedInSuggestions(makeSuggestionJson());
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Alice Smith');
    expect(result[1].name).toBe('Bob Jones');
  });

  it('extracts JSON from a ```json code block', () => {
    const text = 'Here are the results:\n```json\n' + makeSuggestionJson() + '\n```\nDone.';
    const result = parseLinkedInSuggestions(text);
    expect(result).toHaveLength(2);
    expect(result[0].linkedin_url).toBe('https://www.linkedin.com/in/alicesmith');
  });

  it('extracts JSON from a ``` code block without language tag', () => {
    const text = 'Results:\n```\n' + makeSuggestionJson() + '\n```';
    const result = parseLinkedInSuggestions(text);
    expect(result).toHaveLength(2);
  });

  it('handles raw JSON without code blocks', () => {
    const result = parseLinkedInSuggestions(makeSuggestionJson());
    expect(result).toHaveLength(2);
  });

  it('returns empty array for empty string', () => {
    expect(parseLinkedInSuggestions('')).toEqual([]);
  });

  it('returns empty array for non-JSON text', () => {
    expect(parseLinkedInSuggestions('No JSON here, just plain text.')).toEqual([]);
  });

  it('returns empty array for malformed JSON', () => {
    expect(parseLinkedInSuggestions('[{broken json}')).toEqual([]);
  });

  it('returns empty array for a JSON object instead of array', () => {
    expect(parseLinkedInSuggestions('{"not": "an array"}')).toEqual([]);
  });

  it('filters out entries missing name', () => {
    const items = [
      { index: 1, name: '', title: 'Dev', linkedin_url: 'https://www.linkedin.com/in/someone' },
      { index: 2, name: 'Bob', title: 'Dev', linkedin_url: 'https://www.linkedin.com/in/bob' },
    ];
    const result = parseLinkedInSuggestions(JSON.stringify(items));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bob');
  });

  it('filters out entries missing linkedin_url', () => {
    const items = [
      { index: 1, name: 'Alice', title: 'Dev', linkedin_url: '' },
      { index: 2, name: 'Bob', title: 'Dev', linkedin_url: 'https://www.linkedin.com/in/bob' },
    ];
    const result = parseLinkedInSuggestions(JSON.stringify(items));
    expect(result).toHaveLength(1);
  });

  it('filters out entries with non-LinkedIn URLs', () => {
    const items = [
      { index: 1, name: 'Alice', title: 'Dev', linkedin_url: 'https://twitter.com/alice' },
      { index: 2, name: 'Bob', title: 'Dev', linkedin_url: 'https://www.linkedin.com/in/bob' },
    ];
    const result = parseLinkedInSuggestions(JSON.stringify(items));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bob');
  });

  it('maps headline field to title', () => {
    const items = [
      { index: 1, name: 'Alice', headline: 'Senior Dev', linkedin_url: 'https://www.linkedin.com/in/alice' },
    ];
    const result = parseLinkedInSuggestions(JSON.stringify(items));
    expect(result[0].title).toBe('Senior Dev');
  });

  it('maps why field to summary', () => {
    const items = [
      { index: 1, name: 'Alice', why: 'Great candidate', linkedin_url: 'https://www.linkedin.com/in/alice' },
    ];
    const result = parseLinkedInSuggestions(JSON.stringify(items));
    expect(result[0].summary).toBe('Great candidate');
  });

  it('maps query field to source_query', () => {
    const items = [
      { index: 1, name: 'Alice', query: 'AI freelancer', linkedin_url: 'https://www.linkedin.com/in/alice' },
    ];
    const result = parseLinkedInSuggestions(JSON.stringify(items));
    expect(result[0].source_query).toBe('AI freelancer');
  });

  it('assigns sequential index when index field is missing', () => {
    const items = [
      { name: 'Alice', title: 'Dev', linkedin_url: 'https://www.linkedin.com/in/alice' },
      { name: 'Bob', title: 'Dev', linkedin_url: 'https://www.linkedin.com/in/bob' },
    ];
    const result = parseLinkedInSuggestions(JSON.stringify(items));
    expect(result[0].index).toBe(1);
    expect(result[1].index).toBe(2);
  });

  it('defaults missing optional fields to empty strings', () => {
    const items = [
      { index: 1, name: 'Alice', linkedin_url: 'https://www.linkedin.com/in/alice' },
    ];
    const result = parseLinkedInSuggestions(JSON.stringify(items));
    expect(result[0].title).toBe('');
    expect(result[0].location).toBe('');
    expect(result[0].summary).toBe('');
    expect(result[0].source_query).toBe('');
  });

  it('handles JSON surrounded by prose text', () => {
    const text = 'I found the following profiles:\n\n' + makeSuggestionJson() + '\n\nThese are real profiles.';
    const result = parseLinkedInSuggestions(text);
    expect(result).toHaveLength(2);
  });
});

// ===========================================================================
// parseFullProfile
// ===========================================================================

describe('Scout Pipeline - parseFullProfile', () => {
  it('parses a valid full profile JSON', () => {
    const fallback = makeEnrichedProfile();
    const result = parseFullProfile(makeFullProfileJson(), fallback);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Alice Smith');
    expect(result!.one_liner).toBe('Builds AI tools for startups');
    expect(result!.scout_confidence).toBe('high');
  });

  it('extracts JSON from a code block', () => {
    const text = 'Research complete:\n```json\n' + makeFullProfileJson() + '\n```';
    const fallback = makeEnrichedProfile();
    const result = parseFullProfile(text, fallback);
    expect(result).not.toBeNull();
    expect(result!.tools_used).toContain('Cursor');
  });

  it('returns null when no JSON is found', () => {
    const fallback = makeEnrichedProfile();
    expect(parseFullProfile('No JSON here at all', fallback)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    const fallback = makeEnrichedProfile();
    expect(parseFullProfile('{broken: json}', fallback)).toBeNull();
  });

  it('falls back to enriched profile index when missing from JSON', () => {
    const fallback = makeEnrichedProfile({ index: 7 });
    const json = makeFullProfileJson({ index: undefined });
    // Remove index key entirely from the JSON
    const obj = JSON.parse(json);
    delete obj.index;
    const result = parseFullProfile(JSON.stringify(obj), fallback);
    expect(result).not.toBeNull();
    expect(result!.index).toBe(7);
  });

  it('falls back to enriched profile name when empty in JSON', () => {
    const fallback = makeEnrichedProfile({ name: 'Fallback Name' });
    const result = parseFullProfile(makeFullProfileJson({ name: '' }), fallback);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Fallback Name');
  });

  it('falls back to enriched profile email when missing in JSON', () => {
    const fallback = makeEnrichedProfile({ email: 'fallback@test.com' });
    const result = parseFullProfile(makeFullProfileJson({ email: null }), fallback);
    expect(result).not.toBeNull();
    expect(result!.email).toBe('fallback@test.com');
  });

  it('sets contact_method to email when fallback has email and JSON has no contact_method', () => {
    const fallback = makeEnrichedProfile({ email: 'alice@acme.com' });
    const obj = JSON.parse(makeFullProfileJson());
    delete obj.contact_method;
    const result = parseFullProfile(JSON.stringify(obj), fallback);
    expect(result).not.toBeNull();
    expect(result!.contact_method).toBe('email');
  });

  it('sets contact_method to linkedin_dm when fallback has no email and JSON has no contact_method', () => {
    const fallback = makeEnrichedProfile({ email: null });
    const obj = JSON.parse(makeFullProfileJson());
    delete obj.contact_method;
    delete obj.email;
    const result = parseFullProfile(JSON.stringify(obj), fallback);
    expect(result).not.toBeNull();
    expect(result!.contact_method).toBe('linkedin_dm');
  });

  it('defaults platform_presence to linkedin from fallback when missing', () => {
    const fallback = makeEnrichedProfile({ linkedin_url: 'https://www.linkedin.com/in/test' });
    const obj = JSON.parse(makeFullProfileJson());
    delete obj.platform_presence;
    const result = parseFullProfile(JSON.stringify(obj), fallback);
    expect(result).not.toBeNull();
    expect(result!.platform_presence.linkedin).toBe('https://www.linkedin.com/in/test');
  });

  it('defaults evidence_of_paid_work to empty array when missing', () => {
    const fallback = makeEnrichedProfile();
    const obj = JSON.parse(makeFullProfileJson());
    delete obj.evidence_of_paid_work;
    const result = parseFullProfile(JSON.stringify(obj), fallback);
    expect(result).not.toBeNull();
    expect(result!.evidence_of_paid_work).toEqual([]);
  });

  it('validates scout_confidence through validateConfidence', () => {
    const fallback = makeEnrichedProfile();
    const result = parseFullProfile(makeFullProfileJson({ scout_confidence: 'invalid' }), fallback);
    expect(result).not.toBeNull();
    expect(result!.scout_confidence).toBe('medium');
  });
});

// ===========================================================================
// validateConfidence
// ===========================================================================

describe('Scout Pipeline - validateConfidence', () => {
  it('returns high for "high"', () => {
    expect(validateConfidence('high')).toBe('high');
  });

  it('returns medium for "medium"', () => {
    expect(validateConfidence('medium')).toBe('medium');
  });

  it('returns low for "low"', () => {
    expect(validateConfidence('low')).toBe('low');
  });

  it('returns medium for empty string', () => {
    expect(validateConfidence('')).toBe('medium');
  });

  it('returns medium for undefined cast to string', () => {
    expect(validateConfidence(undefined as unknown as string)).toBe('medium');
  });

  it('returns medium for "HIGH" (case sensitive)', () => {
    expect(validateConfidence('HIGH')).toBe('medium');
  });

  it('returns medium for random string', () => {
    expect(validateConfidence('very_high')).toBe('medium');
  });

  it('returns medium for null cast to string', () => {
    expect(validateConfidence(null as unknown as string)).toBe('medium');
  });
});
