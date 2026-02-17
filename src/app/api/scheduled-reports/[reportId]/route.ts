import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import {
  updateScheduledReport,
  deleteScheduledReport,
} from '@/lib/productivity-analytics';

interface Params {
  params: { reportId: string };
}

interface UpdateScheduledReportBody {
  name?: string;
  schedule?: string;
  recipients?: string[];
  config?: Record<string, unknown>;
  is_active?: boolean;
}

/**
 * PATCH /api/scheduled-reports/[reportId]
 * Update a scheduled report.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { reportId } = params;

  const parsed = await parseBody<UpdateScheduledReportBody>(request);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body;
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (!body.name.trim()) return errorResponse('name cannot be empty');
    updates.name = body.name.trim();
  }
  if (body.schedule !== undefined) {
    if (!body.schedule.trim()) return errorResponse('schedule cannot be empty');
    updates.schedule = body.schedule.trim();
  }
  if (body.recipients !== undefined) {
    if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
      return errorResponse('recipients must be a non-empty array');
    }
    updates.recipients = body.recipients;
  }
  if (body.config !== undefined) updates.config = body.config;
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  try {
    const report = await updateScheduledReport(supabase, reportId, updates);
    if (!report) return errorResponse('Scheduled report not found', 404);
    return successResponse(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update scheduled report';
    return errorResponse(message, 500);
  }
}

/**
 * DELETE /api/scheduled-reports/[reportId]
 * Delete a scheduled report.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { reportId } = params;

  try {
    await deleteScheduledReport(supabase, reportId);
    return successResponse({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete scheduled report';
    return errorResponse(message, 500);
  }
}
