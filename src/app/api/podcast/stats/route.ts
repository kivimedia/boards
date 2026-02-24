import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/podcast/stats
 * Dashboard stats: pipeline counts, recent runs, weekly metrics
 */
export async function GET(_request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  // Pipeline counts by status
  const { data: candidates, error: candidatesError } = await supabase
    .from('pga_candidates')
    .select('status');

  if (candidatesError) return errorResponse(candidatesError.message, 500);

  const pipeline: Record<string, number> = {
    scouted: 0,
    approved: 0,
    outreach_active: 0,
    replied: 0,
    scheduled: 0,
    interviewed: 0,
    rejected: 0,
  };

  for (const c of candidates || []) {
    if (c.status && pipeline[c.status] !== undefined) {
      pipeline[c.status]++;
    }
  }

  // Recent agent runs (last 10)
  const { data: recentRuns } = await supabase
    .from('pga_agent_runs')
    .select('id, agent_type, status, started_at, ended_at, candidates_found, emails_created, tokens_used')
    .order('started_at', { ascending: false })
    .limit(10);

  // Weekly metrics (last 7 days)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data: weekCandidates } = await supabase
    .from('pga_candidates')
    .select('id')
    .gte('created_at', weekAgo.toISOString());

  const { data: weekApproved } = await supabase
    .from('pga_candidates')
    .select('id')
    .gte('reviewed_at', weekAgo.toISOString())
    .eq('status', 'approved');

  const { data: weekRuns } = await supabase
    .from('pga_agent_runs')
    .select('agent_type, candidates_found, emails_created, tokens_used')
    .gte('started_at', weekAgo.toISOString())
    .eq('status', 'completed');

  const weeklyMetrics = {
    candidates_found: weekCandidates?.length || 0,
    candidates_approved: weekApproved?.length || 0,
    emails_created: (weekRuns || []).reduce((sum, r) => sum + (r.emails_created || 0), 0),
    scout_runs: (weekRuns || []).filter(r => r.agent_type === 'scout').length,
    outreach_runs: (weekRuns || []).filter(r => r.agent_type === 'outreach').length,
    total_tokens: (weekRuns || []).reduce((sum, r) => sum + (r.tokens_used || 0), 0),
  };

  // Active sequences count
  const { count: activeSequences } = await supabase
    .from('pga_email_sequences')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active');

  return successResponse({
    pipeline,
    totalCandidates: candidates?.length || 0,
    activeSequences: activeSequences || 0,
    weeklyMetrics,
    recentRuns: recentRuns || [],
  });
}
