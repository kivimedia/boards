import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

/**
 * POST /api/outreach/leads/bulk-enrich
 * Mark selected leads for enrichment by setting pipeline_stage to 'ENRICHING'.
 * The job queue worker picks up these leads and runs enrichment.
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
    .update({ 
      pipeline_stage: 'ENRICHING',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .in('id', lead_ids)
    .is('deleted_at', null)
    .select('id');

  if (error) {
    return errorResponse(error.message, 500);
  }

  return successResponse({ enqueued: data?.length || 0 });
}
