import { describe, it, expect } from 'vitest';
import * as dedupRoute from '@/app/api/dedup/workspace/route';

/**
 * Dedup Workspace tests (P8.1 Board Maintenance).
 *
 * Tests the route module exports and the dedup scoring algorithm
 * replicated from scanBoardForDuplicates in the route handler.
 */

// Replicated scoring logic from workspace dedup route
interface ScoredPlacement {
  card_id: string;
  updated_at: string;
  comments: number;
  attachments: number;
}

function scoreDuplicates(placements: ScoredPlacement[]): ScoredPlacement[] {
  return [...placements].sort((a, b) => {
    const timeA = new Date(a.updated_at).getTime();
    const timeB = new Date(b.updated_at).getTime();
    if (timeA !== timeB) return timeB - timeA; // most recent first
    if (a.comments !== b.comments) return b.comments - a.comments; // most comments first
    return b.attachments - a.attachments; // most attachments first
  });
}

describe('Dedup Workspace (P8.1)', () => {
  describe('module exports', () => {
    it('exports GET handler as a function', () => {
      expect(typeof dedupRoute.GET).toBe('function');
    });

    it('exports POST handler as a function', () => {
      expect(typeof dedupRoute.POST).toBe('function');
    });
  });

  describe('dedup scoring logic', () => {
    it('most recently updated card is ranked first (keep)', () => {
      const result = scoreDuplicates([
        { card_id: 'old', updated_at: '2025-01-01T00:00:00Z', comments: 0, attachments: 0 },
        { card_id: 'new', updated_at: '2025-06-15T00:00:00Z', comments: 0, attachments: 0 },
      ]);
      expect(result[0].card_id).toBe('new');
    });

    it('comment count breaks ties when updated_at is equal', () => {
      const ts = '2025-06-15T00:00:00Z';
      const result = scoreDuplicates([
        { card_id: 'no-comments', updated_at: ts, comments: 0, attachments: 0 },
        { card_id: 'has-comments', updated_at: ts, comments: 5, attachments: 0 },
      ]);
      expect(result[0].card_id).toBe('has-comments');
    });

    it('attachment count breaks ties when updated_at and comments are equal', () => {
      const ts = '2025-06-15T00:00:00Z';
      const result = scoreDuplicates([
        { card_id: 'no-attach', updated_at: ts, comments: 3, attachments: 0 },
        { card_id: 'has-attach', updated_at: ts, comments: 3, attachments: 2 },
      ]);
      expect(result[0].card_id).toBe('has-attach');
    });

    it('multiple duplicates are sorted correctly', () => {
      const result = scoreDuplicates([
        { card_id: 'oldest', updated_at: '2024-01-01T00:00:00Z', comments: 10, attachments: 5 },
        { card_id: 'newest', updated_at: '2025-12-01T00:00:00Z', comments: 0, attachments: 0 },
        { card_id: 'middle', updated_at: '2025-06-01T00:00:00Z', comments: 5, attachments: 3 },
      ]);
      expect(result[0].card_id).toBe('newest');
      expect(result[1].card_id).toBe('middle');
      expect(result[2].card_id).toBe('oldest');
    });

    it('first card in sorted result is "keep", rest are "remove"', () => {
      const result = scoreDuplicates([
        { card_id: 'a', updated_at: '2025-01-01T00:00:00Z', comments: 0, attachments: 0 },
        { card_id: 'b', updated_at: '2025-06-01T00:00:00Z', comments: 0, attachments: 0 },
        { card_id: 'c', updated_at: '2025-03-01T00:00:00Z', comments: 0, attachments: 0 },
      ]);
      const keep = result[0];
      const remove = result.slice(1);
      expect(keep.card_id).toBe('b');
      expect(remove).toHaveLength(2);
    });
  });

  describe('type shapes', () => {
    it('BoardDedupResult shape is constructable', () => {
      const result = {
        board_id: 'uuid-123',
        board_name: 'Test Board',
        total_cards: 100,
        duplicate_cards: 10,
        duplicate_groups: [
          {
            title: 'Duplicate Card',
            keep: { card_id: 'k1', list_name: 'Done', comment_count: 2, attachment_count: 1 },
            remove: [{ card_id: 'r1', list_name: 'Todo', comment_count: 0, attachment_count: 0 }],
          },
        ],
      };
      expect(result.board_id).toBe('uuid-123');
      expect(result.duplicate_groups).toHaveLength(1);
      expect(result.duplicate_groups[0].remove).toHaveLength(1);
    });

    it('CleanupBody shape with actions array', () => {
      const body = {
        actions: [
          { board_id: 'b1', card_ids: ['c1', 'c2', 'c3'] },
          { board_id: 'b2', card_ids: ['c4'] },
        ],
      };
      expect(body.actions).toHaveLength(2);
      expect(body.actions[0].card_ids).toHaveLength(3);
    });
  });
});
