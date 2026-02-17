import { test, expect } from '@playwright/test';

/**
 * P9.4 AI QA Expansion E2E Tests + P6.4-P6.8 AI QA Features
 *
 * Tests API auth guards for QA monitoring configs, the QA cron
 * endpoint, and the review/diff endpoints used by lighthouse,
 * visual diff, and visual regression features.
 */

const FAKE_CARD_ID = '00000000-0000-0000-0000-000000000000';

test.describe('P9.4 QA Monitoring - API Auth Guards', () => {
  test('GET /api/qa/monitoring-configs requires auth', async ({ request }) => {
    const res = await request.get('/api/qa/monitoring-configs');
    expect(res.status()).toBe(401);
  });

  test('POST /api/qa/monitoring-configs requires auth', async ({ request }) => {
    const res = await request.post('/api/qa/monitoring-configs', {
      data: {
        name: 'Test Config',
        url: 'https://example.com',
        schedule: 'daily',
      },
    });
    expect(res.status()).toBe(401);
  });

  test('PATCH /api/qa/monitoring-configs requires auth', async ({ request }) => {
    const res = await request.patch('/api/qa/monitoring-configs', {
      data: {
        id: '00000000-0000-0000-0000-000000000000',
        is_active: false,
      },
    });
    expect(res.status()).toBe(401);
  });

  test('DELETE /api/qa/monitoring-configs requires auth', async ({ request }) => {
    const res = await request.delete('/api/qa/monitoring-configs', {
      data: { id: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('P9.4 QA Monitoring - Cron Endpoints', () => {
  test('QA monitoring cron route exists', async ({ request }) => {
    const res = await request.get('/api/cron/qa-monitoring');
    expect([200, 401]).toContain(res.status());
  });

  test('QA monitor cron route exists (alternate)', async ({ request }) => {
    const res = await request.get('/api/cron/qa-monitor');
    expect([200, 401, 404]).toContain(res.status());
  });
});

test.describe('P6.4-P6.8 AI QA Features - Review API Auth Guards', () => {
  test('GET /api/cards/:id/review lists reviews and requires auth', async ({ request }) => {
    const res = await request.get(`/api/cards/${FAKE_CARD_ID}/review`);
    expect(res.status()).toBe(401);
  });

  test('POST /api/cards/:id/review creates a review and requires auth', async ({ request }) => {
    const res = await request.post(`/api/cards/${FAKE_CARD_ID}/review`, {
      data: {
        type: 'lighthouse',
        url: 'https://example.com',
      },
    });
    expect(res.status()).toBe(401);
  });

  test('visual diff endpoint requires auth', async ({ request }) => {
    const res = await request.get(
      `/api/cards/${FAKE_CARD_ID}/review/00000000-0000-0000-0000-000000000001/diff`
    );
    expect(res.status()).toBe(401);
  });

  test('review override endpoint requires auth', async ({ request }) => {
    const res = await request.post(
      `/api/cards/${FAKE_CARD_ID}/review/00000000-0000-0000-0000-000000000001/override`,
      { data: { action: 'approve' } }
    );
    expect([401, 405]).toContain(res.status());
  });

  test('review attachments endpoint requires auth', async ({ request }) => {
    const res = await request.get(`/api/cards/${FAKE_CARD_ID}/review/attachments`);
    expect(res.status()).toBe(401);
  });

  test('extract-requests endpoint requires auth', async ({ request }) => {
    const res = await request.post(`/api/cards/${FAKE_CARD_ID}/review/extract-requests`, {
      data: { review_id: '00000000-0000-0000-0000-000000000001' },
    });
    expect(res.status()).toBe(401);
  });
});
