import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/outreach/trash - List soft-deleted leads
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const { data, error } = await supabase
    .from('li_leads')
    .select('id, full_name, job_position, pipeline_stage, lead_score, deleted_at, purge_after')
    .eq('user_id', userId)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  if (error) return errorResponse(error.message, 500);

  // Add days until purge
  const now = new Date();
  const leads = (data || []).map(lead => ({
    ...lead,
    days_since_deleted: Math.floor((now.getTime() - new Date(lead.deleted_at).getTime()) / (1000 * 60 * 60 * 24)),
    days_until_purge: lead.purge_after
      ? Math.max(0, Math.ceil((new Date(lead.purge_after).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : null,
  }));

  return successResponse({ leads });
}

/**
 * POST /api/outreach/trash - Restore or permanently delete
 *
 * Body: {
 *   action: 'restore' | 'permanent_delete' | 'empty_trash';
 *   lead_ids?: string[];  // Required for restore and permanent_delete
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: { action: string; lead_ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (body.action === 'restore') {
    if (!body.lead_ids || body.lead_ids.length === 0) {
      return errorResponse('lead_ids required for restore', 400);
    }

    const { error } = await supabase
      .from('li_leads')
      .update({ deleted_at: null, purge_after: null })
      .eq('user_id', userId)
      .in('id', body.lead_ids)
      .not('deleted_at', 'is', null);

    if (error) return errorResponse(error.message, 500);
    return successResponse({ restored: body.lead_ids.length });
  }

  if (body.action === 'permanent_delete') {
    if (!body.lead_ids || body.lead_ids.length === 0) {
      return errorResponse('lead_ids required for permanent delete', 400);
    }

    const { error } = await supabase
      .from('li_leads')
      .delete()
      .eq('user_id', userId)
      .in('id', body.lead_ids)
      .not('deleted_at', 'is', null);

    if (error) return errorResponse(error.message, 500);
    return successResponse({ deleted: body.lead_ids.length });
  }

  if (body.action === 'empty_trash') {
    const { error, count } = await supabase
      .from('li_leads')
      .delete()
      .eq('user_id', userId)
      .not('deleted_at', 'is', null);

    if (error) return errorResponse(error.message, 500);
    return successResponse({ deleted: count || 0 });
  }

  return errorResponse('Invalid action. Use: restore, permanent_delete, or empty_trash', 400);
}
