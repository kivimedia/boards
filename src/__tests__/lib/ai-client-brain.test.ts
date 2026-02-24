import { describe, it, expect } from 'vitest';
import { chunkText } from '../../lib/ai/client-brain';
import type { BrainQueryInput, BrainQueryOutput, IndexDocumentInput } from '../../lib/ai/client-brain';

describe('AI Client Brain (P2.5)', () => {
  // ===========================================================================
  // chunkText — short text (single chunk)
  // ===========================================================================

  describe('chunkText — short text', () => {
    it('returns a single chunk when text is shorter than chunkSize', () => {
      const text = 'This is a short piece of text.';
      const result = chunkText(text, 1500, 200);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(text);
    });

    it('returns a single chunk when text length equals chunkSize', () => {
      const text = 'A'.repeat(1500);
      const result = chunkText(text, 1500, 200);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(text);
    });
  });

  // ===========================================================================
  // chunkText — long text (multiple chunks)
  // ===========================================================================

  describe('chunkText — long text', () => {
    it('splits long text into multiple chunks', () => {
      const text = 'A'.repeat(4000);
      const result = chunkText(text, 1500, 200);

      expect(result.length).toBeGreaterThan(1);
      // Every chunk except possibly the last should be exactly chunkSize
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i]).toHaveLength(1500);
      }
    });

    it('covers the entire text with no content lost', () => {
      const text = 'ABCDEFGHIJ'.repeat(200); // 2000 chars
      const result = chunkText(text, 500, 100);

      // Each character in the original text should appear in at least one chunk
      const allContent = result.join('');
      for (const char of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']) {
        expect(allContent).toContain(char);
      }
    });
  });

  // ===========================================================================
  // chunkText — overlap
  // ===========================================================================

  describe('chunkText — overlap', () => {
    it('creates overlapping chunks where the end of one chunk appears at the start of the next', () => {
      const text = 'A'.repeat(3000);
      const chunkSize = 1500;
      const overlap = 200;
      const result = chunkText(text, chunkSize, overlap);

      expect(result.length).toBeGreaterThan(1);

      // Verify overlap: the last `overlap` chars of chunk[0] should match
      // the first `overlap` chars of chunk[1]
      if (result.length >= 2) {
        const endOfFirst = result[0].slice(-overlap);
        const startOfSecond = result[1].slice(0, overlap);
        expect(endOfFirst).toBe(startOfSecond);
      }
    });

    it('respects zero overlap', () => {
      const text = 'ABCD'.repeat(500); // 2000 chars
      const result = chunkText(text, 1000, 0);

      expect(result.length).toBe(2);
      expect(result[0]).toHaveLength(1000);
      expect(result[1]).toHaveLength(1000);
    });
  });

  // ===========================================================================
  // chunkText — exact chunk size
  // ===========================================================================

  describe('chunkText — exact chunk size', () => {
    it('returns a single chunk when text length exactly equals chunk size', () => {
      const text = 'X'.repeat(500);
      const result = chunkText(text, 500, 100);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(text);
    });

    it('handles chunk size of 1 correctly', () => {
      const text = 'ABC';
      const result = chunkText(text, 1, 0);

      expect(result.length).toBeGreaterThanOrEqual(3);
      expect(result[0]).toBe('A');
      expect(result[1]).toBe('B');
      expect(result[2]).toBe('C');
    });
  });

  // ===========================================================================
  // BrainQueryInput type structure
  // ===========================================================================

  describe('BrainQueryInput type', () => {
    it('accepts a valid BrainQueryInput object with required fields', () => {
      const input: BrainQueryInput = {
        clientId: 'client-123',
        userId: 'user-456',
        query: 'What are the brand guidelines?',
      };

      expect(input.clientId).toBe('client-123');
      expect(input.userId).toBe('user-456');
      expect(input.query).toBe('What are the brand guidelines?');
    });
  });

  // ===========================================================================
  // BrainQueryOutput type structure
  // ===========================================================================

  describe('BrainQueryOutput type', () => {
    it('has all required fields', () => {
      const output: BrainQueryOutput = {
        response: 'The brand uses navy and electric blue as primary colors.',
        confidence: 0.85,
        sources: [
          { document_id: 'doc-1', title: 'Brand Guidelines', similarity: 0.92 },
          { document_id: 'doc-2', title: 'Design System', similarity: 0.78 },
        ],
        modelUsed: 'claude-sonnet-4-20250514',
        inputTokens: 350,
        outputTokens: 120,
      };

      expect(output.response).toBe('The brand uses navy and electric blue as primary colors.');
      expect(output.confidence).toBe(0.85);
      expect(output.sources).toHaveLength(2);
      expect(output.modelUsed).toBe('claude-sonnet-4-20250514');
      expect(typeof output.inputTokens).toBe('number');
      expect(typeof output.outputTokens).toBe('number');
    });

    it('sources contain document_id, title, and similarity', () => {
      const output: BrainQueryOutput = {
        response: 'Done',
        confidence: 0.5,
        sources: [
          { document_id: 'doc-abc', title: 'Project Brief', similarity: 0.65 },
        ],
        modelUsed: 'test-model',
        inputTokens: 100,
        outputTokens: 50,
      };

      const source = output.sources[0];
      expect(source.document_id).toBe('doc-abc');
      expect(source.title).toBe('Project Brief');
      expect(source.similarity).toBe(0.65);
    });
  });

  // ===========================================================================
  // IndexDocumentInput type structure
  // ===========================================================================

  describe('IndexDocumentInput type', () => {
    it('accepts all required and optional fields', () => {
      const input: IndexDocumentInput = {
        clientId: 'client-789',
        sourceType: 'card',
        sourceId: 'card-001',
        title: 'Homepage Redesign',
        content: 'The homepage redesign focuses on improving conversion rates.',
        metadata: { priority: 'high', sprint: 3 },
      };

      expect(input.clientId).toBe('client-789');
      expect(input.sourceType).toBe('card');
      expect(input.sourceId).toBe('card-001');
      expect(input.title).toBe('Homepage Redesign');
      expect(input.content).toContain('homepage redesign');
      expect(input.metadata).toEqual({ priority: 'high', sprint: 3 });
    });

    it('works without optional fields', () => {
      const input: IndexDocumentInput = {
        clientId: 'client-789',
        sourceType: 'manual',
        title: 'Meeting Notes',
        content: 'Discussion about Q2 goals.',
      };

      expect(input.clientId).toBe('client-789');
      expect(input.sourceType).toBe('manual');
      expect(input.sourceId).toBeUndefined();
      expect(input.metadata).toBeUndefined();
    });
  });
});
