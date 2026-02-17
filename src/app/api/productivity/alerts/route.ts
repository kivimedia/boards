import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getAlerts, acknowledgeAlert } from '@/lib/productivity-analytics';

/**
 * GET /api/productivity/alerts
 * Retrieve productivity alerts with optional filters.
 * Query params: board_id, user_id, severity, acknowledged, limit
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);

  const boardId = searchParams.get('board_id') ?? undefined;
  const userId = searchParams.get('user_id') ?? undefined;
  const severity = searchParams.get('severity') ?? undefined;
  const acknowledged = searchParams.has('acknowledged')
    ? searchParams.get('acknowledged') === 'true'
    : undefined;
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;

  try {
    const alerts = await getAlerts(supabase, {
      boardId,
      userId,
      severity,
      acknowledged,
      limit,
    });
    return successResponse(alerts);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch alerts';
    return errorResponse(message, 500);
  }
}

interface AcknowledgeBody {
  alert_id: string;
}

/**
 * POST /api/productivity/alerts
 * Acknowledge a productivity alert.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const parsed = await parseBody<AcknowledgeBody>(request);
  if (!parsed.ok) return parsed.response;

  if (!parsed.body.alert_id) {
    return errorResponse('alert_id is required');
  }

  try {
    const success = await acknowledgeAlert(supabase, parsed.body.alert_id, userId);
    if (!success) return errorResponse('Failed to acknowledge alert', 500);
    return successResponse({ acknowledged: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to acknowledge alert';
    return errorResponse(message, 500);
  }
}
