import { describe, it, expect } from 'vitest';

describe('Performance API Routes', () => {
  describe('/api/performance/dashboard', () => {
    it('exports GET as a function', async () => {
      const mod = await import('@/app/api/performance/dashboard/route');
      expect(typeof mod.GET).toBe('function');
    });

    it('does not export POST', async () => {
      const mod = await import('@/app/api/performance/dashboard/route');
      expect((mod as any).POST).toBeUndefined();
    });
  });

  describe('/api/performance/sync', () => {
    it('exports both GET and POST', async () => {
      const mod = await import('@/app/api/performance/sync/route');
      expect(typeof mod.GET).toBe('function');
      expect(typeof mod.POST).toBe('function');
    });
  });

  describe('/api/performance/tracker', () => {
    it('exports GET as a function', async () => {
      const mod = await import('@/app/api/performance/tracker/route');
      expect(typeof mod.GET).toBe('function');
    });

    it('does not export POST', async () => {
      const mod = await import('@/app/api/performance/tracker/route');
      expect((mod as any).POST).toBeUndefined();
    });
  });

  describe('/api/cron/performance-sync', () => {
    it('exports GET as a function', async () => {
      const mod = await import('@/app/api/cron/performance-sync/route');
      expect(typeof mod.GET).toBe('function');
    });

    it('exports maxDuration as 300', async () => {
      const mod = await import('@/app/api/cron/performance-sync/route');
      expect(mod.maxDuration).toBe(300);
    });
  });
});
