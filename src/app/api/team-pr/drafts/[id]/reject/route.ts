import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

/**
 * POST /api/team-pr/drafts/[id]/reject
 * Reject email draft with notes.
 * Body: { reviewer_notes: string }. Sets status='REJECTED'.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{
    reviewer_notes: string;
  }>(request);
  if (!body.ok) return body.response;

  if (!body.body.reviewer_notes?.trim()) {
    return errorResponse('reviewer_notes is required');
  }

  const { supabase, userId } = auth.ctx;
  const { id } = params;

  // Verify ownership via run
  const { data: draft, error: checkError } = await supabase
    .from('pr_email_drafts')
    .select('id, run:pr_runs!inner(user_id)')
    .eq('id', id)
    .eq('run.user_id', userId)
    .single();

  if (checkError || !draft) return errorResponse('Draft not found', 404);

  const { data, error } = await supabase
    .from('pr_email_drafts')
    .update({
      status: 'REJECTED',
      reviewer_notes: body.body.reviewer_notes.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}
