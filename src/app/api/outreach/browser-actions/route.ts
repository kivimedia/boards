import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/outreach/browser-actions - List browser actions with filters
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '25');
  const actionType = searchParams.get('action_type');
  const status = searchParams.get('status');
  const batchId = searchParams.get('batch_id');

  try {
    let query = supabase
      .from('li_browser_actions')
      .select(`
        *,
        li_leads(id, full_name, linkedin_url),
        li_outreach_messages(id, template_number, message_text)
      `, { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (actionType) query = query.eq('action_type', actionType);
    if (status) query = query.eq('status', status);
    if (batchId) query = query.eq('batch_id', batchId);

    const { data: actions, count, error } = await query;

    if (error) throw new Error(error.message);

    return successResponse({
      actions: actions || [],
      total: count || 0,
      page,
      limit,
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to fetch actions', 500);
  }
}
