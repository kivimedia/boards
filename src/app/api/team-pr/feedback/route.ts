import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

/**
 * GET /api/team-pr/feedback
 * List feedback. Supports: ?client_id=, ?run_id=, ?feedback_type=, ?limit=, ?offset=
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');
  const runId = searchParams.get('run_id');
  const feedbackType = searchParams.get('feedback_type');
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  let query = supabase
    .from('pr_feedback')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (clientId) query = query.eq('client_id', clientId);
  if (runId) query = query.eq('run_id', runId);
  if (feedbackType) query = query.eq('feedback_type', feedbackType);

  const { data, error, count } = await query;
  if (error) return errorResponse(error.message, 500);

  return successResponse({ items: data, total: count });
}

/**
 * POST /api/team-pr/feedback
 * Create feedback. Required: client_id, feedback_type, feedback_text.
 * Optional: run_id, outlet_id, sentiment.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{
    client_id: string;
    feedback_type: string;
    feedback_text: string;
    run_id?: string;
    outlet_id?: string;
    sentiment?: string;
  }>(request);
  if (!body.ok) return body.response;

  if (!body.body.client_id?.trim()) {
    return errorResponse('client_id is required');
  }
  if (!body.body.feedback_type?.trim()) {
    return errorResponse('feedback_type is required');
  }
  if (!body.body.feedback_text?.trim()) {
    return errorResponse('feedback_text is required');
  }

  const { supabase, userId } = auth.ctx;
  const { data, error } = await supabase
    .from('pr_feedback')
    .insert({
      user_id: userId,
      client_id: body.body.client_id,
      feedback_type: body.body.feedback_type.trim(),
      feedback_text: body.body.feedback_text.trim(),
      run_id: body.body.run_id || null,
      outlet_id: body.body.outlet_id || null,
      sentiment: body.body.sentiment || null,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
