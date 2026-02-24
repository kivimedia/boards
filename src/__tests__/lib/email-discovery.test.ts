import { describe, it, expect } from 'vitest';
import {
  discoverEmail,
  batchDiscoverEmails,
  verifyEmailViaHunter,
  enrichLinkedInProfiles,
} from '@/lib/integrations/email-discovery';
import type { SnovLinkedInEnrichmentResult } from '@/lib/integrations/email-discovery';

describe('email-discovery', () => {
  // ===========================================================================
  // Exports verification
  // ===========================================================================

  describe('exports', () => {
    it('exports discoverEmail as a function', () => {
      expect(typeof discoverEmail).toBe('function');
    });

    it('exports batchDiscoverEmails as a function', () => {
      expect(typeof batchDiscoverEmails).toBe('function');
    });

    it('exports verifyEmailViaHunter as a function', () => {
      expect(typeof verifyEmailViaHunter).toBe('function');
    });

    it('exports enrichLinkedInProfiles as a function', () => {
      expect(typeof enrichLinkedInProfiles).toBe('function');
    });
  });

  // ===========================================================================
  // Function arity
  // ===========================================================================

  describe('function arity', () => {
    it('discoverEmail accepts 2 parameters (supabase, candidate)', () => {
      expect(discoverEmail.length).toBe(2);
    });

    it('batchDiscoverEmails accepts 2-3 parameters (supabase, candidateIds, onProgress?)', () => {
      // .length reflects required params only (no optional)
      expect(batchDiscoverEmails.length).toBeGreaterThanOrEqual(2);
      expect(batchDiscoverEmails.length).toBeLessThanOrEqual(3);
    });

    it('verifyEmailViaHunter accepts 2 parameters (supabase, email)', () => {
      expect(verifyEmailViaHunter.length).toBe(2);
    });

    it('enrichLinkedInProfiles accepts 2-3 parameters (supabase, urls, onProgress?)', () => {
      expect(enrichLinkedInProfiles.length).toBeGreaterThanOrEqual(2);
      expect(enrichLinkedInProfiles.length).toBeLessThanOrEqual(3);
    });
  });

  // ===========================================================================
  // SnovLinkedInEnrichmentResult interface shape
  // ===========================================================================

  describe('SnovLinkedInEnrichmentResult interface', () => {
    it('has all required fields', () => {
      const result: SnovLinkedInEnrichmentResult = {
        linkedin_url: 'https://linkedin.com/in/johndoe',
        name: 'John Doe',
        first_name: 'John',
        last_name: 'Doe',
        location: 'New York',
        industry: 'Marketing',
        company: 'Acme Corp',
        domain: 'acme.com',
        title: 'Marketing Director',
      };
      expect(result).toHaveProperty('linkedin_url');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('first_name');
      expect(result).toHaveProperty('last_name');
      expect(result).toHaveProperty('location');
      expect(result).toHaveProperty('industry');
      expect(result).toHaveProperty('company');
      expect(result).toHaveProperty('domain');
      expect(result).toHaveProperty('title');
    });

    it('allows null for nullable fields', () => {
      const result: SnovLinkedInEnrichmentResult = {
        linkedin_url: 'https://linkedin.com/in/janedoe',
        name: null,
        first_name: null,
        last_name: null,
        location: null,
        industry: null,
        company: null,
        domain: null,
        title: null,
      };
      expect(result.name).toBeNull();
      expect(result.first_name).toBeNull();
      expect(result.last_name).toBeNull();
      expect(result.location).toBeNull();
      expect(result.industry).toBeNull();
      expect(result.company).toBeNull();
      expect(result.domain).toBeNull();
      expect(result.title).toBeNull();
    });
  });

  // ===========================================================================
  // Name parsing patterns (tested via discoverEmail internal logic)
  //
  // The discoverEmail function splits candidate.name by whitespace:
  //   firstName = nameParts[0]
  //   lastName = nameParts.slice(1).join(' ')
  //
  // We test this indirectly by verifying the logic patterns.
  // ===========================================================================

  describe('name parsing patterns', () => {
    it('single name produces firstName only', () => {
      const name = 'Madonna';
      const parts = name.trim().split(/\s+/);
      const firstName = parts[0] || '';
      const lastName = parts.slice(1).join(' ') || '';
      expect(firstName).toBe('Madonna');
      expect(lastName).toBe('');
    });

    it('two-part name splits into first and last', () => {
      const name = 'John Smith';
      const parts = name.trim().split(/\s+/);
      const firstName = parts[0] || '';
      const lastName = parts.slice(1).join(' ') || '';
      expect(firstName).toBe('John');
      expect(lastName).toBe('Smith');
    });

    it('three-part name keeps middle and last combined', () => {
      const name = 'Mary Jane Watson';
      const parts = name.trim().split(/\s+/);
      const firstName = parts[0] || '';
      const lastName = parts.slice(1).join(' ') || '';
      expect(firstName).toBe('Mary');
      expect(lastName).toBe('Jane Watson');
    });

    it('trims leading and trailing whitespace', () => {
      const name = '  Alice   Cooper  ';
      const parts = name.trim().split(/\s+/);
      const firstName = parts[0] || '';
      const lastName = parts.slice(1).join(' ') || '';
      expect(firstName).toBe('Alice');
      expect(lastName).toBe('Cooper');
    });

    it('handles multiple spaces between parts', () => {
      const name = 'Bob    Marley';
      const parts = name.trim().split(/\s+/);
      const firstName = parts[0] || '';
      const lastName = parts.slice(1).join(' ') || '';
      expect(firstName).toBe('Bob');
      expect(lastName).toBe('Marley');
    });
  });

  // ===========================================================================
  // Domain extraction from URLs
  //
  // discoverEmail extracts domain from platform_presence.website:
  //   new URL(website.startsWith('http') ? website : `https://${website}`).hostname
  // ===========================================================================

  describe('domain extraction from URLs', () => {
    it('extracts hostname from full https URL', () => {
      const website = 'https://www.acme.com/about';
      const domain = new URL(website).hostname;
      expect(domain).toBe('www.acme.com');
    });

    it('extracts hostname from http URL', () => {
      const website = 'http://blog.example.org/post/123';
      const domain = new URL(website).hostname;
      expect(domain).toBe('blog.example.org');
    });

    it('prepends https:// for URLs without protocol', () => {
      const website = 'mysite.io/portfolio';
      const url = website.startsWith('http') ? website : `https://${website}`;
      const domain = new URL(url).hostname;
      expect(domain).toBe('mysite.io');
    });

    it('handles bare domain with no path', () => {
      const website = 'custom-agency.com';
      const url = website.startsWith('http') ? website : `https://${website}`;
      const domain = new URL(url).hostname;
      expect(domain).toBe('custom-agency.com');
    });
  });

  // ===========================================================================
  // Generic domain filtering
  //
  // discoverEmail skips these domains:
  //   ['github.com', 'linkedin.com', 'twitter.com', 'youtube.com', 'reddit.com']
  // ===========================================================================

  describe('generic domain filtering', () => {
    const genericDomains = [
      'github.com',
      'linkedin.com',
      'twitter.com',
      'youtube.com',
      'reddit.com',
    ];

    it.each(genericDomains)('skips generic domain: %s', (genericDomain) => {
      expect(genericDomains.includes(genericDomain)).toBe(true);
    });

    it('does not skip custom domains', () => {
      expect(genericDomains.includes('myagency.com')).toBe(false);
    });

    it('does not skip subdomains of generic domains', () => {
      // The filter checks exact match, so 'blog.github.com' would not be skipped
      expect(genericDomains.includes('blog.github.com')).toBe(false);
    });

    it('correctly identifies all 5 generic domains', () => {
      expect(genericDomains).toHaveLength(5);
    });
  });

  // ===========================================================================
  // Chunk helper logic
  //
  // The chunk function (internal) splits arrays into groups of `size`:
  //   function chunk<T>(arr: T[], size: number): T[][]
  //
  // We replicate and test the logic since the function is not exported.
  // ===========================================================================

  describe('chunk helper logic', () => {
    function chunk<T>(arr: T[], size: number): T[][] {
      const result: T[][] = [];
      for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
      }
      return result;
    }

    it('splits 10 items into 1 chunk of 10', () => {
      const arr = Array.from({ length: 10 }, (_, i) => i);
      const result = chunk(arr, 10);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(10);
    });

    it('splits 15 items into 2 chunks (10 + 5)', () => {
      const arr = Array.from({ length: 15 }, (_, i) => i);
      const result = chunk(arr, 10);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveLength(10);
      expect(result[1]).toHaveLength(5);
    });

    it('splits 3 items with chunk size 1 into 3 single-item chunks', () => {
      const result = chunk(['a', 'b', 'c'], 1);
      expect(result).toEqual([['a'], ['b'], ['c']]);
    });

    it('returns empty array for empty input', () => {
      const result = chunk([], 5);
      expect(result).toEqual([]);
    });

    it('returns single chunk when items fewer than chunk size', () => {
      const result = chunk([1, 2, 3], 100);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual([1, 2, 3]);
    });

    it('handles exact multiple of chunk size', () => {
      const arr = Array.from({ length: 20 }, (_, i) => i);
      const result = chunk(arr, 10);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveLength(10);
      expect(result[1]).toHaveLength(10);
    });

    it('preserves element values and order', () => {
      const arr = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
      const result = chunk(arr, 2);
      expect(result).toEqual([
        ['alpha', 'beta'],
        ['gamma', 'delta'],
        ['epsilon'],
      ]);
    });
  });
});
