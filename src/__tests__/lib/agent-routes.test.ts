import { describe, it, expect } from 'vitest';

/**
 * Tests verifying agent API routes export correct HTTP handlers.
 *
 * - src/app/api/agents/run/route.ts should export POST
 * - src/app/api/agents/skills/route.ts should export GET and POST
 */

describe('Agent API Routes', () => {
  describe('/api/agents/run', () => {
    it('exports POST as a function', async () => {
      const mod = await import('@/app/api/agents/run/route');
      expect(typeof mod.POST).toBe('function');
    });

    it('does not export GET', async () => {
      const mod = await import('@/app/api/agents/run/route');
      expect((mod as any).GET).toBeUndefined();
    });
  });

  describe('/api/agents/skills', () => {
    it('exports GET as a function', async () => {
      const mod = await import('@/app/api/agents/skills/route');
      expect(typeof mod.GET).toBe('function');
    });

    it('exports POST as a function', async () => {
      const mod = await import('@/app/api/agents/skills/route');
      expect(typeof mod.POST).toBe('function');
    });
  });
});
