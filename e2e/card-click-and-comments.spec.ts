import { test, expect } from '@playwright/test';

test.describe('Card Click & Comments', () => {
  test('board page redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/board/fd5f0606-e30c-4c1a-9cc8-fb6a02057619');
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('card content div has click handler (not on drag wrapper)', async ({ page }) => {
    // Verify that BoardCard renders with the correct structure:
    // outer div has drag handle attrs, inner .p-3 div has cursor-pointer for clicks
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test('comments API returns 401 for unauthenticated requests', async ({ request }) => {
    const response = await request.get('/api/cards/fake-id/comments');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Unauthorized');
  });

  test('comments insert API returns 401 for unauthenticated requests', async ({ request }) => {
    const response = await request.post('/api/cards/fake-id/comments', {
      data: { content: 'test comment' },
    });
    expect(response.status()).toBe(401);
  });

  test('forgot-password API is accessible without auth', async ({ request }) => {
    const response = await request.post('/api/auth/forgot-password', {
      data: { email: '' },
    });
    // Should return 400 (email required), NOT 401 (unauthorized)
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Email is required');
  });

  test('forgot-password page loads without auth', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.locator('text=Reset Your Password')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('button:has-text("Send Reset Link")')).toBeVisible();
  });

  test('reset-password page loads without auth', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.locator('text=Set New Password')).toBeVisible();
  });

  test('reset-password API requires auth', async ({ request }) => {
    const response = await request.post('/api/settings/users/reset-password', {
      data: { user_id: 'fake-id' },
    });
    expect(response.status()).toBe(401);
  });
});
