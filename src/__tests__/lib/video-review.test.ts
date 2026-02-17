import { describe, it, expect } from 'vitest';
import { runVideoReview } from '@/lib/ai/video-review';
import type { VideoReviewInput, VideoReviewOutput } from '@/lib/ai/video-review';
import type { AIChangeVerdictResult, AIReviewVerdict, AIChangeRequest } from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers — replicate parsing logic from video-review.ts lines 161-186
// so we can unit-test it without needing Supabase or Anthropic clients.
// ---------------------------------------------------------------------------

/**
 * Extract JSON from a response string, handling ```json code blocks.
 * Mirrors lines 162-168 of video-review.ts.
 */
function extractJson(responseText: string): any {
  try {
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    return JSON.parse(jsonStr);
  } catch {
    return { verdicts: [], overall_verdict: 'pending', summary: 'Could not parse AI response.' };
  }
}

/**
 * Normalize a single verdict value to PASS | FAIL | PARTIAL.
 * Mirrors line 174 of video-review.ts.
 */
function normalizeVerdict(raw: string | undefined | null): 'PASS' | 'FAIL' | 'PARTIAL' {
  const upper = raw?.toUpperCase();
  if (upper === 'PASS' || upper === 'FAIL' || upper === 'PARTIAL') return upper;
  return 'PARTIAL';
}

/**
 * Derive overall verdict from parsed value.
 * Mirrors lines 180-181 of video-review.ts.
 */
function deriveOverallVerdict(parsedOverall: string): AIReviewVerdict {
  return parsedOverall === 'approved' ? 'approved' : 'revisions_needed';
}

/**
 * Calculate confidence score.
 * Mirrors lines 183-186 of video-review.ts.
 */
function calculateConfidence(verdictsLength: number, changeRequestsLength: number): number {
  return Math.min(100, Math.round((verdictsLength / Math.max(changeRequestsLength, 1)) * 100));
}

