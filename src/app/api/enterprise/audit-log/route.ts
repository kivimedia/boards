import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getAuditLog } from '@/lib/enterprise';

/**
 * GET /api/enterprise/audit-log
 * Retrieve audit log entries with optional filters.
 * Query params: user_id, action, resource_type, resource_id, start_date, end_date, limit
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);

  const userId = searchParams.get('user_id') ?? undefined;
  const action = searchParams.get('action') ?? undefined;
  const resourceType = searchParams.get('resource_type') ?? undefined;
  const resourceId = searchParams.get('resource_id') ?? undefined;
  const startDate = searchParams.get('start_date') ?? undefined;
  const endDate = searchParams.get('end_date') ?? undefined;
  const limitStr = searchParams.get('limit');
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;

  try {
    const entries = await getAuditLog(supabase, {
      userId,
      action,
      resourceType,
      resourceId,
      startDate,
      endDate,
      limit: limit && !isNaN(limit) ? limit : undefined,
    });
    return successResponse(entries);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch audit log';
    return errorResponse(message, 500);
  }
}
