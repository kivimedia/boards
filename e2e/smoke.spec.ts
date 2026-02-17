import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=Sign in to your workspace')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('signup page loads', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.locator('text=Create your account')).toBeVisible();
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('login page has link to signup', async ({ page }) => {
    await page.goto('/login');
    const signupLink = page.locator('a[href="/signup"]');
    await expect(signupLink).toBeVisible();
  });
});
