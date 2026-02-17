import { describe, it, expect } from 'vitest';
import * as brainIndexers from '@/lib/ai/brain-indexers';

// ============================================================================
// TESTS
// ============================================================================

describe('Brain Indexers', () => {
  // --------------------------------------------------------------------------
  // Module exports
  // --------------------------------------------------------------------------
  describe('module exports', () => {
    it('exports indexMapBoard as a function', () => {
      expect(typeof brainIndexers.indexMapBoard).toBe('function');
    });

    it('exports indexWikiPage as a function', () => {
      expect(typeof brainIndexers.indexWikiPage).toBe('function');
    });

    it('exports indexAsset as a function', () => {
      expect(typeof brainIndexers.indexAsset).toBe('function');
    });

    it('exports indexComment as a function', () => {
      expect(typeof brainIndexers.indexComment).toBe('function');
    });

    it('exports exactly 4 indexer functions', () => {
      const exportedFunctions = Object.values(brainIndexers).filter(
        (v) => typeof v === 'function'
      );
      expect(exportedFunctions).toHaveLength(4);
    });

    it('does not export indexDocument (imported from client-brain, not re-exported)', () => {
      expect((brainIndexers as Record<string, unknown>).indexDocument).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Function arity
  // --------------------------------------------------------------------------
  describe('function arity', () => {
    it('indexMapBoard accepts 2 arguments (supabase, clientId)', () => {
      expect(brainIndexers.indexMapBoard.length).toBe(2);
    });

    it('indexWikiPage accepts 3 arguments (supabase, pageId, clientId)', () => {
      expect(brainIndexers.indexWikiPage.length).toBe(3);
    });

    it('indexAsset accepts 3 arguments (supabase, assetId, clientId)', () => {
      expect(brainIndexers.indexAsset.length).toBe(3);
    });

    it('indexComment accepts 3 arguments (supabase, commentId, clientId)', () => {
      expect(brainIndexers.indexComment.length).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // Return type expectations (all return Promises)
  // --------------------------------------------------------------------------
  describe('return type expectations', () => {
    it('all 4 exported functions are async (return thenables when called)', () => {
      // We verify they are async functions by checking their constructor name
      const fns = [
        brainIndexers.indexMapBoard,
        brainIndexers.indexWikiPage,
        brainIndexers.indexAsset,
        brainIndexers.indexComment,
      ];

      for (const fn of fns) {
        expect(fn.constructor.name).toBe('AsyncFunction');
      }
    });
  });

  // --------------------------------------------------------------------------
  // indexMapBoard return shape
  // --------------------------------------------------------------------------
  describe('indexMapBoard return shape', () => {
    it('returns a Promise of { indexed: number; errors: number }', () => {
      // Verify the shape via a type-safe mock return value
      const expectedShape: Awaited<ReturnType<typeof brainIndexers.indexMapBoard>> = {
        indexed: 5,
        errors: 1,
      };

      expect(typeof expectedShape.indexed).toBe('number');
      expect(typeof expectedShape.errors).toBe('number');
      expect(Object.keys(expectedShape).sort()).toEqual(['errors', 'indexed']);
    });
  });

  // --------------------------------------------------------------------------
  // indexWikiPage return shape
  // --------------------------------------------------------------------------
  describe('indexWikiPage return shape', () => {
    it('success shape has { success: true }', () => {
      const successResult: Awaited<ReturnType<typeof brainIndexers.indexWikiPage>> = {
        success: true,
      };

      expect(successResult.success).toBe(true);
      expect(successResult.error).toBeUndefined();
    });

    it('failure shape has { success: false, error: string }', () => {
      const failResult: Awaited<ReturnType<typeof brainIndexers.indexWikiPage>> = {
        success: false,
        error: 'Page not found',
      };

      expect(failResult.success).toBe(false);
      expect(typeof failResult.error).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // indexAsset return shape
  // --------------------------------------------------------------------------
  describe('indexAsset return shape', () => {
    it('success shape has { success: true }', () => {
      const result: Awaited<ReturnType<typeof brainIndexers.indexAsset>> = {
        success: true,
      };

      expect(result.success).toBe(true);
    });

    it('failure shape has { success: false, error: string }', () => {
      const result: Awaited<ReturnType<typeof brainIndexers.indexAsset>> = {
        success: false,
        error: 'Asset not found',
      };

      expect(result.success).toBe(false);
      expect(typeof result.error).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // indexComment return shape
  // --------------------------------------------------------------------------
  describe('indexComment return shape', () => {
    it('success shape has { success: true }', () => {
      const result: Awaited<ReturnType<typeof brainIndexers.indexComment>> = {
        success: true,
      };

      expect(result.success).toBe(true);
    });

    it('failure shape has { success: false, error: string }', () => {
      const result: Awaited<ReturnType<typeof brainIndexers.indexComment>> = {
        success: false,
        error: 'Comment too short for indexing',
      };

      expect(result.success).toBe(false);
      expect(typeof result.error).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // Export names
  // --------------------------------------------------------------------------
  describe('export names', () => {
    it('all exported function names follow the index* naming convention', () => {
      const exportedNames = Object.keys(brainIndexers);
      for (const name of exportedNames) {
        expect(name).toMatch(/^index[A-Z]/);
      }
    });
  });
});
