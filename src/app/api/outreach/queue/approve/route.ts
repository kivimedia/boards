import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { approveBatch } from '@/lib/outreach/batch-scheduler';
import { notifyBatchApproved } from '@/lib/outreach/slack-notify';

/**
 * POST /api/outreach/queue/approve - Approve a daily batch
 *
 * Body: {
 *   batch_id: string;
 *   lead_ids?: string[];   // Optional: approve only specific leads (partial approval)
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: { batch_id: string; lead_ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.batch_id) {
    return errorResponse('batch_id is required', 400);
  }

  try {
    const result = await approveBatch(supabase, body.batch_id, userId, body.lead_ids);
    // Fire-and-forget Slack notification
    notifyBatchApproved(supabase, userId, result).catch(() => {});
    return successResponse(result);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to approve batch', 500);
  }
}
