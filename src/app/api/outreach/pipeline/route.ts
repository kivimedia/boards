import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getPipelineStats } from '@/lib/outreach/pipeline-fsm';

/**
 * GET /api/outreach/pipeline - Pipeline funnel stats
 *
 * Returns count of leads at each pipeline stage + overall metrics
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // Get stage counts
  const stageCounts = await getPipelineStats(supabase, userId);

  // Get overall metrics
  const { count: totalLeads } = await supabase
    .from('li_leads')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null);

  const { count: qualifiedLeads } = await supabase
    .from('li_leads')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('qualification_status', 'qualified')
    .is('deleted_at', null);

  const { count: needsReview } = await supabase
    .from('li_leads')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('qualification_status', 'needs_review')
    .is('deleted_at', null);

  // Get recent batches
  const { data: recentBatches } = await supabase
    .from('li_batches')
    .select('id, source_type, total_imported, qualified_count, cost_total_usd, status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  // Get total costs
  const { data: costAgg } = await supabase
    .from('li_cost_events')
    .select('cost_usd')
    .eq('user_id', userId);

  const totalCostUsd = (costAgg || []).reduce((sum, e) => sum + (Number(e.cost_usd) || 0), 0);

  // Get average lead score
  const { data: scoreData } = await supabase
    .from('li_leads')
    .select('lead_score')
    .eq('user_id', userId)
    .eq('qualification_status', 'qualified')
    .is('deleted_at', null);

  const avgScore = scoreData && scoreData.length > 0
    ? Math.round(scoreData.reduce((sum, l) => sum + l.lead_score, 0) / scoreData.length)
    : 0;

  return successResponse({
    stage_counts: stageCounts,
    metrics: {
      total_leads: totalLeads || 0,
      qualified_leads: qualifiedLeads || 0,
      needs_review: needsReview || 0,
      avg_lead_score: avgScore,
      total_cost_usd: Math.round(totalCostUsd * 100) / 100,
    },
    recent_batches: recentBatches || [],
  });
}
