import { test, expect } from '@playwright/test';

/**
 * P6.1 Browser Push Notifications E2E Tests
 *
 * Tests API auth guards for push notification subscription,
 * unsubscription, and sending endpoints, plus the notification
 * preferences and count APIs.
 */

test.describe('P6.1 Push Notifications - API Auth Guards', () => {
  test('POST /api/push/subscribe requires auth', async ({ request }) => {
    const res = await request.post('/api/push/subscribe', {
      data: {
        endpoint: 'https://fcm.googleapis.com/test',
        keys: { p256dh: 'test', auth: 'test' },
      },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/push/unsubscribe requires auth', async ({ request }) => {
    const res = await request.post('/api/push/unsubscribe', {
      data: { endpoint: 'https://fcm.googleapis.com/test' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/push/send requires auth', async ({ request }) => {
    const res = await request.post('/api/push/send', {
      data: {
        user_id: '00000000-0000-0000-0000-000000000000',
        title: 'Test',
        body: 'Test notification',
      },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('P6.1 Notifications - API Auth Guards', () => {
  test('GET /api/notifications requires auth', async ({ request }) => {
    const res = await request.get('/api/notifications');
    expect(res.status()).toBe(401);
  });

  test('POST /api/notifications requires auth', async ({ request }) => {
    const res = await request.post('/api/notifications', {
      data: { type: 'mention', message: 'Test' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/notifications/read-all requires auth', async ({ request }) => {
    const res = await request.post('/api/notifications/read-all');
    expect(res.status()).toBe(401);
  });

  test('GET /api/notifications/count requires auth', async ({ request }) => {
    const res = await request.get('/api/notifications/count');
    expect(res.status()).toBe(401);
  });

  test('GET /api/notifications/preferences requires auth', async ({ request }) => {
    const res = await request.get('/api/notifications/preferences');
    expect(res.status()).toBe(401);
  });

  test('PUT /api/notifications/preferences requires auth', async ({ request }) => {
    const res = await request.put('/api/notifications/preferences', {
      data: { email_enabled: true, push_enabled: true },
    });
    expect(res.status()).toBe(401);
  });

  test('PATCH /api/notifications/:id requires auth', async ({ request }) => {
    const res = await request.patch('/api/notifications/00000000-0000-0000-0000-000000000000', {
      data: { read: true },
    });
    expect(res.status()).toBe(401);
  });

  test('DELETE /api/notifications/:id requires auth', async ({ request }) => {
    const res = await request.delete('/api/notifications/00000000-0000-0000-0000-000000000000');
    expect(res.status()).toBe(401);
  });
});
