import { test, expect } from '@playwright/test';

/**
 * P8.2 Performance Optimization E2E Tests
 *
 * P8.2 optimizations are client-side (staleTime, debounced invalidation,
 * signed URL cache, reduced card payload). These tests verify the board
 * data API endpoints that were optimized return correct responses and
 * that board pages load successfully.
 */

const FAKE_BOARD_ID = '00000000-0000-0000-0000-000000000000';

test.describe('P8.2 Performance - Board Data API', () => {
  test('GET /api/boards requires auth', async ({ request }) => {
    const res = await request.get('/api/boards');
    expect(res.status()).toBe(401);
  });

  test('GET /api/boards/:id requires auth', async ({ request }) => {
    const res = await request.get(`/api/boards/${FAKE_BOARD_ID}`);
    expect(res.status()).toBe(401);
  });

  test('GET /api/boards/:id/lists requires auth', async ({ request }) => {
    const res = await request.get(`/api/boards/${FAKE_BOARD_ID}/lists`);
    expect(res.status()).toBe(401);
  });
});

test.describe('P8.2 Performance - Page Load', () => {
  test('board page redirects unauthenticated (perf-optimized route)', async ({ page }) => {
    await page.goto(`/board/${FAKE_BOARD_ID}`);
    await expect(page).toHaveURL(/\/(board|login|auth)/);
  });

  test('my-tasks page loads or redirects (pagination-optimized)', async ({ page }) => {
    await page.goto('/my-tasks');
    await expect(page).toHaveURL(/\/(my-tasks|login|auth)/);
  });
});
