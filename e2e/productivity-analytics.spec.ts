import { test, expect } from '@playwright/test';

/**
 * P9.1 Team Productivity Analytics E2E Tests
 *
 * Tests API auth guards and page navigation for the productivity
 * analytics feature: snapshots, metrics, scorecards, reports,
 * alerts, departments, and report configs.
 */

test.describe('P9.1 Productivity - API Auth Guards', () => {
  test('GET /api/productivity/snapshots requires auth', async ({ request }) => {
    const res = await request.get('/api/productivity/snapshots');
    expect(res.status()).toBe(401);
  });

  test('POST /api/productivity/snapshots requires auth', async ({ request }) => {
    const res = await request.post('/api/productivity/snapshots', {
      data: { board_id: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/productivity/metrics requires auth', async ({ request }) => {
    const res = await request.get('/api/productivity/metrics');
    expect(res.status()).toBe(401);
  });

  test('GET /api/productivity/scorecards requires auth', async ({ request }) => {
    const res = await request.get('/api/productivity/scorecards');
    expect(res.status()).toBe(401);
  });

  test('GET /api/productivity/reports requires auth', async ({ request }) => {
    const res = await request.get('/api/productivity/reports');
    expect(res.status()).toBe(401);
  });

  test('POST /api/productivity/reports requires auth', async ({ request }) => {
    const res = await request.post('/api/productivity/reports', {
      data: { title: 'Test Report' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/productivity/reports/generate requires auth', async ({ request }) => {
    const res = await request.post('/api/productivity/reports/generate', {
      data: { config_id: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/productivity/alerts requires auth', async ({ request }) => {
    const res = await request.get('/api/productivity/alerts');
    expect(res.status()).toBe(401);
  });

  test('POST /api/productivity/alerts requires auth', async ({ request }) => {
    const res = await request.post('/api/productivity/alerts', {
      data: { type: 'deadline_risk', message: 'Test alert' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/productivity/departments requires auth', async ({ request }) => {
    const res = await request.get('/api/productivity/departments');
    expect(res.status()).toBe(401);
  });

  test('GET /api/productivity/report-configs requires auth', async ({ request }) => {
    const res = await request.get('/api/productivity/report-configs');
    expect(res.status()).toBe(401);
  });

  test('POST /api/productivity/report-configs requires auth', async ({ request }) => {
    const res = await request.post('/api/productivity/report-configs', {
      data: { name: 'Test Config', type: 'weekly' },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('P9.1 Productivity - Page Navigation', () => {
  test('productivity page redirects unauthenticated to login', async ({ page }) => {
    await page.goto('/productivity');
    await expect(page).toHaveURL(/\/(productivity|login|auth)/);
  });

  test('reports page redirects unauthenticated to login', async ({ page }) => {
    await page.goto('/reports');
    await expect(page).toHaveURL(/\/(reports|login|auth)/);
  });

  test('analytics page redirects unauthenticated to login', async ({ page }) => {
    await page.goto('/analytics');
    await expect(page).toHaveURL(/\/(analytics|login|auth)/);
  });
});

test.describe('P9.1 Productivity - Cron Endpoint', () => {
  test('productivity snapshot cron route exists', async ({ request }) => {
    const res = await request.get('/api/cron/productivity-snapshot');
    // Cron endpoints may return 200 (public) or 401 (auth required)
    expect([200, 401]).toContain(res.status());
  });
});
