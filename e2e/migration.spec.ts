import { test, expect } from '@playwright/test';

test.describe('Trello Migration (P1.7)', () => {
  test('migration settings page loads (or redirects to auth)', async ({ page }) => {
    await page.goto('/settings/migration');
    await expect(page).toHaveURL(/\/(settings|login|auth)/);
  });

  test('migration jobs API route exists', async ({ request }) => {
    const res = await request.get('/api/migration/jobs');
    expect([200, 401]).toContain(res.status());
  });

  test('Trello boards fetch API route exists', async ({ request }) => {
    const res = await request.get('/api/migration/trello/boards');
    expect([200, 400, 401]).toContain(res.status());
  });
});
