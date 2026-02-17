import { test, expect } from '@playwright/test';

test.describe('Backup & Disaster Recovery (P1.8)', () => {
  test('backups API route exists', async ({ request }) => {
    const res = await request.get('/api/backups');
    expect([200, 401]).toContain(res.status());
  });

  test('backup settings page loads (or redirects to auth)', async ({ page }) => {
    await page.goto('/settings/backups');
    await expect(page).toHaveURL(/\/(settings|login|auth)/);
  });
});
