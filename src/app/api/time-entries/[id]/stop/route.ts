import { NextRequest } from 'next/server';
import {
  getAuthContext,
  successResponse,
  errorResponse,
} from '@/lib/api-helpers';
import { stopTimer } from '@/lib/time-tracking';

interface Params {
  params: { id: string };
}

/**
 * POST /api/time-entries/[id]/stop
 * Stop a running timer by entry ID.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const entryId = params.id;

  // Verify ownership and that it's running
  const { data: existing } = await supabase
    .from('time_entries')
    .select('id, is_running, user_id')
    .eq('id', entryId)
    .single();

  if (!existing) return errorResponse('Time entry not found', 404);
  if (existing.user_id !== userId) return errorResponse('Unauthorized', 403);
  if (!existing.is_running) return errorResponse('Timer is not running', 400);

  const entry = await stopTimer(supabase, entryId);
  if (!entry) return errorResponse('Failed to stop timer', 500);

  return successResponse(entry);
}
