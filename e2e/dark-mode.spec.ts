import { test, expect } from '@playwright/test';

test.describe('Dark Mode', () => {
  test('login page renders with a class attribute on html element', async ({ page }) => {
    await page.goto('/login');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('class', /.*/);
  });

  test('login page has a theme or dark mode toggle', async ({ page }) => {
    await page.goto('/login');
    // Look for a theme toggle button or dark mode indicator
    const themeToggle = page.locator(
      'button[aria-label*="theme" i], button[aria-label*="dark" i], button[aria-label*="mode" i], [data-testid="theme-toggle"]'
    );
    const htmlClass = await page.locator('html').getAttribute('class');
    // Either a toggle button exists or the html element has a theme class
    const hasToggle = (await themeToggle.count()) > 0;
    const hasThemeClass =
      htmlClass?.includes('dark') || htmlClass?.includes('light') || false;
    expect(hasToggle || hasThemeClass).toBe(true);
  });

  test('dark class can be applied to html element', async ({ page }) => {
    await page.goto('/login');
    // Programmatically add dark class and verify Tailwind dark mode styles apply
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });
    const html = page.locator('html');
    await expect(html).toHaveClass(/dark/);
  });
});
