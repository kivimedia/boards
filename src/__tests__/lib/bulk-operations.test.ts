import { describe, it, expect } from 'vitest';
import {
  bulkMoveCards,
  bulkAssign,
  bulkAddLabel,
  bulkDelete,
  bulkSetPriority,
  bulkArchive,
} from '@/lib/bulk-operations';
import * as bulkOperationsModule from '@/lib/bulk-operations';

describe('Bulk Operations (v5.3.0)', () => {
  // ===========================================================================
  // Module-level checks
  // ===========================================================================

  describe('module', () => {
    it('imports without throwing', () => {
      expect(bulkOperationsModule).toBeDefined();
    });

    it('exports exactly 6 functions', () => {
      const exportKeys = Object.keys(bulkOperationsModule);
      expect(exportKeys).toHaveLength(6);
    });

    it('all exports are functions', () => {
      for (const key of Object.keys(bulkOperationsModule)) {
        expect(typeof (bulkOperationsModule as Record<string, unknown>)[key]).toBe('function');
      }
    });

    it('export names match expected set', () => {
      const exportKeys = Object.keys(bulkOperationsModule);
      expect(exportKeys).toContain('bulkMoveCards');
      expect(exportKeys).toContain('bulkAssign');
      expect(exportKeys).toContain('bulkAddLabel');
      expect(exportKeys).toContain('bulkDelete');
      expect(exportKeys).toContain('bulkSetPriority');
      expect(exportKeys).toContain('bulkArchive');
    });
  });

  // ===========================================================================
  // Bulk Operations exports
  // ===========================================================================

  describe('Bulk Operations exports', () => {
    // -------------------------------------------------------------------------
    // bulkMoveCards
    // -------------------------------------------------------------------------

    describe('bulkMoveCards', () => {
      it('is exported and is a function', () => {
        expect(typeof bulkMoveCards).toBe('function');
      });

      it('requires 3 arguments (supabase, cardIds, targetListId)', () => {
        expect(bulkMoveCards.length).toBe(3);
      });

      it('has the correct function name', () => {
        expect(bulkMoveCards.name).toBe('bulkMoveCards');
      });
    });

    // -------------------------------------------------------------------------
    // bulkAssign
    // -------------------------------------------------------------------------

    describe('bulkAssign', () => {
      it('is exported and is a function', () => {
        expect(typeof bulkAssign).toBe('function');
      });

      it('requires 3 arguments (supabase, cardIds, userId)', () => {
        expect(bulkAssign.length).toBe(3);
      });

      it('has the correct function name', () => {
        expect(bulkAssign.name).toBe('bulkAssign');
      });
    });

    // -------------------------------------------------------------------------
    // bulkAddLabel
    // -------------------------------------------------------------------------

    describe('bulkAddLabel', () => {
      it('is exported and is a function', () => {
        expect(typeof bulkAddLabel).toBe('function');
      });

      it('requires 3 arguments (supabase, cardIds, labelId)', () => {
        expect(bulkAddLabel.length).toBe(3);
      });

      it('has the correct function name', () => {
        expect(bulkAddLabel.name).toBe('bulkAddLabel');
      });
    });

    // -------------------------------------------------------------------------
    // bulkDelete
    // -------------------------------------------------------------------------

    describe('bulkDelete', () => {
      it('is exported and is a function', () => {
        expect(typeof bulkDelete).toBe('function');
      });

      it('requires 2 arguments (supabase, cardIds)', () => {
        expect(bulkDelete.length).toBe(2);
      });

      it('has the correct function name', () => {
        expect(bulkDelete.name).toBe('bulkDelete');
      });
    });

    // -------------------------------------------------------------------------
    // bulkSetPriority
    // -------------------------------------------------------------------------

    describe('bulkSetPriority', () => {
      it('is exported and is a function', () => {
        expect(typeof bulkSetPriority).toBe('function');
      });

      it('requires 3 arguments (supabase, cardIds, priority)', () => {
        expect(bulkSetPriority.length).toBe(3);
      });

      it('has the correct function name', () => {
        expect(bulkSetPriority.name).toBe('bulkSetPriority');
      });
    });
  });
});
