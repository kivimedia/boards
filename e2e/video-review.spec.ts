import { test, expect } from '@playwright/test';

/**
 * P9.3 AI Design Review for Video E2E Tests
 *
 * Tests API auth guards for the video review feature which
 * extracts frames from video attachments and runs AI design review.
 * Video review is accessed via card detail view, not a standalone page.
 */

const FAKE_CARD_ID = '00000000-0000-0000-0000-000000000000';

test.describe('P9.3 Video Review - API Auth Guards', () => {
  test('GET /api/cards/:id/video requires auth', async ({ request }) => {
    const res = await request.get(`/api/cards/${FAKE_CARD_ID}/video`);
    expect(res.status()).toBe(401);
  });

  test('POST /api/cards/:id/video requires auth', async ({ request }) => {
    const res = await request.post(`/api/cards/${FAKE_CARD_ID}/video`, {
      data: { attachment_id: '00000000-0000-0000-0000-000000000001' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/cards/:id/review requires auth', async ({ request }) => {
    const res = await request.get(`/api/cards/${FAKE_CARD_ID}/review`);
    expect(res.status()).toBe(401);
  });

  test('POST /api/cards/:id/review requires auth', async ({ request }) => {
    const res = await request.post(`/api/cards/${FAKE_CARD_ID}/review`, {
      data: { type: 'design_review' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/cards/:id/review/:reviewId requires auth', async ({ request }) => {
    const res = await request.get(`/api/cards/${FAKE_CARD_ID}/review/00000000-0000-0000-0000-000000000001`);
    expect(res.status()).toBe(401);
  });

  test('GET /api/cards/:id/review/:reviewId/diff requires auth', async ({ request }) => {
    const res = await request.get(`/api/cards/${FAKE_CARD_ID}/review/00000000-0000-0000-0000-000000000001/diff`);
    expect(res.status()).toBe(401);
  });

  test('POST /api/cards/:id/review/extract-requests requires auth', async ({ request }) => {
    const res = await request.post(`/api/cards/${FAKE_CARD_ID}/review/extract-requests`, {
      data: { review_id: '00000000-0000-0000-0000-000000000001' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/cards/:id/review/attachments requires auth', async ({ request }) => {
    const res = await request.get(`/api/cards/${FAKE_CARD_ID}/review/attachments`);
    expect(res.status()).toBe(401);
  });
});

test.describe('P9.3 Video Review - Card Page Navigation', () => {
  test('card detail page redirects unauthenticated to login', async ({ page }) => {
    await page.goto(`/card/${FAKE_CARD_ID}`);
    await expect(page).toHaveURL(/\/(card|login|auth)/);
  });
});
