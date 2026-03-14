import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

/**
 * POST /api/team-pr/runs/[runId]/native-review
 * Mark native speaker review as completed (or uncompleted) and attach reviewer notes.
 * Body: { completed: boolean, notes?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{
    completed: boolean;
    notes?: string;
  }>(request);
  if (!body.ok) return body.response;

  if (typeof body.body.completed !== 'boolean') {
    return errorResponse('completed (boolean) is required');
  }

  const { supabase, userId } = auth.ctx;
  const { runId } = params;

  // Verify ownership
  const { data: run, error: runError } = await supabase
    .from('pr_runs')
    .select('id, native_review_required')
    .eq('id', runId)
    .eq('user_id', userId)
    .single();

  if (runError || !run) return errorResponse('Run not found', 404);

  const { data, error } = await supabase
    .from('pr_runs')
    .update({
      native_review_completed: body.body.completed,
      native_reviewer_notes: body.body.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}
