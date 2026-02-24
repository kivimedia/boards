import { describe, it, expect } from 'vitest';
import {
  extractChangeRequests,
  parseReviewResponse,
  isImageAttachment,
} from '@/lib/ai/design-review';

describe('AI Design Review (P2.1)', () => {
  // ===========================================================================
  // extractChangeRequests
  // ===========================================================================

  describe('extractChangeRequests', () => {
    it('extracts from numbered list with dots "1. Change header color"', () => {
      const comments = [
        { content: '1. Change header color to blue\n2. Make the logo bigger', created_at: '2026-01-10T10:00:00Z' },
      ];
      const result = extractChangeRequests(comments);
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Change header color to blue');
      expect(result[1].text).toBe('Make the logo bigger');
    });

    it('extracts from numbered list with parentheses "1) Change header"', () => {
      const comments = [
        { content: '1) Change header alignment\n2) Update footer text', created_at: '2026-01-10T10:00:00Z' },
      ];
      const result = extractChangeRequests(comments);
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Change header alignment');
      expect(result[1].text).toBe('Update footer text');
    });

    it('extracts from bullet list with dashes "- Change header"', () => {
      const comments = [
        { content: '- Change header font size\n- Reduce padding on sidebar', created_at: '2026-01-10T10:00:00Z' },
      ];
      const result = extractChangeRequests(comments);
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Change header font size');
      expect(result[1].text).toBe('Reduce padding on sidebar');
    });

    it('extracts from bullet list with asterisks "* Change header"', () => {
      const comments = [
        { content: '* Change header background\n* Update navigation links', created_at: '2026-01-10T10:00:00Z' },
      ];
      const result = extractChangeRequests(comments);
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Change header background');
      expect(result[1].text).toBe('Update navigation links');
    });

    it('extracts from bullet list with dots "\u2022 Change header"', () => {
      const comments = [
        { content: '\u2022 Change header spacing\n\u2022 Adjust margin on cards', created_at: '2026-01-10T10:00:00Z' },
      ];
      const result = extractChangeRequests(comments);
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Change header spacing');
      expect(result[1].text).toBe('Adjust margin on cards');
    });

    it('handles multiple items in one comment', () => {
      const comments = [
        {
          content: '1. Fix the hero banner size\n2. Change CTA button color\n3. Update the tagline text\n4. Adjust font weight on headings',
          created_at: '2026-01-10T10:00:00Z',
        },
      ];
      const result = extractChangeRequests(comments);
      expect(result).toHaveLength(4);
      expect(result[0].index).toBe(1);
      expect(result[3].index).toBe(4);
      expect(result[2].text).toBe('Update the tagline text');
    });

    it('handles multiple comments', () => {
      const comments = [
        { content: '1. Fix the hero banner', created_at: '2026-01-10T10:00:00Z' },
        { content: '- Update the sidebar layout', created_at: '2026-01-11T10:00:00Z' },
      ];
      const result = extractChangeRequests(comments);
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Fix the hero banner');
      expect(result[1].text).toBe('Update the sidebar layout');
    });

    it('filters out short items (less than 6 characters)', () => {
      const comments = [
        { content: '1. OK\n2. Fix the header alignment', created_at: '2026-01-10T10:00:00Z' },
      ];
      const result = extractChangeRequests(comments);
      // "OK" is only 2 chars, should be filtered out (threshold is text.length > 5)
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Fix the header alignment');
    });

    it('detects feedback keywords in plain text comments', () => {
      const comments = [
        { content: 'Please change the background color to a lighter shade', created_at: '2026-01-10T10:00:00Z' },
      ];
      const result = extractChangeRequests(comments);
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Please change the background color to a lighter shade');
    });

    it('ignores long comments (>500 chars)', () => {
      const longContent = 'Please change the following: ' + 'a'.repeat(500);
      const comments = [
        { content: longContent, created_at: '2026-01-10T10:00:00Z' },
      ];
      const result = extractChangeRequests(comments);
      // The content is >500 chars, so even though it contains "change", it should be ignored
      // (only if it doesn't match numbered/bullet patterns)
      expect(result).toHaveLength(0);
    });

    it('returns empty array for no comments', () => {
      const result = extractChangeRequests([]);
      expect(result).toEqual([]);
    });

    it('returns empty array for comments without feedback keywords', () => {
      const comments = [
        { content: 'Looks great, nice work on this design!', created_at: '2026-01-10T10:00:00Z' },
      ];
      const result = extractChangeRequests(comments);
      expect(result).toHaveLength(0);
    });

    it('maintains sequential indexing across multiple comments', () => {
      const comments = [
        { content: '1. Fix the header\n2. Update the footer', created_at: '2026-01-10T10:00:00Z' },
        { content: '- Change the sidebar color\n- Resize the logo', created_at: '2026-01-11T10:00:00Z' },
      ];
      const result = extractChangeRequests(comments);
      expect(result).toHaveLength(4);
      expect(result[0].index).toBe(1);
      expect(result[1].index).toBe(2);
      expect(result[2].index).toBe(3);
      expect(result[3].index).toBe(4);
    });

    it('handles mixed formats (some numbered, some bulleted)', () => {
      const comments = [
        { content: '1. Fix the hero banner\n2. Change CTA button', created_at: '2026-01-10T10:00:00Z' },
        { content: '- Adjust sidebar width\n- Update footer links', created_at: '2026-01-11T10:00:00Z' },
        { content: 'Please modify the navigation bar styling', created_at: '2026-01-12T10:00:00Z' },
      ];
      const result = extractChangeRequests(comments);
      expect(result).toHaveLength(5);
      // Numbered from first comment
      expect(result[0].text).toBe('Fix the hero banner');
      expect(result[1].text).toBe('Change CTA button');
      // Bullets from second comment
      expect(result[2].text).toBe('Adjust sidebar width');
      expect(result[3].text).toBe('Update footer links');
      // Plain text with keyword from third comment
      expect(result[4].text).toBe('Please modify the navigation bar styling');
    });
  });

  // ===========================================================================
  // parseReviewResponse
  // ===========================================================================

  describe('parseReviewResponse', () => {
    it('parses valid JSON with verdicts array', () => {
      const json = JSON.stringify({
        verdicts: [
          { index: 1, verdict: 'PASS', reasoning: 'Header color updated correctly', suggestions: '' },
          { index: 2, verdict: 'FAIL', reasoning: 'Logo size unchanged', suggestions: 'Increase logo by 20%' },
        ],
        overall_verdict: 'revisions_needed',
        summary: 'One of two changes was implemented correctly.',
      });

      const result = parseReviewResponse(json, 2);
      expect(result.verdicts).toHaveLength(2);
      expect(result.verdicts[0].verdict).toBe('PASS');
      expect(result.verdicts[1].verdict).toBe('FAIL');
      expect(result.overallVerdict).toBe('revisions_needed');
      expect(result.summary).toBe('One of two changes was implemented correctly.');
    });

    it('parses JSON in markdown code blocks (```json...```)', () => {
      const responseText = '```json\n' + JSON.stringify({
        verdicts: [
          { index: 1, verdict: 'PASS', reasoning: 'Looks good', suggestions: '' },
        ],
        overall_verdict: 'approved',
        summary: 'All changes implemented.',
      }) + '\n```';

      const result = parseReviewResponse(responseText, 1);
      expect(result.verdicts).toHaveLength(1);
      expect(result.verdicts[0].verdict).toBe('PASS');
      expect(result.overallVerdict).toBe('approved');
    });

    it('handles PASS/FAIL/PARTIAL verdicts', () => {
      const json = JSON.stringify({
        verdicts: [
          { index: 1, verdict: 'PASS', reasoning: 'Done', suggestions: '' },
          { index: 2, verdict: 'FAIL', reasoning: 'Not done', suggestions: 'Fix it' },
          { index: 3, verdict: 'PARTIAL', reasoning: 'Partially done', suggestions: 'Tweak it' },
        ],
        overall_verdict: 'revisions_needed',
        summary: 'Mixed results.',
      });

      const result = parseReviewResponse(json, 3);
      expect(result.verdicts[0].verdict).toBe('PASS');
      expect(result.verdicts[1].verdict).toBe('FAIL');
      expect(result.verdicts[2].verdict).toBe('PARTIAL');
    });

    it('normalizes "APPROVED" to "PASS"', () => {
      const json = JSON.stringify({
        verdicts: [
          { index: 1, verdict: 'APPROVED', reasoning: 'Good', suggestions: '' },
        ],
        overall_verdict: 'approved',
        summary: 'Approved.',
      });

      const result = parseReviewResponse(json, 1);
      expect(result.verdicts[0].verdict).toBe('PASS');
    });

    it('normalizes "REJECTED" to "FAIL"', () => {
      const json = JSON.stringify({
        verdicts: [
          { index: 1, verdict: 'REJECTED', reasoning: 'Bad', suggestions: 'Redo' },
        ],
        overall_verdict: 'revisions_needed',
        summary: 'Rejected.',
      });

      const result = parseReviewResponse(json, 1);
      expect(result.verdicts[0].verdict).toBe('FAIL');
    });

    it('handles missing fields with defaults', () => {
      const json = JSON.stringify({
        verdicts: [
          { index: 1 },
        ],
        overall_verdict: 'approved',
      });

      const result = parseReviewResponse(json, 1);
      expect(result.verdicts).toHaveLength(1);
      // Missing verdict should default to 'PARTIAL' (normalizeVerdict with undefined)
      expect(result.verdicts[0].verdict).toBe('PARTIAL');
      // Missing reasoning/suggestions should default to ''
      expect(result.verdicts[0].reasoning).toBe('');
      expect(result.verdicts[0].suggestions).toBe('');
      // Missing summary should default to ''
      expect(result.summary).toBe('');
    });

    it('returns pending for unparseable response', () => {
      const result = parseReviewResponse('This is not JSON at all', 2);
      expect(result.overallVerdict).toBe('pending');
      expect(result.verdicts).toHaveLength(0);
    });

    it('returns confidence 0 for parse failure', () => {
      const result = parseReviewResponse('Not valid JSON!!!', 3);
      expect(result.confidenceScore).toBe(0);
    });

    it('calculates confidence based on verdict count vs expected', () => {
      const json = JSON.stringify({
        verdicts: [
          { index: 1, verdict: 'PASS', reasoning: 'OK', suggestions: '' },
        ],
        overall_verdict: 'approved',
        summary: 'Partial review.',
      });

      // 1 verdict out of 4 expected = 25%
      const result = parseReviewResponse(json, 4);
      expect(result.confidenceScore).toBe(25);
    });

    it('returns 100% confidence when all verdicts present', () => {
      const json = JSON.stringify({
        verdicts: [
          { index: 1, verdict: 'PASS', reasoning: 'Good', suggestions: '' },
          { index: 2, verdict: 'PASS', reasoning: 'Great', suggestions: '' },
          { index: 3, verdict: 'PASS', reasoning: 'Perfect', suggestions: '' },
        ],
        overall_verdict: 'approved',
        summary: 'All good.',
      });

      const result = parseReviewResponse(json, 3);
      expect(result.confidenceScore).toBe(100);
    });

    it('normalizes overall_verdict "APPROVED" -> "approved"', () => {
      const json = JSON.stringify({
        verdicts: [],
        overall_verdict: 'APPROVED',
        summary: 'All good.',
      });

      const result = parseReviewResponse(json, 0);
      expect(result.overallVerdict).toBe('approved');
    });

    it('normalizes overall_verdict "REVISIONS_NEEDED" -> "revisions_needed"', () => {
      const json = JSON.stringify({
        verdicts: [],
        overall_verdict: 'REVISIONS_NEEDED',
        summary: 'Needs work.',
      });

      const result = parseReviewResponse(json, 0);
      expect(result.overallVerdict).toBe('revisions_needed');
    });

    it('includes summary from parsed JSON', () => {
      const json = JSON.stringify({
        verdicts: [],
        overall_verdict: 'approved',
        summary: 'The design meets all requirements and looks polished.',
      });

      const result = parseReviewResponse(json, 0);
      expect(result.summary).toBe('The design meets all requirements and looks polished.');
    });

    it('handles empty verdicts array', () => {
      const json = JSON.stringify({
        verdicts: [],
        overall_verdict: 'pending',
        summary: 'No change requests to evaluate.',
      });

      const result = parseReviewResponse(json, 0);
      expect(result.verdicts).toHaveLength(0);
      expect(result.overallVerdict).toBe('pending');
      // 0 verdicts / max(0, 1) = 0 -> 0%
      expect(result.confidenceScore).toBe(0);
    });

    it('caps confidence at 100 when more verdicts than expected', () => {
      const json = JSON.stringify({
        verdicts: [
          { index: 1, verdict: 'PASS', reasoning: 'OK', suggestions: '' },
          { index: 2, verdict: 'PASS', reasoning: 'OK', suggestions: '' },
          { index: 3, verdict: 'PASS', reasoning: 'OK', suggestions: '' },
        ],
        overall_verdict: 'approved',
        summary: 'Extra verdicts.',
      });

      // 3 verdicts but only 2 expected -> Math.min(100, round(3/2 * 100)) = 100 (capped)
      const result = parseReviewResponse(json, 2);
      expect(result.confidenceScore).toBeLessThanOrEqual(100);
    });
  });

  // ===========================================================================
  // isImageAttachment
  // ===========================================================================

  describe('isImageAttachment', () => {
    it('returns true for image/png', () => {
      expect(isImageAttachment('image/png')).toBe(true);
    });

    it('returns true for image/jpeg', () => {
      expect(isImageAttachment('image/jpeg')).toBe(true);
    });

    it('returns false for application/pdf', () => {
      expect(isImageAttachment('application/pdf')).toBe(false);
    });

    it('returns false for text/plain', () => {
      expect(isImageAttachment('text/plain')).toBe(false);
    });

    it('returns true for image/gif', () => {
      expect(isImageAttachment('image/gif')).toBe(true);
    });

    it('returns true for image/webp', () => {
      expect(isImageAttachment('image/webp')).toBe(true);
    });

    it('returns true for image/svg+xml', () => {
      expect(isImageAttachment('image/svg+xml')).toBe(true);
    });
  });
});
