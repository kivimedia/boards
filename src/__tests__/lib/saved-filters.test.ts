import { describe, it, expect } from 'vitest';
import {
  getSavedFilters,
  createSavedFilter,
  updateSavedFilter,
  deleteSavedFilter,
  getDefaultFilter,
} from '@/lib/saved-filters';
import * as savedFiltersModule from '@/lib/saved-filters';
import type { SavedFilter } from '@/lib/types';

describe('Saved Filters (v5.3.0)', () => {
  // ===========================================================================
  // Module-level checks
  // ===========================================================================

  describe('module', () => {
    it('imports without throwing', () => {
      expect(savedFiltersModule).toBeDefined();
    });

    it('exports exactly 5 functions', () => {
      const exportKeys = Object.keys(savedFiltersModule);
      expect(exportKeys).toHaveLength(5);
    });

    it('all exports are functions', () => {
      for (const key of Object.keys(savedFiltersModule)) {
        expect(typeof (savedFiltersModule as Record<string, unknown>)[key]).toBe('function');
      }
    });

    it('export names match expected set', () => {
      const exportKeys = Object.keys(savedFiltersModule);
      expect(exportKeys).toContain('getSavedFilters');
      expect(exportKeys).toContain('createSavedFilter');
      expect(exportKeys).toContain('updateSavedFilter');
      expect(exportKeys).toContain('deleteSavedFilter');
      expect(exportKeys).toContain('getDefaultFilter');
    });
  });

  // ===========================================================================
  // Function exports
  // ===========================================================================

  describe('function exports', () => {
    // -------------------------------------------------------------------------
    // getSavedFilters
    // -------------------------------------------------------------------------

    describe('getSavedFilters', () => {
      it('is exported and is a function', () => {
        expect(typeof getSavedFilters).toBe('function');
      });

      it('requires 3 arguments (supabase, boardId, userId)', () => {
        expect(getSavedFilters.length).toBe(3);
      });

      it('has the correct function name', () => {
        expect(getSavedFilters.name).toBe('getSavedFilters');
      });
    });

    // -------------------------------------------------------------------------
    // createSavedFilter
    // -------------------------------------------------------------------------

    describe('createSavedFilter', () => {
      it('is exported and is a function', () => {
        expect(typeof createSavedFilter).toBe('function');
      });

      it('requires 2 arguments (supabase, params)', () => {
        expect(createSavedFilter.length).toBe(2);
      });

      it('has the correct function name', () => {
        expect(createSavedFilter.name).toBe('createSavedFilter');
      });
    });

    // -------------------------------------------------------------------------
    // updateSavedFilter
    // -------------------------------------------------------------------------

    describe('updateSavedFilter', () => {
      it('is exported and is a function', () => {
        expect(typeof updateSavedFilter).toBe('function');
      });

      it('requires 4 arguments (supabase, filterId, userId, updates)', () => {
        expect(updateSavedFilter.length).toBe(4);
      });

      it('has the correct function name', () => {
        expect(updateSavedFilter.name).toBe('updateSavedFilter');
      });
    });

    // -------------------------------------------------------------------------
    // deleteSavedFilter
    // -------------------------------------------------------------------------

    describe('deleteSavedFilter', () => {
      it('is exported and is a function', () => {
        expect(typeof deleteSavedFilter).toBe('function');
      });

      it('requires 3 arguments (supabase, filterId, userId)', () => {
        expect(deleteSavedFilter.length).toBe(3);
      });

      it('has the correct function name', () => {
        expect(deleteSavedFilter.name).toBe('deleteSavedFilter');
      });
    });

    // -------------------------------------------------------------------------
    // getDefaultFilter
    // -------------------------------------------------------------------------

    describe('getDefaultFilter', () => {
      it('is exported and is a function', () => {
        expect(typeof getDefaultFilter).toBe('function');
      });

      it('requires 3 arguments (supabase, boardId, userId)', () => {
        expect(getDefaultFilter.length).toBe(3);
      });

      it('has the correct function name', () => {
        expect(getDefaultFilter.name).toBe('getDefaultFilter');
      });
    });
  });

  // ===========================================================================
  // SavedFilter type
  // ===========================================================================

  describe('SavedFilter type', () => {
    it('can create a valid SavedFilter object with all fields', () => {
      const filter: SavedFilter = {
        id: 'sf-001',
        board_id: 'board-abc',
        user_id: 'user-xyz',
        name: 'High Priority Items',
        filter_config: { priority: 'high', labels: ['urgent'] },
        is_default: false,
        is_shared: true,
        created_at: '2026-02-01T00:00:00Z',
        updated_at: '2026-02-01T12:00:00Z',
      };

      expect(filter).toBeDefined();
      expect(filter.id).toBe('sf-001');
      expect(filter.board_id).toBe('board-abc');
      expect(filter.user_id).toBe('user-xyz');
      expect(filter.name).toBe('High Priority Items');
      expect(filter.is_default).toBe(false);
      expect(filter.is_shared).toBe(true);
    });

    it('has id, board_id, user_id, name, filter_config, is_default, is_shared, created_at, updated_at fields', () => {
      const filter: SavedFilter = {
        id: 'sf-002',
        board_id: 'board-123',
        user_id: 'user-456',
        name: 'My Filter',
        filter_config: {},
        is_default: true,
        is_shared: false,
        created_at: '2026-01-15T10:00:00Z',
        updated_at: '2026-01-15T10:00:00Z',
      };

      expect(filter).toHaveProperty('id');
      expect(filter).toHaveProperty('board_id');
      expect(filter).toHaveProperty('user_id');
      expect(filter).toHaveProperty('name');
      expect(filter).toHaveProperty('filter_config');
      expect(filter).toHaveProperty('is_default');
      expect(filter).toHaveProperty('is_shared');
      expect(filter).toHaveProperty('created_at');
      expect(filter).toHaveProperty('updated_at');
    });

    it('filter_config can hold arbitrary keys (Record<string, unknown>)', () => {
      const filter: SavedFilter = {
        id: 'sf-003',
        board_id: 'board-999',
        user_id: 'user-888',
        name: 'Complex Filter',
        filter_config: {
          labels: ['design', 'review'],
          assignees: ['user-1', 'user-2'],
          priority: 'high',
          due_date_range: { start: '2026-01-01', end: '2026-12-31' },
          nested: { deep: { value: 42 } },
        },
        is_default: false,
        is_shared: false,
        created_at: '2026-02-10T00:00:00Z',
        updated_at: '2026-02-10T00:00:00Z',
      };

      expect(filter.filter_config).toHaveProperty('labels');
      expect(filter.filter_config).toHaveProperty('assignees');
      expect(filter.filter_config).toHaveProperty('priority');
      expect(filter.filter_config).toHaveProperty('due_date_range');
      expect(filter.filter_config).toHaveProperty('nested');
      expect(typeof filter.filter_config).toBe('object');
    });
  });
});
