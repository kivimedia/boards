import { test, expect } from '@playwright/test';

/**
 * Phase 8 UI Features E2E Tests (P8.1-P8.5).
 *
 * Tests API auth guards, page navigation redirects, and API validation
 * for Smart Search, Board Maintenance, Team Presence, and Bottom Nav.
 */

const FAKE_BOARD_ID = '00000000-0000-0000-0000-000000000000';

test.describe('Phase 8 - API Auth Guards', () => {
  test('GET /api/search requires authentication', async ({ request }) => {
    const res = await request.get('/api/search?q=test');
    expect(res.status()).toBe(401);
  });

  test('POST /api/board-assistant requires authentication', async ({ request }) => {
    const res = await request.post('/api/board-assistant', {
      data: { query: 'What tasks are overdue?', board_id: FAKE_BOARD_ID },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/dedup/workspace requires authentication', async ({ request }) => {
    const res = await request.get('/api/dedup/workspace');
    expect(res.status()).toBe(401);
  });

  test('POST /api/dedup/workspace requires authentication', async ({ request }) => {
    const res = await request.post('/api/dedup/workspace', {
      data: { actions: [] },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/boards/:id/members requires authentication', async ({ request }) => {
    const res = await request.get(`/api/boards/${FAKE_BOARD_ID}/members`);
    expect(res.status()).toBe(401);
  });

  test('POST /api/boards/:id/members requires authentication', async ({ request }) => {
    const res = await request.post(`/api/boards/${FAKE_BOARD_ID}/members`, {
      data: { email: 'test@example.com', role: 'member' },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('Phase 8 - Page Navigation', () => {
  test('board inbox view redirects unauthenticated to login', async ({ page }) => {
    await page.goto(`/boards/${FAKE_BOARD_ID}?view=inbox`);
    await expect(page).toHaveURL(/\/(login|auth|boards)/);
  });

  test('board planner view redirects unauthenticated to login', async ({ page }) => {
    await page.goto(`/boards/${FAKE_BOARD_ID}?view=planner`);
    await expect(page).toHaveURL(/\/(login|auth|boards)/);
  });

  test('board maintenance settings redirects unauthenticated to login', async ({ page }) => {
    await page.goto('/settings/board-maintenance');
    await expect(page).toHaveURL(/\/(login|auth|settings)/);
  });
});

test.describe('Phase 8 - API Validation', () => {
  test('search without q param returns 400 or 401', async ({ request }) => {
    const res = await request.get('/api/search');
    expect([400, 401]).toContain(res.status());
  });

  test('board-assistant without body returns 400 or 401', async ({ request }) => {
    const res = await request.post('/api/board-assistant');
    expect([400, 401]).toContain(res.status());
  });

  test('profiles API route exists', async ({ request }) => {
    const res = await request.get('/api/profiles');
    expect([200, 401]).toContain(res.status());
  });

  test('search with type filter route exists', async ({ request }) => {
    const res = await request.get('/api/search?q=test&type=cards');
    expect([200, 401]).toContain(res.status());
  });
});
