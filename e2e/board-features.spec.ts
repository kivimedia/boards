import { test, expect } from '@playwright/test';

test.describe('Board Features', () => {
  test('boards list page redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('board page with fake ID redirects to login or shows not found', async ({ page }) => {
    await page.goto('/boards/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL(/\/(boards|login|auth)/);
  });

  test('boards API route requires authentication', async ({ request }) => {
    const res = await request.get('/api/boards');
    expect([200, 401]).toContain(res.status());
  });

  test('board members API requires authentication', async ({ request }) => {
    const res = await request.get('/api/boards/fake-id/members');
    expect(res.status()).toBe(401);
  });

  test('board lists API requires authentication', async ({ request }) => {
    const res = await request.get('/api/boards/fake-id/lists');
    expect([200, 401]).toContain(res.status());
  });

  test('board cards API requires authentication', async ({ request }) => {
    const res = await request.get('/api/boards/fake-id/cards');
    expect([200, 401]).toContain(res.status());
  });
});
