import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { createSnapshot, getSnapshots } from '@/lib/weekly-gantt';

interface Params {
  params: Promise<{ clientId: string; planId: string }>;
}

/**
 * GET /api/clients/[clientId]/weekly-plans/[planId]/snapshot
 * List all snapshots for a plan (most recent first).
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { planId } = await params;

  try {
    const snapshots = await getSnapshots(auth.ctx.supabase, planId);
    return successResponse(snapshots);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to fetch snapshots', 500);
  }
}

/**
 * POST /api/clients/[clientId]/weekly-plans/[planId]/snapshot
 * Create a manual snapshot.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { planId } = await params;

  try {
    const snapshot = await createSnapshot(auth.ctx.supabase, planId, 'manual', auth.ctx.userId);
    return successResponse(snapshot, 201);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to create snapshot', 500);
  }
}
