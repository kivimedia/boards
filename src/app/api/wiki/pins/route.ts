import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getBoardPins, pinPageToBoard } from '@/lib/wiki';

/**
 * GET /api/wiki/pins?boardId=...
 * Get all wiki page pins for a board.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);

  const boardId = searchParams.get('boardId');
  if (!boardId) return errorResponse('boardId query param is required');

  const pins = await getBoardPins(supabase, boardId);
  return successResponse(pins);
}

interface PinPageBody {
  boardId: string;
  pageId: string;
}

/**
 * POST /api/wiki/pins
 * Pin a wiki page to a board.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<PinPageBody>(request);
  if (!parsed.ok) return parsed.response;

  const { boardId, pageId } = parsed.body;

  if (!boardId?.trim()) return errorResponse('boardId is required');
  if (!pageId?.trim()) return errorResponse('pageId is required');

  const { supabase, userId } = auth.ctx;

  const pin = await pinPageToBoard(supabase, boardId, pageId, userId);
  if (!pin) return errorResponse('Failed to pin page to board', 500);

  return successResponse(pin, 201);
}
