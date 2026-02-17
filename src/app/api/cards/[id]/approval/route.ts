import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import type { ApprovalStatus } from '@/lib/types';

interface Params {
  params: { id: string };
}

const VALID_STATUSES: ApprovalStatus[] = ['pending', 'approved', 'rejected', 'revision_requested'];

interface ApprovalBody {
  status: ApprovalStatus;
  comment?: string;
}

/**
 * GET /api/cards/[id]/approval
 * Get approval history for a card.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('approval_history')
    .select('*, changed_by_profile:profiles!approval_history_changed_by_fkey(id, full_name, avatar_url, email)')
    .eq('card_id', params.id)
    .order('created_at', { ascending: false });

  if (error) {
    // If the join fails (no FK), try without profile join
    const { data: fallback } = await supabase
      .from('approval_history')
      .select('*')
      .eq('card_id', params.id)
      .order('created_at', { ascending: false });

    return successResponse(fallback ?? []);
  }

  return successResponse(data ?? []);
}

/**
 * POST /api/cards/[id]/approval
 * Update approval status and log to history.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<ApprovalBody>(request);
  if (!body.ok) return body.response;

  const { status, comment } = body.body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return errorResponse(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  const { supabase, userId } = auth.ctx;

  // Get current card approval status
  const { data: card, error: cardError } = await supabase
    .from('cards')
    .select('id, approval_status')
    .eq('id', params.id)
    .single();

  if (cardError || !card) {
    return errorResponse('Card not found', 404);
  }

  const fromStatus = card.approval_status || null;

  // Update card approval_status
  const { error: updateError } = await supabase
    .from('cards')
    .update({ approval_status: status, updated_at: new Date().toISOString() })
    .eq('id', params.id);

  if (updateError) {
    return errorResponse(`Failed to update approval status: ${updateError.message}`, 500);
  }

  // Log to approval_history
  const { error: historyError } = await supabase
    .from('approval_history')
    .insert({
      card_id: params.id,
      from_status: fromStatus,
      to_status: status,
      changed_by: userId,
      comment: comment?.trim() || null,
    });

  if (historyError) {
    console.error('[Approval] Failed to log history:', historyError.message);
    // Non-fatal — the status was already updated
  }

  // Log activity
  try {
    await supabase.from('activity_log').insert({
      card_id: params.id,
      user_id: userId,
      action: 'approval_status_changed',
      details: { from_status: fromStatus, to_status: status, comment: comment?.trim() || null },
    });
  } catch {
    // Non-fatal activity log
  }

  return successResponse({
    card_id: params.id,
    from_status: fromStatus,
    to_status: status,
    comment: comment?.trim() || null,
  });
}
