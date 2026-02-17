import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import {
  getMonitoringConfigs,
  createMonitoringConfig,
  updateMonitoringConfig,
  deleteMonitoringConfig,
} from '@/lib/ai/dev-qa';

/**
 * GET /api/qa/monitoring-configs?board_id=xxx
 * List monitoring configs for a board.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const boardId = request.nextUrl.searchParams.get('board_id');

  if (!boardId) {
    return errorResponse('board_id is required', 400);
  }

  const configs = await getMonitoringConfigs(supabase, boardId);
  return successResponse(configs);
}

interface CreateBody {
  board_id: string;
  card_id?: string;
  url: string;
  frequency?: string;
  browsers?: string[];
  alert_threshold?: number;
}

/**
 * POST /api/qa/monitoring-configs
 * Create a new monitoring config.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const parsed = await parseBody<CreateBody>(request);
  if (!parsed.ok) return parsed.response;

  const { board_id, card_id, url, frequency, browsers, alert_threshold } = parsed.body;

  if (!board_id || !url) {
    return errorResponse('board_id and url are required', 400);
  }

  const config = await createMonitoringConfig(supabase, {
    boardId: board_id,
    cardId: card_id,
    url,
    frequency,
    browsers,
    alertThreshold: alert_threshold,
    createdBy: userId,
  });

  if (!config) {
    return errorResponse('Failed to create monitoring config', 500);
  }

  return successResponse(config, 201);
}

interface UpdateBody {
  config_id: string;
  url?: string;
  frequency?: string;
  browsers?: string[];
  alert_threshold?: number;
  is_active?: boolean;
}

/**
 * PATCH /api/qa/monitoring-configs
 * Update a monitoring config.
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const parsed = await parseBody<UpdateBody>(request);
  if (!parsed.ok) return parsed.response;

  const { config_id, url, frequency, browsers, alert_threshold, is_active } = parsed.body;

  if (!config_id) {
    return errorResponse('config_id is required', 400);
  }

  const config = await updateMonitoringConfig(supabase, config_id, {
    url,
    frequency,
    browsers,
    alertThreshold: alert_threshold,
    isActive: is_active,
  });

  if (!config) {
    return errorResponse('Failed to update monitoring config', 500);
  }

  return successResponse(config);
}

interface DeleteBody {
  config_id: string;
}

/**
 * DELETE /api/qa/monitoring-configs
 * Delete a monitoring config.
 */
export async function DELETE(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const parsed = await parseBody<DeleteBody>(request);
  if (!parsed.ok) return parsed.response;

  const { config_id } = parsed.body;

  if (!config_id) {
    return errorResponse('config_id is required', 400);
  }

  const success = await deleteMonitoringConfig(supabase, config_id);

  if (!success) {
    return errorResponse('Failed to delete monitoring config', 500);
  }

  return successResponse({ deleted: true });
}
