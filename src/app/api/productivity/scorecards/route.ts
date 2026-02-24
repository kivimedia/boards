import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import {
  getProductivitySnapshots,
  buildUserScorecards,
} from '@/lib/productivity-analytics';
import type { ProductivitySnapshot } from '@/lib/types';

/**
 * GET /api/productivity/scorecards
 * Retrieve user scorecards for a date range.
 * Query params: start_date (required), end_date (required), board_id, department
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);

  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');

  if (!startDate || !endDate) {
    return errorResponse('start_date and end_date are required');
  }

  const boardId = searchParams.get('board_id') ?? undefined;
  const department = searchParams.get('department') ?? undefined;

  try {
    // Get all snapshots that have user_id set
    const snapshots = await getProductivitySnapshots(supabase, {
      startDate,
      endDate,
      boardId,
      department,
    });

    // Group snapshots by user_id
    const userSnapshotsMap = new Map<string, ProductivitySnapshot[]>();
    for (const snapshot of snapshots) {
      if (!snapshot.user_id) continue;
      const existing = userSnapshotsMap.get(snapshot.user_id) ?? [];
      existing.push(snapshot);
      userSnapshotsMap.set(snapshot.user_id, existing);
    }

    // Fetch user display names
    const userIds = Array.from(userSnapshotsMap.keys());
    const userNamesMap = new Map<string, string>();

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', userIds);

      if (profiles) {
        for (const profile of profiles) {
          userNamesMap.set(profile.id, profile.display_name);
        }
      }
    }

    const scorecards = buildUserScorecards(userSnapshotsMap, userNamesMap);
    return successResponse(scorecards);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build scorecards';
    return errorResponse(message, 500);
  }
}
