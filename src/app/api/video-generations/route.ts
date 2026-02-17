import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getUserVideoGenerations } from '@/lib/ai/video-generation';

/**
 * GET /api/video-generations
 * List the current user's video generations.
 * Query params:
 *   limit?: number (default 20)
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') ?? '20', 10);

  try {
    const generations = await getUserVideoGenerations(supabase, userId, limit);
    return successResponse(generations);
  } catch (err) {
    return errorResponse(
      `Failed to fetch video generations: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
