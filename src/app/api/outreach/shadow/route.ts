import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getShadowComparisons } from '@/lib/outreach/feedback-loop';
import { generateProposals } from '@/lib/outreach/feedback-loop';

/**
 * GET /api/outreach/shadow - Shadow mode results
 *
 * Query: ?days=30
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const days = parseInt(request.nextUrl.searchParams.get('days') || '30', 10);
  const result = await getShadowComparisons(supabase, userId, days);

  return successResponse({
    comparisons: result.comparisons,
    agreementRate: result.agreementRate,
    total: result.total,
    disagreements: result.comparisons.length,
  });
}

/**
 * POST /api/outreach/shadow - Trigger shadow analysis (generate proposals from overrides)
 */
export async function POST() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  try {
    const proposals = await generateProposals(supabase, userId, 30);
    return successResponse({
      proposals_generated: proposals.length,
      proposals,
    });
  } catch (err) {
    return errorResponse(`Shadow analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 500);
  }
}
