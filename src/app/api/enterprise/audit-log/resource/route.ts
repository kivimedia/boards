import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getAuditLogForResource } from '@/lib/enterprise';

/**
 * GET /api/enterprise/audit-log/resource
 * Retrieve audit log entries for a specific resource.
 * Query params: resource_type (required), resource_id (required), limit (optional)
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);

  const resourceType = searchParams.get('resource_type');
  const resourceId = searchParams.get('resource_id');
  const limitStr = searchParams.get('limit');
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;

  if (!resourceType) return errorResponse('resource_type is required');
  if (!resourceId) return errorResponse('resource_id is required');

  try {
    const entries = await getAuditLogForResource(
      supabase,
      resourceType,
      resourceId,
      limit && !isNaN(limit) ? limit : undefined
    );
    return successResponse(entries);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch audit log for resource';
    return errorResponse(message, 500);
  }
}
