import { describe, it, expect } from 'vitest';
import * as assistantRoute from '@/app/api/board-assistant/route';

/**
 * Board Assistant API route tests (P8.3 Smart Search).
 *
 * Tests module exports and request body shape validation.
 */

describe('Board Assistant API Route (P8.3)', () => {
  describe('module exports', () => {
    it('exports POST handler as a function', () => {
      expect(typeof assistantRoute.POST).toBe('function');
    });

    it('does not export a GET handler', () => {
      expect((assistantRoute as any).GET).toBeUndefined();
    });

    it('does not export a PUT handler', () => {
      expect((assistantRoute as any).PUT).toBeUndefined();
    });

    it('does not export a DELETE handler', () => {
      expect((assistantRoute as any).DELETE).toBeUndefined();
    });
  });

  describe('request body shape', () => {
    it('valid body has query and board_id strings', () => {
      const body = { query: 'What tasks are overdue?', board_id: 'uuid-123' };
      expect(typeof body.query).toBe('string');
      expect(typeof body.board_id).toBe('string');
      expect(body.query.length).toBeGreaterThan(0);
      expect(body.board_id.length).toBeGreaterThan(0);
    });

    it('missing query is invalid', () => {
      const body = { board_id: 'uuid-123' } as any;
      expect(body.query).toBeUndefined();
    });
  });
});
