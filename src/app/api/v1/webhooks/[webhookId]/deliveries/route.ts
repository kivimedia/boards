import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getWebhookDeliveries } from '@/lib/public-api';

interface Params {
  params: { webhookId: string };
}

/**
 * GET /api/v1/webhooks/[webhookId]/deliveries
 * List delivery attempts for a specific webhook.
 * Query params: limit (default 50, max 200)
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { webhookId } = params;
  const { supabase } = auth.ctx;

  // Parse limit from query params
  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  let limit = 50;

  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (isNaN(parsed) || parsed < 1) {
      return errorResponse('limit must be a positive integer');
    }
    limit = Math.min(parsed, 200);
  }

  // Verify the webhook belongs to the user
  const { data: webhook, error: webhookError } = await supabase
    .from('webhooks')
    .select('id')
    .eq('id', webhookId)
    .eq('user_id', auth.ctx.userId)
    .single();

  if (webhookError || !webhook) {
    return errorResponse('Webhook not found', 404);
  }

  const deliveries = await getWebhookDeliveries(supabase, webhookId, limit);

  return successResponse(deliveries);
}
