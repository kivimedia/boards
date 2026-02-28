import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-helpers';

/**
 * GET /api/pageforge/costs
 * Cost aggregation for PageForge builds.
 * Query params: ?period=7d|30d|all&clientId=xxx
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const period = url.searchParams.get('period') || '30d';
  const clientId = url.searchParams.get('clientId');

  let query = auth.ctx.supabase
    .from('pageforge_builds')
    .select('id, page_title, total_cost_usd, agent_costs, status, created_at, client_id');

  // Apply date filter
  if (period !== 'all') {
    const days = period === '7d' ? 7 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte('created_at', since);
  }

  if (clientId) {
    query = query.eq('client_id', clientId);
  }

  const { data: builds } = await query.order('created_at', { ascending: false }).limit(200);

  if (!builds || builds.length === 0) {
    return NextResponse.json({
      totalCost: 0,
      buildCount: 0,
      avgCostPerBuild: 0,
      byAgent: {},
      builds: [],
    });
  }

  let totalCost = 0;
  const byAgent: Record<string, number> = {};

  for (const build of builds) {
    totalCost += Number(build.total_cost_usd) || 0;
    const agentCosts = (build.agent_costs || {}) as Record<string, number>;
    for (const [agent, cost] of Object.entries(agentCosts)) {
      byAgent[agent] = (byAgent[agent] || 0) + cost;
    }
  }

  return NextResponse.json({
    totalCost: Math.round(totalCost * 10000) / 10000,
    buildCount: builds.length,
    avgCostPerBuild: builds.length > 0 ? Math.round((totalCost / builds.length) * 10000) / 10000 : 0,
    byAgent,
    builds: builds.map(b => ({
      id: b.id,
      pageTitle: b.page_title,
      cost: Number(b.total_cost_usd) || 0,
      status: b.status,
      createdAt: b.created_at,
    })),
  });
}
