import { successResponse } from '@/lib/api-helpers';
import { WEBHOOK_EVENTS } from '@/lib/public-api';
import type { ApiKeyPermission } from '@/lib/types';

const PERMISSION_SCOPES: { scope: ApiKeyPermission; description: string }[] = [
  { scope: 'boards:read', description: 'Read board data, lists, and board settings' },
  { scope: 'boards:write', description: 'Create, update, and delete boards and lists' },
  { scope: 'cards:read', description: 'Read card data including checklists, attachments, and custom fields' },
  { scope: 'cards:write', description: 'Create, update, move, and delete cards' },
  { scope: 'comments:read', description: 'Read comments on cards' },
  { scope: 'comments:write', description: 'Create and delete comments' },
  { scope: 'labels:read', description: 'Read label data' },
  { scope: 'labels:write', description: 'Create, update, and delete labels' },
  { scope: 'webhooks:manage', description: 'Create, update, and delete webhook subscriptions' },
  { scope: 'users:read', description: 'Read user profiles and board membership' },
];

const API_ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/v1/keys',
    description: 'List all API keys for the authenticated user',
    auth: 'Session',
  },
  {
    method: 'POST',
    path: '/api/v1/keys',
    description: 'Create a new API key (raw key returned once)',
    auth: 'Session',
    body: '{ name: string, permissions: string[], rate_limit_per_minute?: number, rate_limit_per_day?: number }',
  },
  {
    method: 'PATCH',
    path: '/api/v1/keys/:keyId',
    description: 'Update an API key name, permissions, or rate limits',
    auth: 'Session',
    body: '{ name?: string, permissions?: string[], rate_limit_per_minute?: number, rate_limit_per_day?: number }',
  },
  {
    method: 'DELETE',
    path: '/api/v1/keys/:keyId',
    description: 'Revoke and delete an API key',
    auth: 'Session',
  },
  {
    method: 'GET',
    path: '/api/v1/webhooks',
    description: 'List all webhooks for the authenticated user',
    auth: 'Session',
  },
  {
    method: 'POST',
    path: '/api/v1/webhooks',
    description: 'Create a new webhook subscription (secret returned once)',
    auth: 'Session',
    body: '{ url: string, events: string[], description?: string }',
  },
  {
    method: 'PATCH',
    path: '/api/v1/webhooks/:webhookId',
    description: 'Update a webhook URL, events, or active status',
    auth: 'Session',
    body: '{ url?: string, events?: string[], is_active?: boolean, description?: string }',
  },
  {
    method: 'DELETE',
    path: '/api/v1/webhooks/:webhookId',
    description: 'Delete a webhook and its delivery history',
    auth: 'Session',
  },
  {
    method: 'GET',
    path: '/api/v1/webhooks/:webhookId/deliveries',
    description: 'List delivery attempts for a webhook',
    auth: 'Session',
    query: '?limit=50 (max 200)',
  },
  {
    method: 'POST',
    path: '/api/v1/webhooks/test',
    description: 'Send a test delivery to verify a webhook URL',
    auth: 'Session',
    body: '{ url: string, secret?: string }',
  },
  {
    method: 'GET',
    path: '/api/v1/usage',
    description: 'Get API usage statistics for a key',
    auth: 'Session',
    query: '?key_id=uuid&days=7 (max 90)',
  },
  {
    method: 'GET',
    path: '/api/v1/docs',
    description: 'This endpoint - returns API documentation as JSON',
    auth: 'None',
  },
];

const CODE_EXAMPLES = {
  create_api_key: `// Create an API key
const response = await fetch('/api/v1/keys', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'My Integration',
    permissions: ['cards:read', 'cards:write'],
    rate_limit_per_minute: 60,
    rate_limit_per_day: 10000,
  }),
});

const { data } = await response.json();
// IMPORTANT: Store data.raw_key securely - it won't be shown again`,

  create_webhook: `// Create a webhook
const response = await fetch('/api/v1/webhooks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://your-server.com/webhook',
    events: ['card.created', 'card.updated', 'card.moved'],
    description: 'My webhook for card events',
  }),
});

const { data } = await response.json();
// Store data.webhook.secret for verifying signatures`,

  verify_webhook_signature: `// Verify incoming webhook signatures (Node.js)
import { createHmac } from 'crypto';

function verifyWebhookSignature(payload, signature, secret) {
  const expected = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return expected === signature;
}

// In your webhook handler:
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const event = req.headers['x-webhook-event'];
  const payload = JSON.stringify(req.body);

  if (!verifyWebhookSignature(payload, signature, YOUR_SECRET)) {
    return res.status(401).send('Invalid signature');
  }

  // Process the webhook event
  console.log('Received event:', event, req.body);
  res.status(200).send('OK');
});`,
};

/**
 * GET /api/v1/docs
 * Returns API documentation as JSON. No authentication required.
 */
export async function GET() {
  return successResponse({
    title: 'Kivi Media API',
    version: 'v1',
    base_url: '/api/v1',
    authentication: {
      description: 'API routes require session authentication. API keys are used for external integrations and rate limiting.',
      header: 'Authorization: Bearer <api_key>',
    },
    endpoints: API_ENDPOINTS,
    webhook_events: WEBHOOK_EVENTS,
    permission_scopes: PERMISSION_SCOPES,
    rate_limiting: {
      description: 'Rate limits are enforced per API key. Default: 60 requests/minute, 10,000 requests/day.',
      headers: {
        'X-RateLimit-Limit': 'Maximum requests per minute',
        'X-RateLimit-Remaining': 'Remaining requests in current window',
        'X-RateLimit-Reset': 'ISO timestamp when the rate limit resets',
      },
    },
    webhook_delivery: {
      description: 'Webhooks are delivered as POST requests with HMAC-SHA256 signatures.',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': 'HMAC-SHA256 hex digest of the payload',
        'X-Webhook-Event': 'The event type (e.g., card.created)',
        'X-Webhook-Id': 'The webhook subscription ID',
      },
      retry_policy: 'Webhooks are disabled after 10 consecutive delivery failures.',
      timeout: '10 seconds',
    },
    code_examples: CODE_EXAMPLES,
  });
}
