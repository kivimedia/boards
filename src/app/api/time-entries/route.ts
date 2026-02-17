import { NextRequest } from 'next/server';
import {
  getAuthContext,
  successResponse,
  errorResponse,
  parseBody,
} from '@/lib/api-helpers';
import {
  getUserTimeEntries,
  startTimer,
  createManualEntry,
} from '@/lib/time-tracking';

/**
 * GET /api/time-entries
 * List time entries for the current user with optional filters.
 * Query params: start_date, end_date, board_id, client_id
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { searchParams } = new URL(request.url);

  const filters: {
    startDate?: string;
    endDate?: string;
    boardId?: string;
    clientId?: string;
  } = {};

  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');
  const boardId = searchParams.get('board_id');
  const clientId = searchParams.get('client_id');

  if (startDate) filters.startDate = startDate;
  if (endDate) filters.endDate = endDate;
  if (boardId) filters.boardId = boardId;
  if (clientId) filters.clientId = clientId;

  const entries = await getUserTimeEntries(supabase, userId, filters);
  return successResponse(entries);
}

interface CreateTimeEntryBody {
  card_id: string;
  type: 'timer' | 'manual';
  board_id?: string;
  client_id?: string;
  description?: string;
  is_billable?: boolean;
  started_at?: string;
  ended_at?: string;
}

/**
 * POST /api/time-entries
 * Start a timer (type=timer) or create a manual entry (type=manual).
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<CreateTimeEntryBody>(request);
  if (!parsed.ok) return parsed.response;

  const { supabase, userId } = auth.ctx;
  const body = parsed.body;

  if (!body.card_id) return errorResponse('card_id is required');
  if (!body.type) return errorResponse('type is required (timer or manual)');

  if (body.type === 'timer') {
    const entry = await startTimer(supabase, body.card_id, userId, {
      boardId: body.board_id,
      clientId: body.client_id,
      description: body.description,
      isBillable: body.is_billable,
    });

    if (!entry) return errorResponse('Failed to start timer', 500);
    return successResponse(entry, 201);
  }

  if (body.type === 'manual') {
    if (!body.started_at) return errorResponse('started_at is required for manual entry');
    if (!body.ended_at) return errorResponse('ended_at is required for manual entry');

    const entry = await createManualEntry(supabase, {
      cardId: body.card_id,
      userId,
      boardId: body.board_id,
      clientId: body.client_id,
      description: body.description,
      startedAt: body.started_at,
      endedAt: body.ended_at,
      isBillable: body.is_billable,
    });

    if (!entry) return errorResponse('Failed to create manual entry. Duration must be positive.', 400);
    return successResponse(entry, 201);
  }

  return errorResponse('type must be "timer" or "manual"');
}
