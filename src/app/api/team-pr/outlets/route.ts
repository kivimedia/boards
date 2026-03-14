import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

/**
 * GET /api/team-pr/outlets
 * Global outlet database. Supports:
 * ?client_id=, ?pipeline_stage=, ?outlet_type=, ?search=, ?is_global=, ?limit=, ?offset=
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');
  const pipelineStage = searchParams.get('pipeline_stage');
  const outletType = searchParams.get('outlet_type');
  const search = searchParams.get('search');
  const isGlobal = searchParams.get('is_global');
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  let query = supabase
    .from('pr_outlets')
    .select(`
      *,
      run:pr_runs!inner(id, user_id, client_id)
    `, { count: 'exact' })
    .eq('run.user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (clientId) query = query.eq('run.client_id', clientId);
  if (pipelineStage) query = query.eq('pipeline_stage', pipelineStage);
  if (outletType) query = query.eq('outlet_type', outletType);
  if (isGlobal === 'true') query = query.eq('is_global', true);
  if (isGlobal === 'false') query = query.eq('is_global', false);
  if (search) {
    query = query.or(`name.ilike.%${search}%,outlet_code.ilike.%${search}%,contact_name.ilike.%${search}%,contact_email.ilike.%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) return errorResponse(error.message, 500);

  return successResponse({ items: data, total: count });
}

/**
 * PATCH /api/team-pr/outlets
 * Bulk update outlets. Body: { outlet_ids: string[], action: 'exclude' | 'promote_global' }
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{
    outlet_ids: string[];
    action: 'exclude' | 'promote_global';
  }>(request);
  if (!body.ok) return body.response;

  if (!body.body.outlet_ids?.length) {
    return errorResponse('outlet_ids is required and must be non-empty');
  }
  if (!['exclude', 'promote_global'].includes(body.body.action)) {
    return errorResponse('action must be "exclude" or "promote_global"');
  }

  const { supabase } = auth.ctx;
  const now = new Date().toISOString();

  let updateData: Record<string, unknown>;
  if (body.body.action === 'exclude') {
    updateData = { pipeline_stage: 'EXCLUDED', updated_at: now };
  } else {
    updateData = { is_global: true, updated_at: now };
  }

  const { data, error } = await supabase
    .from('pr_outlets')
    .update(updateData)
    .in('id', body.body.outlet_ids)
    .select();

  if (error) return errorResponse(error.message, 500);

  return successResponse({ updated: data?.length || 0 });
}
