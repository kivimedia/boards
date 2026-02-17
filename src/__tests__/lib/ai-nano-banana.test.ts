import { describe, it, expect } from 'vitest';
import type {
  NanoBananaEditInput,
  NanoBananaGenerateInput,
  NanoBananaOutput,
} from '@/lib/ai/nano-banana';

/**
 * Type-shape tests for Nano Banana types (P2.6).
 *
 * These tests verify that the type definitions compile correctly and that
 * sample objects conforming to each interface contain all expected fields.
 * The assertions run at both compile time (TypeScript) and runtime (Vitest).
 */

describe('Nano Banana Types (P2.6)', () => {
  // ===========================================================================
  // NanoBananaEditInput
  // ===========================================================================

  describe('NanoBananaEditInput interface', () => {
    it('has all expected fields', () => {
      const sample: NanoBananaEditInput = {
        cardId: 'card-abc',
        userId: 'user-1',
        boardId: 'board-1',
        attachmentId: 'attach-1',
        imageBase64: 'iVBORw0KGgoAAAANSUhEUg==',
        mimeType: 'image/png',
        editInstruction: 'Make the background blue',
      };

      expect(sample.cardId).toBe('card-abc');
      expect(sample.userId).toBe('user-1');
      expect(sample.boardId).toBe('board-1');
      expect(sample.attachmentId).toBe('attach-1');
      expect(sample.imageBase64).toBe('iVBORw0KGgoAAAANSUhEUg==');
      expect(sample.mimeType).toBe('image/png');
      expect(sample.editInstruction).toBe('Make the background blue');
    });

    it('requires imageBase64, mimeType, and editInstruction', () => {
      const sample: NanoBananaEditInput = {
        cardId: 'card-1',
        userId: 'user-1',
        attachmentId: 'attach-1',
        imageBase64: 'base64data',
        mimeType: 'image/jpeg',
        editInstruction: 'Crop to center',
      };

      // These three fields must be present and non-empty for a valid edit
      expect(sample.imageBase64).toBeTruthy();
      expect(sample.mimeType).toBeTruthy();
      expect(sample.editInstruction).toBeTruthy();
    });

    it('allows optional boardId', () => {
      const withBoard: NanoBananaEditInput = {
        cardId: 'card-1',
        userId: 'user-1',
        boardId: 'board-1',
        attachmentId: 'attach-1',
        imageBase64: 'data',
        mimeType: 'image/png',
        editInstruction: 'Add a border',
      };

      const withoutBoard: NanoBananaEditInput = {
        cardId: 'card-1',
        userId: 'user-1',
        attachmentId: 'attach-1',
        imageBase64: 'data',
        mimeType: 'image/png',
        editInstruction: 'Add a border',
      };

      expect(withBoard.boardId).toBe('board-1');
      expect(withoutBoard.boardId).toBeUndefined();
    });
  });

  // ===========================================================================
  // NanoBananaGenerateInput
  // ===========================================================================

  describe('NanoBananaGenerateInput interface', () => {
    it('has all expected fields', () => {
      const sample: NanoBananaGenerateInput = {
        cardId: 'card-abc',
        userId: 'user-1',
        boardId: 'board-1',
        prompt: 'A sunset over the ocean with palm trees',
        aspectRatio: '16:9',
      };

      expect(sample.cardId).toBe('card-abc');
      expect(sample.userId).toBe('user-1');
      expect(sample.boardId).toBe('board-1');
      expect(sample.prompt).toBe('A sunset over the ocean with palm trees');
      expect(sample.aspectRatio).toBe('16:9');
    });

    it('requires prompt', () => {
      const sample: NanoBananaGenerateInput = {
        cardId: 'card-1',
        userId: 'user-1',
        prompt: 'A minimalist logo design',
      };

      expect(sample.prompt).toBeTruthy();
    });

    it('allows optional boardId and aspectRatio', () => {
      const minimal: NanoBananaGenerateInput = {
        cardId: 'card-1',
        userId: 'user-1',
        prompt: 'An abstract painting',
      };

      expect(minimal.boardId).toBeUndefined();
      expect(minimal.aspectRatio).toBeUndefined();
    });
  });

  // ===========================================================================
  // NanoBananaOutput
  // ===========================================================================

  describe('NanoBananaOutput interface', () => {
    it('has all expected fields', () => {
      const sample: NanoBananaOutput = {
        imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk',
        mimeType: 'image/png',
        modelUsed: 'gemini-2.0-flash-exp',
        inputTokens: 1500,
        outputTokens: 800,
      };

      expect(sample.imageBase64).toBe(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk'
      );
      expect(sample.mimeType).toBe('image/png');
      expect(sample.modelUsed).toBe('gemini-2.0-flash-exp');
      expect(sample.inputTokens).toBe(1500);
      expect(sample.outputTokens).toBe(800);
    });

    it('has numeric token counts', () => {
      const sample: NanoBananaOutput = {
        imageBase64: 'data',
        mimeType: 'image/jpeg',
        modelUsed: 'gemini-2.0-flash-exp',
        inputTokens: 0,
        outputTokens: 0,
      };

      expect(typeof sample.inputTokens).toBe('number');
      expect(typeof sample.outputTokens).toBe('number');
    });
  });

  // ===========================================================================
  // Valid aspect ratios for generation
  // ===========================================================================

  describe('Valid aspect ratios', () => {
    it('supports all 5 valid aspect ratios', () => {
      const ratios: NanoBananaGenerateInput['aspectRatio'][] = [
        '1:1',
        '16:9',
        '9:16',
        '4:3',
        '3:4',
      ];

      expect(ratios).toHaveLength(5);
      for (const r of ratios) {
        expect(typeof r).toBe('string');
      }
    });

    it('each ratio matches the expected format', () => {
      const ratios: NanoBananaGenerateInput['aspectRatio'][] = [
        '1:1',
        '16:9',
        '9:16',
        '4:3',
        '3:4',
      ];

      const ratioPattern = /^\d+:\d+$/;
      for (const r of ratios) {
        expect(r).toMatch(ratioPattern);
      }
    });

    it('can be used in a generate input', () => {
      const ratios: NonNullable<NanoBananaGenerateInput['aspectRatio']>[] = [
        '1:1',
        '16:9',
        '9:16',
        '4:3',
        '3:4',
      ];

      for (const ratio of ratios) {
        const input: NanoBananaGenerateInput = {
          cardId: 'card-1',
          userId: 'user-1',
          prompt: 'Test image',
          aspectRatio: ratio,
        };
        expect(input.aspectRatio).toBe(ratio);
      }
    });
  });
});
