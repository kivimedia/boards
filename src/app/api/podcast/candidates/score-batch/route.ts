import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { scoreCandidates } from '@/lib/ai/quality-scorer';
import type { PGACandidate } from '@/lib/types';

/**
 * POST /api/podcast/candidates/score-batch
 * Score and tier a batch of candidates.
 *
 * Body: { candidate_ids?: string[], status?: string, save?: boolean }
 * - If candidate_ids provided, score those specific candidates
 * - If status provided, score all candidates with that status
 * - If save is true, update quality_score and tier in the database
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const body = await request.json().catch(() => ({}));
  const { candidate_ids, status, save } = body as {
    candidate_ids?: string[];
    status?: string;
    save?: boolean;
  };

  // Build query
  let query = supabase.from('pga_candidates').select('*');

  if (candidate_ids && candidate_ids.length > 0) {
    query = query.in('id', candidate_ids);
  } else if (status) {
    query = query.eq('status', status);
  } else {
    // Default: score all non-rejected candidates
    query = query.neq('status', 'rejected').limit(100);
  }

  const { data: candidates, error } = await query;

  if (error) {
    return errorResponse(`Failed to load candidates: ${error.message}`, 500);
  }

  if (!candidates || candidates.length === 0) {
    return successResponse({ results: [], message: 'No candidates to score' });
  }

  const results = await scoreCandidates(
    supabase,
    candidates as PGACandidate[],
    { saveToDB: save ?? false }
  );

  // Summary stats
  const tiers = { hot: 0, warm: 0, cold: 0 };
  for (const r of results) {
    tiers[r.score.tier]++;
  }

  return successResponse({
    total: results.length,
    saved: save ?? false,
    tiers,
    results: results.map((r) => ({
      id: r.candidate.id,
      name: r.candidate.name,
      score: r.score.total,
      tier: r.score.tier,
      breakdown: {
        revenue_magnitude: r.score.revenue_magnitude,
        proof_strength: r.score.proof_strength,
        reachability: r.score.reachability,
        vibe_coding_fit: r.score.vibe_coding_fit,
        content_richness: r.score.content_richness,
      },
      reasons: r.score.reasons,
    })),
  });
}
