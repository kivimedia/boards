import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getWatchers, addWatcher, removeWatcher } from '@/lib/card-watchers';

interface Params {
  params: { id: string };
}

/**
 * GET /api/cards/[id]/watchers
 * Fetch watchers for the card.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  try {
    const watchers = await getWatchers(supabase, params.id);
    return successResponse(watchers);
  } catch (err) {
    return errorResponse(
      `Failed to fetch watchers: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

/**
 * POST /api/cards/[id]/watchers
 * Add current user as watcher.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  try {
    await addWatcher(supabase, params.id, userId);
    return successResponse(null, 201);
  } catch (err) {
    return errorResponse(
      `Failed to add watcher: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

/**
 * DELETE /api/cards/[id]/watchers
 * Remove current user as watcher.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  try {
    await removeWatcher(supabase, params.id, userId);
    return successResponse(null);
  } catch (err) {
    return errorResponse(
      `Failed to remove watcher: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
