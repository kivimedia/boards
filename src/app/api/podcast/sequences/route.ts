import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

/**
 * GET /api/podcast/sequences
 * List email sequences with optional filters
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const candidateId = searchParams.get('candidate_id');
  const status = searchParams.get('status');
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  let query = supabase
    .from('pga_email_sequences')
    .select('*, pga_candidates(name, email, one_liner)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (candidateId) query = query.eq('candidate_id', candidateId);
  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return errorResponse(error.message, 500);

  return successResponse({ sequences: data, total: count });
}

/**
 * POST /api/podcast/sequences
 * Create a new email sequence for a candidate
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{
    candidate_id: string;
    emails: Array<{ step: number; day: number; subject: string; body: string }>;
    instantly_campaign_id?: string;
  }>(request);
  if (!body.ok) return body.response;

  if (!body.body.candidate_id) {
    return errorResponse('candidate_id is required');
  }

  const { supabase } = auth.ctx;

  // Verify candidate exists and is in approved status
  const { data: candidate } = await supabase
    .from('pga_candidates')
    .select('id, status')
    .eq('id', body.body.candidate_id)
    .single();

  if (!candidate) {
    return errorResponse('Candidate not found', 404);
  }

  const { data, error } = await supabase
    .from('pga_email_sequences')
    .insert({
      candidate_id: body.body.candidate_id,
      emails: body.body.emails || [],
      instantly_campaign_id: body.body.instantly_campaign_id || null,
      status: 'draft',
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
