import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/seo/costs
 * SEO cost dashboard data aggregated from seo_agent_calls.
 * Query params: days (default 30)
 * Returns { total_cost, cost_by_agent, cost_by_run }.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);

  const days = parseInt(searchParams.get('days') || '30', 10);
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceISO = since.toISOString();

  // Fetch all agent calls within the time window
  const { data: calls, error } = await supabase
    .from('seo_agent_calls')
    .select('id, run_id, agent_name, cost, tokens_used, created_at')
    .gte('created_at', sinceISO)
    .order('created_at', { ascending: false });

  if (error) return errorResponse(error.message, 500);

  const rows = calls || [];

  // Aggregate total cost
  let totalCost = 0;
  let totalTokens = 0;
  const byAgent: Record<string, { cost: number; tokens: number; calls: number }> = {};
  const byRun: Record<string, { cost: number; tokens: number; calls: number }> = {};

  for (const call of rows) {
    const cost = call.cost || 0;
    const tokens = call.tokens_used || 0;

    totalCost += cost;
    totalTokens += tokens;

    // Cost by agent
    const agent = call.agent_name || 'unknown';
    if (!byAgent[agent]) byAgent[agent] = { cost: 0, tokens: 0, calls: 0 };
    byAgent[agent].cost += cost;
    byAgent[agent].tokens += tokens;
    byAgent[agent].calls += 1;

    // Cost by run
    const runId = call.run_id || 'unlinked';
    if (!byRun[runId]) byRun[runId] = { cost: 0, tokens: 0, calls: 0 };
    byRun[runId].cost += cost;
    byRun[runId].tokens += tokens;
    byRun[runId].calls += 1;
  }

  return successResponse({
    days,
    total_cost: totalCost,
    total_tokens: totalTokens,
    total_calls: rows.length,
    cost_by_agent: byAgent,
    cost_by_run: byRun,
  });
}
