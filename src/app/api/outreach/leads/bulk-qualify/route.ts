import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { qualifyBatch } from '@/lib/outreach/qualifier';

/**
 * POST /api/outreach/leads/bulk-qualify
 * Qualify selected leads using the 10-step qualification pipeline.
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

  const results = await qualifyBatch(supabase, userId, lead_ids);

  return successResponse(results);
}
