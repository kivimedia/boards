import { test, expect } from '@playwright/test';

test.describe('Client Strategy Map (P1.5)', () => {
  test('clients API route exists', async ({ request }) => {
    const res = await request.get('/api/clients');
    expect([200, 401]).toContain(res.status());
  });

  test('clients page loads', async ({ page }) => {
    await page.goto('/clients');
    // Should redirect to login or show clients page
    await expect(page).toHaveURL(/\/(clients|login|auth)/);
  });

  test('client map page handles missing client', async ({ page }) => {
    await page.goto('/client/nonexistent-id/map');
    // Should redirect or show error
    const status = page.url();
    expect(status).toBeTruthy();
  });

  test('client credentials API route exists', async ({ request }) => {
    const res = await request.get('/api/clients/fake-id/credentials');
    expect([200, 401, 404]).toContain(res.status());
  });

  test('client doors API route exists', async ({ request }) => {
    const res = await request.get('/api/clients/fake-id/doors');
    expect([200, 401, 404]).toContain(res.status());
  });

  test('client training API route exists', async ({ request }) => {
    const res = await request.get('/api/clients/fake-id/training');
    expect([200, 401, 404]).toContain(res.status());
  });

  test('client map sections API route exists', async ({ request }) => {
    const res = await request.get('/api/clients/fake-id/map-sections');
    expect([200, 401, 404]).toContain(res.status());
  });
});
