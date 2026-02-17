import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { updateWebhook, deleteWebhook, WEBHOOK_EVENTS } from '@/lib/public-api';
import type { WebhookEvent } from '@/lib/types';

interface Params {
  params: { webhookId: string };
}

const VALID_EVENTS = WEBHOOK_EVENTS.map((e) => e.event);

interface UpdateWebhookBody {
  url?: string;
  events?: WebhookEvent[];
  is_active?: boolean;
  description?: string;
}

/**
 * PATCH /api/v1/webhooks/[webhookId]
 * Update a webhook's URL, events, active status, or description.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateWebhookBody>(request);
  if (!body.ok) return body.response;

  const { url, events, is_active, description } = body.body;
  const updates: Partial<{ url: string; events: WebhookEvent[]; is_active: boolean; description: string }> = {};

  if (url !== undefined) {
    if (!url.trim()) return errorResponse('URL cannot be empty');
    try {
      new URL(url);
    } catch {
      return errorResponse('Invalid URL format');
    }
    if (!url.startsWith('https://')) {
      return errorResponse('Webhook URL must use HTTPS');
    }
    updates.url = url.trim();
  }

  if (events !== undefined) {
    if (!Array.isArray(events) || events.length === 0) {
      return errorResponse('At least one event is required');
    }
    const invalidEvents = events.filter((e) => !VALID_EVENTS.includes(e));
    if (invalidEvents.length > 0) {
      return errorResponse(`Invalid events: ${invalidEvents.join(', ')}`);
    }
    updates.events = events;
  }

  if (is_active !== undefined) {
    if (typeof is_active !== 'boolean') {
      return errorResponse('is_active must be a boolean');
    }
    updates.is_active = is_active;
  }

  if (description !== undefined) {
    updates.description = description.trim();
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const { webhookId } = params;
  const { supabase } = auth.ctx;

  const webhook = await updateWebhook(supabase, webhookId, updates);

  if (!webhook) {
    return errorResponse('Webhook not found', 404);
  }

  return successResponse({
    ...webhook,
    secret: webhook.secret.substring(0, 10) + '...',
  });
}

/**
 * DELETE /api/v1/webhooks/[webhookId]
 * Delete a webhook and its delivery history.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { webhookId } = params;

  await deleteWebhook(supabase, webhookId);

  return successResponse({ deleted: true });
}
