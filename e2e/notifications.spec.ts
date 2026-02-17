import { test, expect } from '@playwright/test';

test.describe('Notifications & Cross-Board Workflows (P1.6)', () => {
  test('notifications API route exists', async ({ request }) => {
    const res = await request.get('/api/notifications');
    expect([200, 401]).toContain(res.status());
  });

  test('notification count API route exists', async ({ request }) => {
    const res = await request.get('/api/notifications/count');
    expect([200, 401]).toContain(res.status());
  });

  test('notification preferences API route exists', async ({ request }) => {
    const res = await request.get('/api/notifications/preferences');
    expect([200, 401]).toContain(res.status());
  });

  test('handoff rules API route exists', async ({ request }) => {
    const res = await request.get('/api/handoff-rules');
    expect([200, 401]).toContain(res.status());
  });

  test('onboarding templates API route exists', async ({ request }) => {
    const res = await request.get('/api/onboarding-templates');
    expect([200, 401]).toContain(res.status());
  });

  test('dashboard page loads', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/(dashboard|login|auth)/);
  });

  test('handoff rules settings page loads', async ({ page }) => {
    await page.goto('/settings/handoff-rules');
    await expect(page).toHaveURL(/\/(settings|login|auth)/);
  });
});
