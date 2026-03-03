import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { approveProposal, rejectProposal, rollbackProposal } from '@/lib/outreach/feedback-loop';

/**
 * POST /api/outreach/learning/[id] - Approve, reject, or rollback a proposal
 *
 * Body: { action: 'approve' | 'reject' | 'rollback' }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { id } = await params;

  let body: { action: 'approve' | 'reject' | 'rollback' };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!['approve', 'reject', 'rollback'].includes(body.action)) {
    return errorResponse('action must be approve, reject, or rollback', 400);
  }

  let result: { success: boolean; error?: string };

  switch (body.action) {
    case 'approve':
      result = await approveProposal(supabase, userId, id);
      break;
    case 'reject':
      result = await rejectProposal(supabase, userId, id);
      break;
    case 'rollback':
      result = await rollbackProposal(supabase, userId, id);
      break;
    default:
      return errorResponse('Invalid action', 400);
  }

  if (!result.success) {
    return errorResponse(result.error || 'Action failed', 400);
  }

  // Return updated proposal
  const { data: proposal } = await supabase
    .from('li_learning_log')
    .select('*')
    .eq('id', id)
    .single();

  return successResponse({ proposal });
}
