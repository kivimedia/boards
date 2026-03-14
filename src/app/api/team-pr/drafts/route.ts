import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/team-pr/drafts
 * List email drafts. Supports: ?run_id=, ?status=, ?limit=, ?offset=
 * Joins outlet info (name, outlet_code, contact_name, contact_email).
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get('run_id');
  const status = searchParams.get('status');
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  let query = supabase
    .from('pr_email_drafts')
    .select(`
      *,
      outlet:pr_outlets(id, name, outlet_code, contact_name, contact_email),
      run:pr_runs!inner(id, user_id, client_id)
    `, { count: 'exact' })
    .eq('run.user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (runId) query = query.eq('run_id', runId);
  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return errorResponse(error.message, 500);

  return successResponse({ items: data, total: count });
}