describe('video-review', () => {
  // =========================================================================
  // Exports verification
  // =========================================================================

  describe('exports', () => {
    it('exports runVideoReview as a function', () => {
      expect(typeof runVideoReview).toBe('function');
    });
  });

  // =========================================================================
  // VideoReviewInput interface shape
  // =========================================================================

  describe('VideoReviewInput interface shape', () => {
    it('has all required fields', () => {
      const input: VideoReviewInput = {
        cardId: 'card-1',
        boardId: 'board-1',
        userId: 'user-1',
        currentVideoPath: '/video/current.mp4',
        changeRequests: [{ index: 1, text: 'Fix intro animation' }],
      };

      expect(input).toHaveProperty('cardId');
      expect(input).toHaveProperty('boardId');
      expect(input).toHaveProperty('userId');
      expect(input).toHaveProperty('currentVideoPath');
      expect(input).toHaveProperty('changeRequests');
    });

    it('allows optional previousVideoPath and frameTimestamps', () => {
      const input: VideoReviewInput = {
        cardId: 'card-1',
        boardId: 'board-1',
        userId: 'user-1',
        currentVideoPath: '/video/current.mp4',
        previousVideoPath: '/video/previous.mp4',
        changeRequests: [],
        frameTimestamps: [0, 5, 10],
      };

      expect(input.previousVideoPath).toBe('/video/previous.mp4');
      expect(input.frameTimestamps).toEqual([0, 5, 10]);
    });
  });

  // =========================================================================
  // Verdict normalization
  // =========================================================================

  describe('verdict normalization', () => {
    it('normalizes "pass" (lowercase) to "PASS"', () => {
      expect(normalizeVerdict('pass')).toBe('PASS');
    });

    it('normalizes "FAIL" (uppercase) to "FAIL"', () => {
      expect(normalizeVerdict('FAIL')).toBe('FAIL');
    });

    it('normalizes "Partial" (mixed case) to "PARTIAL"', () => {
      expect(normalizeVerdict('Partial')).toBe('PARTIAL');
    });

    it('defaults to "PARTIAL" for unrecognized values', () => {
      expect(normalizeVerdict('unknown')).toBe('PARTIAL');
    });

    it('defaults to "PARTIAL" for undefined', () => {
      expect(normalizeVerdict(undefined)).toBe('PARTIAL');
    });

    it('defaults to "PARTIAL" for null', () => {
      expect(normalizeVerdict(null)).toBe('PARTIAL');
    });
  });

  // =========================================================================
  // Overall verdict mapping
  // =========================================================================

  describe('overall verdict mapping', () => {
    it('maps "approved" to "approved"', () => {
      expect(deriveOverallVerdict('approved')).toBe('approved');
    });

    it('maps "revisions_needed" to "revisions_needed"', () => {
      expect(deriveOverallVerdict('revisions_needed')).toBe('revisions_needed');
    });

    it('maps "pending" to "revisions_needed" (anything non-approved)', () => {
      expect(deriveOverallVerdict('pending')).toBe('revisions_needed');
    });

    it('maps empty string to "revisions_needed"', () => {
      expect(deriveOverallVerdict('')).toBe('revisions_needed');
    });

    it('maps arbitrary string to "revisions_needed"', () => {
      expect(deriveOverallVerdict('something_else')).toBe('revisions_needed');
    });
  });

  // =========================================================================
  // Confidence calculation
  // =========================================================================

  describe('confidence calculation', () => {
    it('returns 100 when verdicts match changeRequests count', () => {
      expect(calculateConfidence(3, 3)).toBe(100);
    });

    it('returns 50 when half of change requests have verdicts', () => {
      expect(calculateConfidence(2, 4)).toBe(50);
    });

    it('caps at 100 even if verdicts exceed changeRequests', () => {
      expect(calculateConfidence(5, 3)).toBe(100);
    });

    it('returns 100 when changeRequests is 0 (division by Math.max(0,1)=1)', () => {
      // verdictsLength / Math.max(0, 1) = verdictsLength / 1
      expect(calculateConfidence(1, 0)).toBe(100);
    });

    it('returns 0 when there are no verdicts and some change requests', () => {
      expect(calculateConfidence(0, 5)).toBe(0);
    });

    it('rounds to nearest integer', () => {
      // 1/3 = 0.333... => Math.round(33.33) = 33
      expect(calculateConfidence(1, 3)).toBe(33);
    });
  });

  // =========================================================================
  // JSON extraction from code blocks
  // =========================================================================

  describe('JSON extraction', () => {
    it('parses raw JSON without code block', () => {
      const raw = '{"verdicts": [{"index": 1, "verdict": "PASS"}], "overall_verdict": "approved", "summary": "All good"}';
      const parsed = extractJson(raw);
      expect(parsed.verdicts).toHaveLength(1);
      expect(parsed.overall_verdict).toBe('approved');
    });

    it('extracts JSON from ```json code block', () => {
      const raw = 'Here is my analysis:\n```json\n{"verdicts": [], "overall_verdict": "revisions_needed", "summary": "Needs work"}\n```';
      const parsed = extractJson(raw);
      expect(parsed.overall_verdict).toBe('revisions_needed');
      expect(parsed.summary).toBe('Needs work');
    });

    it('extracts JSON from ``` code block without json label', () => {
      const raw = '```\n{"verdicts": [{"index": 1, "verdict": "FAIL"}], "overall_verdict": "revisions_needed", "summary": "Failed"}\n```';
      const parsed = extractJson(raw);
      expect(parsed.verdicts[0].verdict).toBe('FAIL');
    });

    it('returns fallback on invalid JSON', () => {
      const raw = 'This is not JSON at all.';
      const parsed = extractJson(raw);
      expect(parsed.verdicts).toEqual([]);
      expect(parsed.overall_verdict).toBe('pending');
      expect(parsed.summary).toBe('Could not parse AI response.');
    });

    it('returns fallback on partial/broken JSON', () => {
      const raw = '{"verdicts": [{"index": 1, ';
      const parsed = extractJson(raw);
      expect(parsed.verdicts).toEqual([]);
      expect(parsed.summary).toBe('Could not parse AI response.');
    });
  });
});
