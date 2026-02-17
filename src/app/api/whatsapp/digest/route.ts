import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getDigestConfig, upsertDigestConfig } from '@/lib/whatsapp';

/**
 * GET /api/whatsapp/digest
 * Get the current user's digest configuration.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const config = await getDigestConfig(supabase, userId);

  return successResponse(config);
}

interface UpsertDigestBody {
  is_enabled?: boolean;
  send_time?: string;
  include_overdue?: boolean;
  include_assigned?: boolean;
  include_mentions?: boolean;
  include_board_summary?: boolean;
  board_ids?: string[];
}

/**
 * PUT /api/whatsapp/digest
 * Create or update the current user's digest configuration.
 */
export async function PUT(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<UpsertDigestBody>(request);
  if (!parsed.ok) return parsed.response;

  const {
    is_enabled,
    send_time,
    include_overdue,
    include_assigned,
    include_mentions,
    include_board_summary,
    board_ids,
  } = parsed.body;

  // Validate send_time if provided
  if (send_time !== undefined) {
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!timeRegex.test(send_time)) {
      return errorResponse('send_time must be in HH:MM format');
    }
  }

  // Validate board_ids if provided
  if (board_ids !== undefined && !Array.isArray(board_ids)) {
    return errorResponse('board_ids must be an array');
  }

  const { supabase, userId } = auth.ctx;

  const updates: Record<string, unknown> = {};
  if (is_enabled !== undefined) updates.is_enabled = is_enabled;
  if (send_time !== undefined) updates.send_time = send_time;
  if (include_overdue !== undefined) updates.include_overdue = include_overdue;
  if (include_assigned !== undefined) updates.include_assigned = include_assigned;
  if (include_mentions !== undefined) updates.include_mentions = include_mentions;
  if (include_board_summary !== undefined) updates.include_board_summary = include_board_summary;
  if (board_ids !== undefined) updates.board_ids = board_ids;

  const config = await upsertDigestConfig(supabase, userId, updates);

  if (!config) {
    return errorResponse('Failed to save digest configuration', 500);
  }

  return successResponse(config);
}
