import { describe, it, expect } from 'vitest';
import {
  checkVersionConflict,
  bumpVersion,
  resolveConflict,
  getCardVersion,
} from '@/lib/conflict-resolution';
import * as conflictResolutionModule from '@/lib/conflict-resolution';

describe('Conflict Resolution (v5.4.0)', () => {
  // ===========================================================================
  // Function exports
  // ===========================================================================

  describe('function exports', () => {
    it('checkVersionConflict is a function', () => {
      expect(typeof checkVersionConflict).toBe('function');
    });

    it('bumpVersion is a function', () => {
      expect(typeof bumpVersion).toBe('function');
    });

    it('resolveConflict is a function', () => {
      expect(typeof resolveConflict).toBe('function');
    });

    it('getCardVersion is a function', () => {
      expect(typeof getCardVersion).toBe('function');
    });
  });

  // ===========================================================================
  // resolveConflict pure logic tests
  // ===========================================================================

  describe('resolveConflict pure logic', () => {
    it('resolveConflict with "keep_mine" returns localData', () => {
      const localData = { title: 'My Title', description: 'My Desc' };
      const serverData = { title: 'Server Title', description: 'Server Desc' };

      const result = resolveConflict(localData, serverData, 'keep_mine');

      expect(result).toBe(localData);
      expect(result).toEqual({ title: 'My Title', description: 'My Desc' });
    });

    it('resolveConflict with "keep_theirs" returns serverData', () => {
      const localData = { title: 'My Title', description: 'My Desc' };
      const serverData = { title: 'Server Title', description: 'Server Desc' };

      const result = resolveConflict(localData, serverData, 'keep_theirs');

      expect(result).toBe(serverData);
      expect(result).toEqual({ title: 'Server Title', description: 'Server Desc' });
    });

    it('resolveConflict with "merge" returns merged object (local fields win for changed values)', () => {
      const localData = { title: 'Local Title', status: 'done' };
      const serverData = { title: 'Server Title', status: 'in_progress', priority: 'high' };

      const result = resolveConflict(localData, serverData, 'merge');

      expect(result.title).toBe('Local Title');
      expect(result.status).toBe('done');
      expect(result.priority).toBe('high');
    });

    it('resolveConflict "keep_mine" with empty localData returns empty object', () => {
      const localData: Record<string, unknown> = {};
      const serverData = { title: 'Server Title' };

      const result = resolveConflict(localData, serverData, 'keep_mine');

      expect(result).toEqual({});
    });

    it('resolveConflict "keep_theirs" with empty serverData returns empty object', () => {
      const localData = { title: 'My Title' };
      const serverData: Record<string, unknown> = {};

      const result = resolveConflict(localData, serverData, 'keep_theirs');

      expect(result).toEqual({});
    });

    it('resolveConflict merge: local={title:"A", description:"B"}, server={title:"C", description:"B"} -> merged has title:"A", description:"B"', () => {
      const localData = { title: 'A', description: 'B' };
      const serverData = { title: 'C', description: 'B' };

      const result = resolveConflict(localData, serverData, 'merge');

      // local wins for changed fields: title differs so local wins
      expect(result.title).toBe('A');
      // description is same in both, so server value stays (unchanged)
      expect(result.description).toBe('B');
    });

    it('resolveConflict merge: local={title:"A"}, server={title:"A", description:"B"} -> merged has title:"A", description:"B"', () => {
      const localData = { title: 'A' };
      const serverData = { title: 'A', description: 'B' };

      const result = resolveConflict(localData, serverData, 'merge');

      // title is same in both, server base remains
      expect(result.title).toBe('A');
      // description only on server, so it stays from server spread
      expect(result.description).toBe('B');
    });

    it('resolveConflict merge: both empty -> returns empty object', () => {
      const localData: Record<string, unknown> = {};
      const serverData: Record<string, unknown> = {};

      const result = resolveConflict(localData, serverData, 'merge');

      expect(result).toEqual({});
    });

    it('resolveConflict merge: local has extra field not in server -> merged includes it', () => {
      const localData = { title: 'A', customField: 'extra' };
      const serverData = { title: 'A' };

      const result = resolveConflict(localData, serverData, 'merge');

      expect(result.title).toBe('A');
      expect(result.customField).toBe('extra');
    });

    it('resolveConflict merge: server has extra field not in local -> merged includes it (server wins for fields only in server)', () => {
      const localData = { title: 'A' };
      const serverData = { title: 'A', serverOnly: 'value' };

      const result = resolveConflict(localData, serverData, 'merge');

      expect(result.title).toBe('A');
      expect(result.serverOnly).toBe('value');
    });
  });

  // ===========================================================================
  // Function arity tests
  // ===========================================================================

  describe('function arity', () => {
    it('checkVersionConflict.length is 3', () => {
      expect(checkVersionConflict.length).toBe(3);
    });

    it('bumpVersion.length is 3', () => {
      expect(bumpVersion.length).toBe(3);
    });

    it('resolveConflict.length is 3', () => {
      expect(resolveConflict.length).toBe(3);
    });

    it('getCardVersion.length is 2', () => {
      expect(getCardVersion.length).toBe(2);
    });
  });

  // ===========================================================================
  // Module-level checks
  // ===========================================================================

  describe('module', () => {
    it('imports without throwing', () => {
      expect(conflictResolutionModule).toBeDefined();
    });

    it('exports exactly 4 functions', () => {
      const exportKeys = Object.keys(conflictResolutionModule);
      expect(exportKeys).toHaveLength(4);
    });

    it('all exports are functions', () => {
      for (const key of Object.keys(conflictResolutionModule)) {
        expect(typeof (conflictResolutionModule as Record<string, unknown>)[key]).toBe('function');
      }
    });

    it('export names match expected set', () => {
      const exportKeys = Object.keys(conflictResolutionModule);
      expect(exportKeys).toContain('checkVersionConflict');
      expect(exportKeys).toContain('bumpVersion');
      expect(exportKeys).toContain('resolveConflict');
      expect(exportKeys).toContain('getCardVersion');
    });
  });
});
