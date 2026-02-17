import { describe, it, expect } from 'vitest';
import type {
  AIReviewResult,
  AIChangeRequest,
  AIChangeVerdictResult,
  AIReviewVerdict,
  AIChangeVerdict,
} from '@/lib/types';

/**
 * Type-shape tests for AI Design Review types (P2.1).
 *
 * These tests verify that the type definitions compile correctly and that
 * sample objects conforming to each interface contain all expected fields.
 * The assertions run at both compile time (TypeScript) and runtime (Vitest).
 */

describe('AI Design Review Types (P2.1)', () => {
  // ===========================================================================
  // AIReviewResult
  // ===========================================================================

  describe('AIReviewResult interface', () => {
    it('has all expected fields', () => {
      const sample: AIReviewResult = {
        id: 'review-1',
        card_id: 'card-abc',
        attachment_id: 'attach-1',
        previous_attachment_id: 'attach-0',
        change_requests: [{ index: 1, text: 'Fix the logo' }],
        verdicts: [
          { index: 1, verdict: 'PASS', reasoning: 'Logo fixed correctly', suggestions: '' },
        ],
        overall_verdict: 'approved',
        summary: 'All changes implemented successfully.',
        confidence_score: 100,
        model_used: 'claude-sonnet-4-5-20250929',
        usage_log_id: 'log-1',
        override_verdict: null,
        override_reason: null,
        overridden_by: null,
        overridden_at: null,
        created_by: 'user-1',
        created_at: '2026-01-15T12:00:00Z',
        updated_at: '2026-01-15T12:00:00Z',
      };

      expect(sample.id).toBe('review-1');
      expect(sample.card_id).toBe('card-abc');
      expect(sample.attachment_id).toBe('attach-1');
      expect(sample.previous_attachment_id).toBe('attach-0');
      expect(sample.change_requests).toHaveLength(1);
      expect(sample.verdicts).toHaveLength(1);
      expect(sample.overall_verdict).toBe('approved');
      expect(sample.summary).toBe('All changes implemented successfully.');
      expect(sample.confidence_score).toBe(100);
      expect(sample.model_used).toBe('claude-sonnet-4-5-20250929');
      expect(sample.usage_log_id).toBe('log-1');
      expect(sample.override_verdict).toBeNull();
      expect(sample.override_reason).toBeNull();
      expect(sample.overridden_by).toBeNull();
      expect(sample.overridden_at).toBeNull();
      expect(sample.created_by).toBe('user-1');
      expect(sample.created_at).toBeDefined();
      expect(sample.updated_at).toBeDefined();
    });

    it('allows null for nullable fields', () => {
      const sample: AIReviewResult = {
        id: 'review-2',
        card_id: 'card-xyz',
        attachment_id: null,
        previous_attachment_id: null,
        change_requests: [],
        verdicts: [],
        overall_verdict: 'pending',
        summary: null,
        confidence_score: null,
        model_used: null,
        usage_log_id: null,
        override_verdict: null,
        override_reason: null,
        overridden_by: null,
        overridden_at: null,
        created_by: null,
        created_at: '2026-01-15T12:00:00Z',
        updated_at: '2026-01-15T12:00:00Z',
      };

      expect(sample.attachment_id).toBeNull();
      expect(sample.previous_attachment_id).toBeNull();
      expect(sample.summary).toBeNull();
      expect(sample.confidence_score).toBeNull();
      expect(sample.model_used).toBeNull();
      expect(sample.usage_log_id).toBeNull();
      expect(sample.created_by).toBeNull();
    });

    it('accepts override fields when verdict is overridden', () => {
      const sample: AIReviewResult = {
        id: 'review-3',
        card_id: 'card-123',
        attachment_id: 'attach-5',
        previous_attachment_id: null,
        change_requests: [{ index: 1, text: 'Update colors' }],
        verdicts: [{ index: 1, verdict: 'FAIL', reasoning: 'Not updated', suggestions: 'Use brand colors' }],
        overall_verdict: 'overridden_approved',
        summary: 'AI rejected but manager approved.',
        confidence_score: 80,
        model_used: 'claude-sonnet-4-5-20250929',
        usage_log_id: 'log-5',
        override_verdict: 'overridden_approved',
        override_reason: 'Client approved the current design direction',
        overridden_by: 'admin-user-1',
        overridden_at: '2026-01-16T14:30:00Z',
        created_by: 'user-2',
        created_at: '2026-01-15T12:00:00Z',
        updated_at: '2026-01-16T14:30:00Z',
      };

      expect(sample.override_verdict).toBe('overridden_approved');
      expect(sample.override_reason).toBe('Client approved the current design direction');
      expect(sample.overridden_by).toBe('admin-user-1');
      expect(sample.overridden_at).toBe('2026-01-16T14:30:00Z');
    });
  });

  // ===========================================================================
  // AIChangeRequest
  // ===========================================================================

  describe('AIChangeRequest interface', () => {
    it('has index and text fields', () => {
      const sample: AIChangeRequest = {
        index: 1,
        text: 'Change the header color to blue',
      };

      expect(sample.index).toBe(1);
      expect(sample.text).toBe('Change the header color to blue');
    });

    it('supports sequential indexing', () => {
      const requests: AIChangeRequest[] = [
        { index: 1, text: 'Fix the logo' },
        { index: 2, text: 'Update the footer' },
        { index: 3, text: 'Resize the banner' },
      ];

      expect(requests).toHaveLength(3);
      for (let i = 0; i < requests.length; i++) {
        expect(requests[i].index).toBe(i + 1);
        expect(typeof requests[i].text).toBe('string');
      }
    });
  });

  // ===========================================================================
  // AIChangeVerdictResult
  // ===========================================================================

  describe('AIChangeVerdictResult interface', () => {
    it('has all 4 fields (index, verdict, reasoning, suggestions)', () => {
      const sample: AIChangeVerdictResult = {
        index: 1,
        verdict: 'PASS',
        reasoning: 'The header color was changed to the correct blue shade.',
        suggestions: '',
      };

      expect(sample.index).toBe(1);
      expect(sample.verdict).toBe('PASS');
      expect(sample.reasoning).toBe('The header color was changed to the correct blue shade.');
      expect(sample.suggestions).toBe('');
    });

    it('supports FAIL verdict with suggestions', () => {
      const sample: AIChangeVerdictResult = {
        index: 2,
        verdict: 'FAIL',
        reasoning: 'The logo was not resized.',
        suggestions: 'Increase the logo width by 20% and maintain aspect ratio.',
      };

      expect(sample.verdict).toBe('FAIL');
      expect(sample.suggestions).toBe('Increase the logo width by 20% and maintain aspect ratio.');
    });
  });

  // ===========================================================================
  // AIReviewVerdict
  // ===========================================================================

  describe('AIReviewVerdict type', () => {
    it('covers all 5 values', () => {
      const verdicts: AIReviewVerdict[] = [
        'pending',
        'approved',
        'revisions_needed',
        'overridden_approved',
        'overridden_rejected',
      ];
      expect(verdicts).toHaveLength(5);
      for (const v of verdicts) {
        expect(typeof v).toBe('string');
      }
    });
  });

  // ===========================================================================
  // AIChangeVerdict
  // ===========================================================================

  describe('AIChangeVerdict type', () => {
    it('covers PASS/FAIL/PARTIAL', () => {
      const verdicts: AIChangeVerdict[] = ['PASS', 'FAIL', 'PARTIAL'];
      expect(verdicts).toHaveLength(3);
      for (const v of verdicts) {
        expect(typeof v).toBe('string');
      }
    });
  });
});
