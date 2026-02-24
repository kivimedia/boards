import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getVideoGeneration, deleteVideoGeneration } from '@/lib/ai/video-generation';

interface Params {
  params: { id: string; generationId: string };
}

/**
 * GET /api/cards/[id]/video/[generationId]
 * Get a single video generation by ID.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { generationId } = params;

  try {
    const generation = await getVideoGeneration(supabase, generationId);

    if (!generation) {
      return errorResponse('Video generation not found', 404);
    }

    return successResponse(generation);
  } catch (err) {
    return errorResponse(
      `Failed to fetch video generation: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

/**
 * DELETE /api/cards/[id]/video/[generationId]
 * Delete a video generation.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { generationId } = params;

  try {
    const existing = await getVideoGeneration(supabase, generationId);

    if (!existing) {
      return errorResponse('Video generation not found', 404);
    }

    await deleteVideoGeneration(supabase, generationId);
    return successResponse({ deleted: true });
  } catch (err) {
    return errorResponse(
      `Failed to delete video generation: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
