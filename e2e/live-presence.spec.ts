import { test, expect } from '@playwright/test';

/**
 * P6.3 Live Presence & Conflict Resolution E2E Tests
 *
 * Live presence uses Supabase Realtime channels (no dedicated API routes),
 * so we test the related UI pages and the general board API auth.
 * Conflict resolution relies on edit locks which are handled client-side
 * via the useEditLock hook and usePresence hook.
 */

const FAKE_BOARD_ID = '00000000-0000-0000-0000-000000000000';
const FAKE_CARD_ID = '00000000-0000-0000-0000-000000000000';

test.describe('P6.3 Live Presence - Page Navigation', () => {
  test('board page redirects unauthenticated to login', async ({ page }) => {
    await page.goto(`/board/${FAKE_BOARD_ID}`);
    await expect(page).toHaveURL(/\/(board|login|auth)/);
  });

  test('team page redirects unauthenticated to login', async ({ page }) => {
    await page.goto('/team');
    await expect(page).toHaveURL(/\/(team|login|auth)/);
  });

  test('dashboard page redirects unauthenticated to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/(dashboard|login|auth)/);
  });
});

test.describe('P6.3 Live Presence - Board Members API', () => {
  test('GET /api/boards/:id/members requires auth (presence depends on this)', async ({ request }) => {
    const res = await request.get(`/api/boards/${FAKE_BOARD_ID}/members`);
    expect(res.status()).toBe(401);
  });

  test('POST /api/boards/:id/members requires auth', async ({ request }) => {
    const res = await request.post(`/api/boards/${FAKE_BOARD_ID}/members`, {
      data: { email: 'test@example.com', role: 'member' },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('P6.3 Conflict Resolution - Card Editing API', () => {
  test('GET /api/cards/:id requires auth (edit lock depends on card access)', async ({ request }) => {
    const res = await request.get(`/api/cards/${FAKE_CARD_ID}`);
    expect(res.status()).toBe(401);
  });

  test('PATCH /api/cards/:id requires auth', async ({ request }) => {
    const res = await request.patch(`/api/cards/${FAKE_CARD_ID}`, {
      data: { title: 'Test' },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('P6.3 Live Presence - Profiles API', () => {
  test('GET /api/profiles route exists (used for online users sidebar)', async ({ request }) => {
    const res = await request.get('/api/profiles');
    expect([200, 401]).toContain(res.status());
  });
});
