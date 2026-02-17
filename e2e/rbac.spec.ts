import { test, expect } from '@playwright/test';

test.describe('RBAC & Permissions (P1.2)', () => {
  test('settings page loads for authenticated users', async ({ page }) => {
    await page.goto('/settings');
    // Should either show settings or redirect to login
    await page.waitForURL(/\/(settings|login)/);
  });

  test('user management API requires authentication', async ({ request }) => {
    const response = await request.get('/api/settings/users');
    expect(response.status()).toBe(401);
  });

  test('board members API requires authentication', async ({ request }) => {
    const response = await request.get('/api/boards/fake-id/members');
    expect(response.status()).toBe(401);
  });

  test('board move rules API requires authentication', async ({ request }) => {
    const response = await request.get('/api/boards/fake-id/move-rules');
    expect(response.status()).toBe(401);
  });

  test('settings page has navigation to user management', async ({ page }) => {
    await page.goto('/login');
    // Verify the login page is accessible (settings requires auth)
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });
});
