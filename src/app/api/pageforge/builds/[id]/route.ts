import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { getBuildWithCalls } from '@/lib/ai/pageforge-pipeline';

interface Params {
  params: { id: string };
}

/**
 * GET /api/pageforge/builds/[id]
 * Get build detail with agent calls and phases.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const build = await getBuildWithCalls(auth.ctx.supabase, params.id);
    return NextResponse.json({ build });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Build not found', 404);
  }
}
