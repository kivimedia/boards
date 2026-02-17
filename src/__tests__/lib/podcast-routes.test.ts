import { describe, it, expect } from 'vitest';

/**
 * Tests verifying key podcast API routes export correct HTTP handlers.
 *
 * These routes live under src/app/api/podcast/ and should export
 * standard Next.js route handler functions (GET, POST, PATCH, etc.).
 */

describe('Podcast API Routes', () => {
  describe('/api/podcast/candidates', () => {
    it('exports GET as a function', async () => {
      const mod = await import('@/app/api/podcast/candidates/route');
      expect(typeof mod.GET).toBe('function');
    });

    it('exports POST as a function', async () => {
      const mod = await import('@/app/api/podcast/candidates/route');
      expect(typeof mod.POST).toBe('function');
    });
  });

  describe('/api/podcast/integrations', () => {
    it('exports GET as a function', async () => {
      const mod = await import('@/app/api/podcast/integrations/route');
      expect(typeof mod.GET).toBe('function');
    });

    it('exports POST as a function', async () => {
      const mod = await import('@/app/api/podcast/integrations/route');
      expect(typeof mod.POST).toBe('function');
    });
  });

  describe('/api/podcast/stats', () => {
    it('exports GET as a function', async () => {
      const mod = await import('@/app/api/podcast/stats/route');
      expect(typeof mod.GET).toBe('function');
    });
  });

  describe('/api/podcast/runs', () => {
    it('exports GET as a function', async () => {
      const mod = await import('@/app/api/podcast/runs/route');
      expect(typeof mod.GET).toBe('function');
    });

    it('exports POST as a function', async () => {
      const mod = await import('@/app/api/podcast/runs/route');
      expect(typeof mod.POST).toBe('function');
    });
  });

  describe('/api/podcast/scout', () => {
    it('exports POST as a function', async () => {
      const mod = await import('@/app/api/podcast/scout/route');
      expect(typeof mod.POST).toBe('function');
    });
  });

  describe('/api/podcast/sequences', () => {
    it('exports GET as a function', async () => {
      const mod = await import('@/app/api/podcast/sequences/route');
      expect(typeof mod.GET).toBe('function');
    });
  });
});
