import { describe, it, expect } from 'vitest';
import {
  isVideoAttachment,
  isImageAttachment,
  extractChangeRequests,
  parseReviewResponse,
  buildVideoReviewPrompt,
  type FrameVerdict,
} from '@/lib/ai/design-review';

// ============================================================================
// isVideoAttachment
// ============================================================================

describe('isVideoAttachment', () => {
  it('returns true for video/mp4', () => {
    expect(isVideoAttachment('video/mp4')).toBe(true);
  });

  it('returns true for video/quicktime', () => {
    expect(isVideoAttachment('video/quicktime')).toBe(true);
  });

  it('returns true for video/webm', () => {
    expect(isVideoAttachment('video/webm')).toBe(true);
  });

  it('returns true for generic video/ prefix', () => {
    expect(isVideoAttachment('video/x-msvideo')).toBe(true);
  });

  it('returns false for image types', () => {
    expect(isVideoAttachment('image/png')).toBe(false);
    expect(isVideoAttachment('image/jpeg')).toBe(false);
  });

  it('returns false for other mime types', () => {
    expect(isVideoAttachment('application/pdf')).toBe(false);
    expect(isVideoAttachment('text/plain')).toBe(false);
  });
});

// ============================================================================
// isImageAttachment (existing function)
// ============================================================================

describe('isImageAttachment', () => {
  it('returns true for image types', () => {
    expect(isImageAttachment('image/png')).toBe(true);
    expect(isImageAttachment('image/jpeg')).toBe(true);
    expect(isImageAttachment('image/webp')).toBe(true);
  });

  it('returns false for non-image types', () => {
    expect(isImageAttachment('video/mp4')).toBe(false);
    expect(isImageAttachment('application/pdf')).toBe(false);
  });
});

// ============================================================================
// buildVideoReviewPrompt
// ============================================================================

describe('buildVideoReviewPrompt', () => {
  it('includes frame count', () => {
    const prompt = buildVideoReviewPrompt([], '', 5);
    expect(prompt).toContain('5 frames');
  });

  it('includes change requests when provided', () => {
    const prompt = buildVideoReviewPrompt(['Fix logo placement', 'Adjust color'], '', 3);
    expect(prompt).toContain('1. Fix logo placement');
    expect(prompt).toContain('2. Adjust color');
  });

  it('mentions no specific change requests when empty', () => {
    const prompt = buildVideoReviewPrompt([], '', 3);
    expect(prompt).toContain('No specific change requests');
  });

  it('includes brief summary', () => {
    const prompt = buildVideoReviewPrompt([], 'Brand awareness campaign', 3);
    expect(prompt).toContain('Brand awareness campaign');
  });

  it('asks for brand consistency evaluation', () => {
    const prompt = buildVideoReviewPrompt([], '', 3);
    expect(prompt).toContain('Brand consistency');
  });

  it('asks for thumbnail candidate', () => {
    const prompt = buildVideoReviewPrompt([], '', 3);
    expect(prompt).toContain('thumbnail');
  });

  it('requests JSON response format', () => {
    const prompt = buildVideoReviewPrompt([], '', 3);
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('frame_verdicts');
    expect(prompt).toContain('thumbnail_suggestion');
  });
});

// ============================================================================
// parseReviewResponse (shared with image review)
// ============================================================================

describe('parseReviewResponse - video JSON', () => {
  it('parses valid JSON with verdicts', () => {
    const json = JSON.stringify({
      verdicts: [
        { index: 1, verdict: 'PASS', reasoning: 'Logo is correct', suggestions: '' },
        { index: 2, verdict: 'FAIL', reasoning: 'Color is off', suggestions: 'Use #333' },
      ],
      overall_verdict: 'revisions_needed',
      summary: 'Some changes needed',
    });

    const result = parseReviewResponse(json, 2);
    expect(result.verdicts).toHaveLength(2);
    expect(result.verdicts[0].verdict).toBe('PASS');
    expect(result.verdicts[1].verdict).toBe('FAIL');
    expect(result.overallVerdict).toBe('revisions_needed');
    expect(result.confidenceScore).toBe(100);
  });

  it('parses JSON in markdown code block', () => {
    const text = '```json\n{"verdicts":[],"overall_verdict":"approved","summary":"Good"}\n```';
    const result = parseReviewResponse(text, 0);
    expect(result.overallVerdict).toBe('approved');
    expect(result.summary).toBe('Good');
  });

  it('handles malformed JSON gracefully', () => {
    const result = parseReviewResponse('not json at all', 2);
    expect(result.verdicts).toEqual([]);
    expect(result.overallVerdict).toBe('pending');
    expect(result.confidenceScore).toBe(0);
  });

  it('normalizes verdict strings', () => {
    const json = JSON.stringify({
      verdicts: [{ index: 1, verdict: 'YES', reasoning: 'ok' }],
      overall_verdict: 'PASS',
      summary: 'All good',
    });
    const result = parseReviewResponse(json, 1);
    expect(result.verdicts[0].verdict).toBe('PASS');
    expect(result.overallVerdict).toBe('approved');
  });

  it('calculates confidence based on expected count', () => {
    const json = JSON.stringify({
      verdicts: [{ index: 1, verdict: 'PASS', reasoning: '' }],
      overall_verdict: 'approved',
      summary: '',
    });
    const result = parseReviewResponse(json, 4);
    expect(result.confidenceScore).toBe(25); // 1 out of 4
  });
});

// ============================================================================
// extractChangeRequests
// ============================================================================

describe('extractChangeRequests', () => {
  it('extracts numbered lists', () => {
    const comments = [
      { content: '1. Fix the logo\n2. Change the background color', created_at: '2026-01-01' },
    ];
    const requests = extractChangeRequests(comments);
    expect(requests).toHaveLength(2);
    expect(requests[0].text).toBe('Fix the logo');
    expect(requests[1].text).toBe('Change the background color');
  });

  it('extracts bullet lists', () => {
    const comments = [
      { content: '- Update header\n- Fix spacing', created_at: '2026-01-01' },
    ];
    const requests = extractChangeRequests(comments);
    expect(requests).toHaveLength(2);
  });

  it('extracts feedback keywords from plain text', () => {
    const comments = [
      { content: 'Please change the font to match the brand', created_at: '2026-01-01' },
    ];
    const requests = extractChangeRequests(comments);
    expect(requests).toHaveLength(1);
  });

  it('ignores non-feedback text', () => {
    const comments = [
      { content: 'Looks great!', created_at: '2026-01-01' },
    ];
    const requests = extractChangeRequests(comments);
    expect(requests).toHaveLength(0);
  });

  it('filters out very short items', () => {
    const comments = [
      { content: '1. OK\n2. Fix the sidebar layout alignment', created_at: '2026-01-01' },
    ];
    const requests = extractChangeRequests(comments);
    expect(requests).toHaveLength(1);
    expect(requests[0].text).toContain('sidebar');
  });
});
