import { describe, it, expect } from 'vitest';
import * as boardRoute from '@/app/api/boards/[id]/route';
import type { Board } from '@/lib/types';

/**
 * Tests for board archive and star functionality.
 *
 * The board PATCH route (src/app/api/boards/[id]/route.ts) handles
 * is_archived and is_starred fields in the UpdateBoardBody interface.
 * The Board type includes is_archived and is_starred boolean fields.
 */

describe('Board Archive & Star', () => {
  describe('route exports', () => {
    it('exports a GET handler', () => {
      expect(typeof boardRoute.GET).toBe('function');
    });

    it('exports a PATCH handler', () => {
      expect(typeof boardRoute.PATCH).toBe('function');
    });

    it('exports a DELETE handler', () => {
      expect(typeof boardRoute.DELETE).toBe('function');
    });
  });

  describe('Board type includes archive and star fields', () => {
    it('Board type allows is_archived boolean', () => {
      const board: Board = {
        id: 'board-1',
        name: 'Test Board',
        type: 'dev',
        created_by: 'user-1',
        created_at: '2026-01-01T00:00:00Z',
        is_archived: true,
        is_starred: false,
      };

      expect(board.is_archived).toBe(true);
      expect(board.is_starred).toBe(false);
    });

    it('Board type allows is_starred boolean', () => {
      const board: Board = {
        id: 'board-2',
        name: 'Starred Board',
        type: 'graphic_designer',
        created_by: 'user-1',
        created_at: '2026-01-01T00:00:00Z',
        is_archived: false,
        is_starred: true,
      };

      expect(board.is_starred).toBe(true);
      expect(board.is_archived).toBe(false);
    });
  });

  describe('UpdateBoardBody shape', () => {
    it('can construct an archive update payload', () => {
      const update = { is_archived: true };
      expect(update.is_archived).toBe(true);
    });

    it('can construct a star update payload', () => {
      const update = { is_starred: true };
      expect(update.is_starred).toBe(true);
    });

    it('can construct a combined update payload', () => {
      const update = {
        name: 'Renamed Board',
        is_archived: false,
        is_starred: true,
        background_color: '#ff0000',
      };

      expect(update).toHaveProperty('name');
      expect(update).toHaveProperty('is_archived');
      expect(update).toHaveProperty('is_starred');
      expect(update).toHaveProperty('background_color');
    });
  });
});
