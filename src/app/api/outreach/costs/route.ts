import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/outreach/costs - Cost breakdown
 *
 * Query params:
 *   batch_id - Filter by batch
 *   service - Filter by service (hunter, snov, serpapi, anthropic)
 *   period - 'day' | 'week' | 'month' | 'all' (default: month)
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { searchParams } = new URL(request.url);

  const batch_id = searchParams.get('batch_id');
  const service = searchParams.get('service');
  const period = searchParams.get('period') || 'month';

  // Build date filter
  let startDate: Date | null = null;
  const now = new Date();
  switch (period) {
    case 'day':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }

  let query = supabase
    .from('li_cost_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (batch_id) query = query.eq('batch_id', batch_id);
  if (service) query = query.eq('service_name', service);
  if (startDate) query = query.gte('created_at', startDate.toISOString());

  const { data: events, error } = await query;
  if (error) return errorResponse(error.message, 500);

  // Aggregate by service
  const byService: Record<string, { total_cost: number; total_credits: number; count: number; success_count: number }> = {};
  let totalCost = 0;

  for (const event of events || []) {
    const svc = event.service_name;
    if (!byService[svc]) {
      byService[svc] = { total_cost: 0, total_credits: 0, count: 0, success_count: 0 };
    }
    byService[svc].total_cost += Number(event.cost_usd) || 0;
    byService[svc].total_credits += Number(event.credits_used) || 0;
    byService[svc].count++;
    if (event.success) byService[svc].success_count++;
    totalCost += Number(event.cost_usd) || 0;
  }

  // Get budget cap
  const { data: settings } = await supabase
    .from('li_settings')
    .select('budget_cap_usd, budget_alert_pct')
    .eq('user_id', userId)
    .single();

  const budgetCap = settings?.budget_cap_usd || 100;
  const budgetPct = Math.round((totalCost / budgetCap) * 100);

  // Calculate cost per qualified lead
  const { count: qualifiedCount } = await supabase
    .from('li_leads')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('qualification_status', 'qualified')
    .is('deleted_at', null);

  const costPerQualified = qualifiedCount && qualifiedCount > 0
    ? Math.round((totalCost / qualifiedCount) * 100) / 100
    : 0;

  return successResponse({
    by_service: byService,
    total_cost_usd: Math.round(totalCost * 100) / 100,
    budget_cap_usd: budgetCap,
    budget_used_pct: budgetPct,
    cost_per_qualified_lead: costPerQualified,
    qualified_leads: qualifiedCount || 0,
    event_count: events?.length || 0,
  });
}
