import { NextRequest } from 'next/server';
import {
  getAuthContext,
  successResponse,
} from '@/lib/api-helpers';
import { getRunningTimer } from '@/lib/time-tracking';

/**
 * GET /api/time-entries/running
 * Get the currently running timer for the authenticated user (or null).
 */
export async function GET(_request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const entry = await getRunningTimer(supabase, userId);

  return successResponse(entry);
}
