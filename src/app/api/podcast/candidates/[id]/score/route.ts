import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { calculateQualityScore } from '@/lib/ai/quality-scorer';
import { loadDossier } from '@/lib/ai/research-dossier';
import type { PGACandidate } from '@/lib/types';

type Params = { params: { id: string } };

/**
 * GET /api/podcast/candidates/[id]/score
 * Get the quality score breakdown for a candidate.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data: candidate, error } = await supabase
    .from('pga_candidates')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !candidate) {
    return errorResponse('Candidate not found', 404);
  }

  // Load dossier if available
  const dossier = await loadDossier(supabase, params.id);
  const score = calculateQualityScore(candidate as PGACandidate, dossier);

  return successResponse({ score });
}

/**
 * POST /api/podcast/candidates/[id]/score
 * Recalculate and save the quality score for a candidate.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data: candidate, error } = await supabase
    .from('pga_candidates')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !candidate) {
    return errorResponse('Candidate not found', 404);
  }

  const dossier = await loadDossier(supabase, params.id);
  const score = calculateQualityScore(candidate as PGACandidate, dossier);

  // Save to database
  await supabase
    .from('pga_candidates')
    .update({
      quality_score: score.total,
      tier: score.tier,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id);

  return successResponse({ score, saved: true });
}
