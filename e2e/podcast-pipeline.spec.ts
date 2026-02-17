import { test, expect } from '@playwright/test';

test.describe('Podcast Pipeline', () => {
  test('approval page loads or redirects to login', async ({ page }) => {
    await page.goto('/podcast/approval');
    await expect(page).toHaveURL(/\/(podcast\/approval|login|auth)/);
  });

  test('outreach page loads or redirects to login', async ({ page }) => {
    await page.goto('/podcast/outreach');
    await expect(page).toHaveURL(/\/(podcast\/outreach|login|auth)/);
  });

  test('podcast settings page loads or redirects to login', async ({ page }) => {
    await page.goto('/settings/podcast');
    await expect(page).toHaveURL(/\/(settings|login|auth)/);
  });

  test('candidates API route exists', async ({ request }) => {
    const res = await request.get('/api/podcast/candidates');
    expect([200, 401]).toContain(res.status());
  });

  test('outreach API route exists', async ({ request }) => {
    const res = await request.get('/api/podcast/outreach');
    expect([200, 401]).toContain(res.status());
  });

  test('integration configs API route exists', async ({ request }) => {
    const res = await request.get('/api/podcast/integrations');
    expect([200, 401]).toContain(res.status());
  });
});
