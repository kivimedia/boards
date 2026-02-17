import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { createWebhook, getWebhooks, WEBHOOK_EVENTS } from '@/lib/public-api';
import type { WebhookEvent } from '@/lib/types';

const VALID_EVENTS = WEBHOOK_EVENTS.map((e) => e.event);

/**
 * GET /api/v1/webhooks
 * List all webhooks for the authenticated user.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const webhooks = await getWebhooks(supabase, userId);

  // Mask secrets in the list response
  const masked = webhooks.map((w) => ({
    ...w,
    secret: w.secret.substring(0, 10) + '...',
  }));

  return successResponse(masked);
}

interface CreateWebhookBody {
  url: string;
  events: WebhookEvent[];
  description?: string;
}

/**
 * POST /api/v1/webhooks
 * Create a new webhook. The secret is returned once on creation.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateWebhookBody>(request);
  if (!body.ok) return body.response;

  const { url, events, description } = body.body;

  if (!url?.trim()) {
    return errorResponse('URL is required');
  }

  try {
    new URL(url);
  } catch {
    return errorResponse('Invalid URL format');
  }

  if (!url.startsWith('https://')) {
    return errorResponse('Webhook URL must use HTTPS');
  }

  if (!Array.isArray(events) || events.length === 0) {
    return errorResponse('At least one event is required');
  }

  const invalidEvents = events.filter((e) => !VALID_EVENTS.includes(e));
  if (invalidEvents.length > 0) {
    return errorResponse(`Invalid events: ${invalidEvents.join(', ')}. Valid: ${VALID_EVENTS.join(', ')}`);
  }

  const { supabase, userId } = auth.ctx;
  const webhook = await createWebhook(supabase, {
    userId,
    url: url.trim(),
    events,
    description: description?.trim(),
  });

  if (!webhook) {
    return errorResponse('Failed to create webhook', 500);
  }

  return successResponse({
    webhook,
    warning: 'Store the secret securely. It will not be shown again in full.',
  }, 201);
}
