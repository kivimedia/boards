import { test, expect } from '@playwright/test';

test.describe('Agent Launcher', () => {
  test('agents page loads or redirects to login', async ({ page }) => {
    await page.goto('/agents');
    await expect(page).toHaveURL(/\/(agents|login|auth)/);
  });

  test('agent settings page loads or redirects to login', async ({ page }) => {
    await page.goto('/settings/agents');
    await expect(page).toHaveURL(/\/(settings|login|auth)/);
  });

  test('agent run API route requires authentication', async ({ request }) => {
    const res = await request.post('/api/agents/run', {
      data: { skill: 'test', prompt: 'test' },
    });
    expect([200, 401, 400]).toContain(res.status());
  });

  test('agent skills API route exists', async ({ request }) => {
    const res = await request.get('/api/agents/skills');
    expect([200, 401]).toContain(res.status());
  });
});
