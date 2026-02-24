import { describe, it, expect } from 'vitest';
import {
  classifyLink,
  normalizeUrl,
  extractLinksFromHtml,
} from '@/lib/ai/link-checker';

// ============================================================================
// classifyLink
// ============================================================================

describe('classifyLink', () => {
  const pageUrl = 'https://example.com/page';

  it('classifies anchor links', () => {
    expect(classifyLink('#section', pageUrl)).toBe('anchor');
    expect(classifyLink('#', pageUrl)).toBe('anchor');
  });

  it('classifies empty href as anchor', () => {
    expect(classifyLink('', pageUrl)).toBe('anchor');
  });

  it('classifies mailto links', () => {
    expect(classifyLink('mailto:test@example.com', pageUrl)).toBe('mailto');
  });

  it('classifies tel links', () => {
    expect(classifyLink('tel:+1234567890', pageUrl)).toBe('tel');
  });

  it('classifies internal links (same host)', () => {
    expect(classifyLink('https://example.com/about', pageUrl)).toBe('internal');
    expect(classifyLink('/about', pageUrl)).toBe('internal');
    expect(classifyLink('about.html', pageUrl)).toBe('internal');
  });

  it('classifies external links (different host)', () => {
    expect(classifyLink('https://google.com', pageUrl)).toBe('external');
    expect(classifyLink('https://cdn.example.org/img.png', pageUrl)).toBe('external');
  });

  it('handles invalid URLs as external', () => {
    // Relative URL with no base results in URL parse on the page
    expect(classifyLink('https://other-site.com/path', pageUrl)).toBe('external');
  });
});

// ============================================================================
// normalizeUrl
// ============================================================================

describe('normalizeUrl', () => {
  const base = 'https://example.com/page';

  it('returns null for empty href', () => {
    expect(normalizeUrl('', base)).toBeNull();
  });

  it('returns null for anchors', () => {
    expect(normalizeUrl('#top', base)).toBeNull();
  });

  it('returns null for mailto', () => {
    expect(normalizeUrl('mailto:a@b.com', base)).toBeNull();
  });

  it('returns null for tel', () => {
    expect(normalizeUrl('tel:123', base)).toBeNull();
  });

  it('returns null for javascript:', () => {
    expect(normalizeUrl('javascript:void(0)', base)).toBeNull();
  });

  it('resolves relative URLs', () => {
    expect(normalizeUrl('/about', base)).toBe('https://example.com/about');
  });

  it('resolves absolute URLs', () => {
    expect(normalizeUrl('https://other.com/path', base)).toBe('https://other.com/path');
  });

  it('resolves relative paths', () => {
    expect(normalizeUrl('contact.html', base)).toBe('https://example.com/contact.html');
  });
});

// ============================================================================
// extractLinksFromHtml
// ============================================================================

describe('extractLinksFromHtml', () => {
  it('extracts href from anchor tags', () => {
    const html = '<a href="https://example.com">Link</a>';
    expect(extractLinksFromHtml(html)).toEqual(['https://example.com']);
  });

  it('handles single and double quotes', () => {
    const html = `<a href='https://a.com'>A</a><a href="https://b.com">B</a>`;
    expect(extractLinksFromHtml(html)).toEqual(['https://a.com', 'https://b.com']);
  });

  it('extracts multiple links', () => {
    const html = `
      <a href="/page1">One</a>
      <a href="/page2">Two</a>
      <a href="/page3">Three</a>
    `;
    expect(extractLinksFromHtml(html)).toHaveLength(3);
  });

  it('deduplicates links', () => {
    const html = '<a href="/dup">A</a><a href="/dup">B</a>';
    expect(extractLinksFromHtml(html)).toEqual(['/dup']);
  });

  it('returns empty array for no links', () => {
    expect(extractLinksFromHtml('<p>No links here</p>')).toEqual([]);
  });

  it('handles links with extra attributes', () => {
    const html = '<a class="btn" href="https://example.com" target="_blank">Click</a>';
    expect(extractLinksFromHtml(html)).toEqual(['https://example.com']);
  });
});
