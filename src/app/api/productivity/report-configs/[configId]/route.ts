import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { updateReportConfig, deleteReportConfig } from '@/lib/whatsapp-advanced';

interface Params {
  params: { configId: string };
}

interface UpdateReportConfigBody {
  name?: string;
  schedule?: string;
  recipients?: string[];
  include_sections?: string[];
  filters?: Record<string, unknown>;
  format?: string;
  is_active?: boolean;
}

/**
 * PATCH /api/productivity/report-configs/[configId]
 * Update a report configuration.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<UpdateReportConfigBody>(request);
  if (!parsed.ok) return parsed.response;

  const { supabase } = auth.ctx;
  const { configId } = params;

  const updates: Record<string, unknown> = {};
  if (parsed.body.name !== undefined) updates.name = parsed.body.name.trim();
  if (parsed.body.schedule !== undefined) updates.schedule = parsed.body.schedule;
  if (parsed.body.recipients !== undefined) updates.recipients = parsed.body.recipients;
  if (parsed.body.include_sections !== undefined) updates.include_sections = parsed.body.include_sections;
  if (parsed.body.filters !== undefined) updates.filters = parsed.body.filters;
  if (parsed.body.format !== undefined) updates.format = parsed.body.format;
  if (parsed.body.is_active !== undefined) updates.is_active = parsed.body.is_active;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const config = await updateReportConfig(supabase, configId, updates);

  if (!config) return errorResponse('Report config not found', 404);
  return successResponse(config);
}

/**
 * DELETE /api/productivity/report-configs/[configId]
 * Delete a report configuration.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { configId } = params;

  await deleteReportConfig(supabase, configId);
  return successResponse({ deleted: true });
}
