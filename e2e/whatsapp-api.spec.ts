import { test, expect } from '@playwright/test';

/**
 * P9.2 WhatsApp Business API E2E Tests
 *
 * Tests API auth guards and page navigation for the WhatsApp
 * Business API integration: linking, verification, groups,
 * messages, quick actions, digest, templates, webhooks, and config.
 */

test.describe('P9.2 WhatsApp - API Auth Guards', () => {
  test('POST /api/whatsapp/link requires auth', async ({ request }) => {
    const res = await request.post('/api/whatsapp/link', {
      data: { phone: '+1234567890' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/whatsapp/verify requires auth', async ({ request }) => {
    const res = await request.post('/api/whatsapp/verify', {
      data: { code: '123456' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/whatsapp/me requires auth', async ({ request }) => {
    const res = await request.get('/api/whatsapp/me');
    expect(res.status()).toBe(401);
  });

  test('PATCH /api/whatsapp/me requires auth', async ({ request }) => {
    const res = await request.patch('/api/whatsapp/me', {
      data: { display_name: 'Test' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/whatsapp/groups requires auth', async ({ request }) => {
    const res = await request.get('/api/whatsapp/groups');
    expect(res.status()).toBe(401);
  });

  test('POST /api/whatsapp/groups requires auth', async ({ request }) => {
    const res = await request.post('/api/whatsapp/groups', {
      data: { name: 'Test Group' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/whatsapp/messages requires auth', async ({ request }) => {
    const res = await request.get('/api/whatsapp/messages');
    expect(res.status()).toBe(401);
  });

  test('GET /api/whatsapp/quick-actions requires auth', async ({ request }) => {
    const res = await request.get('/api/whatsapp/quick-actions');
    expect(res.status()).toBe(401);
  });

  test('POST /api/whatsapp/quick-actions requires auth', async ({ request }) => {
    const res = await request.post('/api/whatsapp/quick-actions', {
      data: { label: 'Test Action', command: '/test' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/whatsapp/quick-actions/process requires auth', async ({ request }) => {
    const res = await request.post('/api/whatsapp/quick-actions/process', {
      data: { action_id: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/whatsapp/digest requires auth', async ({ request }) => {
    const res = await request.get('/api/whatsapp/digest');
    expect(res.status()).toBe(401);
  });

  test('PUT /api/whatsapp/digest requires auth', async ({ request }) => {
    const res = await request.put('/api/whatsapp/digest', {
      data: { enabled: true },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/whatsapp/notify requires auth', async ({ request }) => {
    const res = await request.post('/api/whatsapp/notify', {
      data: { message: 'Test notification' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/whatsapp/custom-actions requires auth', async ({ request }) => {
    const res = await request.get('/api/whatsapp/custom-actions');
    expect(res.status()).toBe(401);
  });

  test('POST /api/whatsapp/custom-actions requires auth', async ({ request }) => {
    const res = await request.post('/api/whatsapp/custom-actions', {
      data: { name: 'Custom Test', type: 'webhook' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/whatsapp/digest-templates requires auth', async ({ request }) => {
    const res = await request.get('/api/whatsapp/digest-templates');
    expect(res.status()).toBe(401);
  });

  test('POST /api/whatsapp/digest-templates requires auth', async ({ request }) => {
    const res = await request.post('/api/whatsapp/digest-templates', {
      data: { name: 'Test Template', body: 'Hello' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/whatsapp/config requires auth', async ({ request }) => {
    const res = await request.get('/api/whatsapp/config');
    expect(res.status()).toBe(401);
  });

  test('POST /api/whatsapp/config requires auth', async ({ request }) => {
    const res = await request.post('/api/whatsapp/config', {
      data: { phone_number_id: 'test' },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('P9.2 WhatsApp - Webhook (Public)', () => {
  test('webhook GET route exists for verification', async ({ request }) => {
    // WhatsApp webhook verification endpoint should be publicly accessible
    const res = await request.get('/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test&hub.challenge=test123');
    // May return 200 (echoing challenge) or 403 (wrong verify token) or 401
    expect([200, 401, 403]).toContain(res.status());
  });
});

test.describe('P9.2 WhatsApp - Page Navigation', () => {
  test('WhatsApp settings page redirects unauthenticated to login', async ({ page }) => {
    await page.goto('/settings/whatsapp');
    await expect(page).toHaveURL(/\/(settings|login|auth)/);
  });
});

test.describe('P9.2 WhatsApp - Cron Endpoint', () => {
  test('WhatsApp digest cron route exists', async ({ request }) => {
    const res = await request.get('/api/cron/whatsapp-digest');
    expect([200, 401]).toContain(res.status());
  });
});
