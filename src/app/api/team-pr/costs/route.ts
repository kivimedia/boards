import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/team-pr/costs
 * Cost breakdown. Supports ?run_id= (per-run) or no filter (global).
 * Returns aggregated costs by service_name and total.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get('run_id');

  let query = supabase
    .from('pr_costs')
    .select(`
      *,
      run:pr_runs!inner(id, user_id, client_id)
    `)
    .eq('run.user_id', userId);

  if (runId) {
    query = query.eq('run_id', runId);
  }

  const { data, error } = await query;
  if (error) return errorResponse(error.message, 500);

  // Aggregate costs by service_name
  const byService: Record<string, { count: number; total_cost: number }> = {};
  let grandTotal = 0;

  for (const row of data || []) {
    const service = row.service_name || 'unknown';
    if (!byService[service]) {
      byService[service] = { count: 0, total_cost: 0 };
    }
    byService[service].count += 1;
    byService[service].total_cost += row.cost_usd || 0;
    grandTotal += row.cost_usd || 0;
  }

  return successResponse({
    by_service: byService,
    total_usd: Math.round(grandTotal * 100) / 100,
    line_items: data,
  });
}
