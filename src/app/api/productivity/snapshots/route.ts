import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import {
  getProductivitySnapshots,
  createProductivitySnapshot,
} from '@/lib/productivity-analytics';

/**
 * GET /api/productivity/snapshots
 * Retrieve productivity snapshots for a date range with optional filters.
 * Query params: start_date (required), end_date (required), user_id, board_id, department
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

  const userId = searchParams.get('user_id') ?? undefined;
  const boardId = searchParams.get('board_id') ?? undefined;
  const department = searchParams.get('department') ?? undefined;

  try {
    const snapshots = await getProductivitySnapshots(supabase, {
      startDate,
      endDate,
      userId,
      boardId,
      department,
    });
    return successResponse(snapshots);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch snapshots';
    return errorResponse(message, 500);
  }
}

interface CreateSnapshotBody {
  snapshot_date: string;
  user_id?: string;
  board_id?: string;
  department?: string;
  tickets_completed: number;
  tickets_created: number;
  avg_cycle_time_hours?: number;
  on_time_rate?: number;
  revision_rate?: number;
  ai_pass_rate?: number;
  total_time_logged_minutes?: number;
}

/**
 * POST /api/productivity/snapshots
 * Create or upsert a productivity snapshot.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const parsed = await parseBody<CreateSnapshotBody>(request);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body;

  if (!body.snapshot_date) return errorResponse('snapshot_date is required');
  if (body.tickets_completed === undefined) return errorResponse('tickets_completed is required');
  if (body.tickets_created === undefined) return errorResponse('tickets_created is required');

  try {
    const snapshot = await createProductivitySnapshot(supabase, {
      snapshotDate: body.snapshot_date,
      userId: body.user_id,
      boardId: body.board_id,
      department: body.department,
      ticketsCompleted: body.tickets_completed,
      ticketsCreated: body.tickets_created,
      avgCycleTimeHours: body.avg_cycle_time_hours,
      onTimeRate: body.on_time_rate,
      revisionRate: body.revision_rate,
      aiPassRate: body.ai_pass_rate,
      totalTimeLoggedMinutes: body.total_time_logged_minutes,
    });

    if (!snapshot) return errorResponse('Failed to create snapshot', 500);
    return successResponse(snapshot, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create snapshot';
    return errorResponse(message, 500);
  }
}
