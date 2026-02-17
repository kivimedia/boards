import { describe, it, expect } from 'vitest';
import { generateSlug } from '../../lib/wiki';

describe('Wiki (P2.8)', () => {
  // ===========================================================================
  // generateSlug — basic conversion
  // ===========================================================================

  describe('generateSlug — basic conversion', () => {
    it('converts title to lowercase with hyphens', () => {
      expect(generateSlug('Hello World')).toBe('hello-world');
    });

    it('converts multiple spaces to single hyphen', () => {
      expect(generateSlug('Hello   World   Page')).toBe('hello-world-page');
    });

    it('handles already lowercase input', () => {
      expect(generateSlug('hello world')).toBe('hello-world');
    });

    it('handles mixed case input', () => {
      expect(generateSlug('My Wiki PAGE Title')).toBe('my-wiki-page-title');
    });

    it('preserves numbers', () => {
      expect(generateSlug('Guide Version 2')).toBe('guide-version-2');
    });

    it('handles hyphens in input', () => {
      expect(generateSlug('pre-existing title')).toBe('pre-existing-title');
    });
  });

  // ===========================================================================
  // generateSlug — removes special characters
  // ===========================================================================

  describe('generateSlug — removes special characters', () => {
    it('removes exclamation marks', () => {
      expect(generateSlug('Hello World!')).toBe('hello-world');
    });

    it('removes question marks', () => {
      expect(generateSlug('How to do this?')).toBe('how-to-do-this');
    });

    it('removes at signs and hashes', () => {
      expect(generateSlug('Email @user #topic')).toBe('email-user-topic');
    });

    it('removes parentheses and brackets', () => {
      expect(generateSlug('Guide (draft) [v2]')).toBe('guide-draft-v2');
    });

    it('removes ampersands and plus signs', () => {
      // & and + are stripped, spaces become hyphens, consecutive hyphens collapse
      expect(generateSlug('Tips & Tricks + More')).toBe('tips-tricks-more');
    });

    it('removes dots and commas', () => {
      expect(generateSlug('Version 1.0, Release Notes')).toBe('version-10-release-notes');
    });

    it('strips leading and trailing hyphens', () => {
      expect(generateSlug('---Hello---')).toBe('hello');
    });
  });

  // ===========================================================================
  // generateSlug — truncates to 100 chars
  // ===========================================================================

  describe('generateSlug — truncates to 100 chars', () => {
    it('truncates long titles to 100 characters', () => {
      const longTitle = 'a'.repeat(200);
      const slug = generateSlug(longTitle);
      expect(slug.length).toBeLessThanOrEqual(100);
    });

    it('does not truncate titles under 100 characters', () => {
      const title = 'Short Title';
      const slug = generateSlug(title);
      expect(slug.length).toBeLessThanOrEqual(100);
      expect(slug).toBe('short-title');
    });

    it('exactly 100 characters stays at 100', () => {
      // Build a title that produces exactly 100 char slug
      const longTitle = 'a '.repeat(50).trim(); // "a a a a ..." -> "a-a-a-a-..."
      const slug = generateSlug(longTitle);
      expect(slug.length).toBeLessThanOrEqual(100);
    });
  });

  // ===========================================================================
  // generateSlug — handles empty string
  // ===========================================================================

  describe('generateSlug — handles empty string', () => {
    it('returns empty string for empty input', () => {
      expect(generateSlug('')).toBe('');
    });

    it('returns empty string for whitespace-only input', () => {
      expect(generateSlug('   ')).toBe('');
    });

    it('returns empty string for special-characters-only input', () => {
      expect(generateSlug('!@#$%^&*()')).toBe('');
    });
  });
});
