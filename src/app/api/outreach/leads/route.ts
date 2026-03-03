import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/outreach/leads - List leads with filters
 *
 * Query params:
 *   pipeline_stage - Filter by stage
 *   qualification_status - Filter by qualification
 *   batch_id - Filter by import batch
 *   min_score - Minimum lead score
 *   search - Search by name/company/title
 *   sort - Sort field (default: lead_score)
 *   order - Sort order (default: desc)
 *   page - Page number (default: 1)
 *   limit - Page size (default: 50)
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { searchParams } = new URL(request.url);

  const pipeline_stage = searchParams.get('pipeline_stage');
  const qualification_status = searchParams.get('qualification_status');
  const batch_id = searchParams.get('batch_id');
  const min_score = searchParams.get('min_score');
  const search = searchParams.get('search');
  const sort = searchParams.get('sort') || 'lead_score';
  const order = searchParams.get('order') || 'desc';
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const offset = (page - 1) * limit;

  // Build query
  let query = supabase
    .from('li_leads')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (pipeline_stage) query = query.eq('pipeline_stage', pipeline_stage);
  if (qualification_status) query = query.eq('qualification_status', qualification_status);
  if (batch_id) query = query.eq('batch_id', batch_id);
  if (min_score) query = query.gte('lead_score', parseInt(min_score));
  if (search) {
    query = query.or(`full_name.ilike.%${search}%,company_name.ilike.%${search}%,job_position.ilike.%${search}%`);
  }

  // Sort
  const ascending = order === 'asc';
  query = query.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) return errorResponse(error.message, 500);

  return successResponse({
    leads: data || [],
    total: count || 0,
    page,
    limit,
    total_pages: Math.ceil((count || 0) / limit),
  });
}
