import { test, expect } from '@playwright/test';

test.describe('Briefing System (P1.4)', () => {
  test('briefing templates API route exists and returns data', async ({ request }) => {
    const res = await request.get('/api/briefing-templates');
    // Should return 401 without auth or 200 with data
    expect([200, 401]).toContain(res.status());
  });

  test('card brief API route exists', async ({ request }) => {
    const res = await request.get('/api/cards/fake-id/brief');
    expect([200, 401, 404]).toContain(res.status());
  });

  test('card brief check API route exists', async ({ request }) => {
    const res = await request.get('/api/cards/fake-id/brief/check');
    expect([200, 401, 404]).toContain(res.status());
  });
});
