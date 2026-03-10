import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

/**
 * POST /api/outreach/leads/bulk-enrich
 * Mark selected leads for enrichment by setting enrichment_status to 'pending'.
 * The job queue worker picks up pending leads and runs enrichment.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const parsed = await parseBody<{ lead_ids: string[] }>(request);
  if (!parsed.ok) return parsed.response;

  const { lead_ids } = parsed.body;

  if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
    return errorResponse('lead_ids must be a non-empty array', 400);
  }

  if (lead_ids.length > 100) {
    return errorResponse('Maximum 100 leads per batch', 400);
  }

  const { data, error } = await supabase
    .from('li_leads')
    .update({ enrichment_status: 'pending' })
    .eq('user_id', userId)
    .in('id', lead_ids)
    .is('deleted_at', null)
    .select('id');

  if (error) {
    return errorResponse(error.message, 500);
  }

  return successResponse({ enqueued: data?.length || 0 });
}
