import { describe, it, expect } from 'vitest';
import {
  REACTION_EMOJIS,
  getReactions,
  getReactionsForComments,
  addReaction,
  removeReaction,
} from '@/lib/comment-reactions';

describe('Comment Reactions (v5.2.0)', () => {
  // ===========================================================================
  // REACTION_EMOJIS
  // ===========================================================================

  describe('REACTION_EMOJIS', () => {
    it('is an array', () => {
      expect(Array.isArray(REACTION_EMOJIS)).toBe(true);
    });

    it('has exactly 7 emojis', () => {
      expect(REACTION_EMOJIS).toHaveLength(7);
    });

    it("contains '\uD83D\uDC4D'", () => {
      expect(REACTION_EMOJIS).toContain('\uD83D\uDC4D');
    });

    it("contains '\u2764\uFE0F'", () => {
      expect(REACTION_EMOJIS).toContain('\u2764\uFE0F');
    });

    it("contains '\uD83D\uDE02'", () => {
      expect(REACTION_EMOJIS).toContain('\uD83D\uDE02');
    });

    it("contains '\uD83C\uDF89'", () => {
      expect(REACTION_EMOJIS).toContain('\uD83C\uDF89');
    });

    it("contains '\uD83D\uDE80'", () => {
      expect(REACTION_EMOJIS).toContain('\uD83D\uDE80');
    });

    it("contains '\uD83D\uDC40'", () => {
      expect(REACTION_EMOJIS).toContain('\uD83D\uDC40');
    });

    it("contains '\uD83D\uDCAF'", () => {
      expect(REACTION_EMOJIS).toContain('\uD83D\uDCAF');
    });
  });

  // ===========================================================================
  // Function exports
  // ===========================================================================

  describe('function exports', () => {
    it('getReactions is a function', () => {
      expect(typeof getReactions).toBe('function');
    });

    it('getReactionsForComments is a function', () => {
      expect(typeof getReactionsForComments).toBe('function');
    });

    it('addReaction is a function', () => {
      expect(typeof addReaction).toBe('function');
    });

    it('removeReaction is a function', () => {
      expect(typeof removeReaction).toBe('function');
    });
  });
});
