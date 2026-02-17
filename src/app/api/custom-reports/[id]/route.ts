import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getCustomReport, updateCustomReport, deleteCustomReport } from '@/lib/analytics';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const report = await getCustomReport(auth.ctx.supabase, id);

  if (!report) return errorResponse('Report not found', 404);
  return successResponse(report);
}

interface UpdateReportBody {
  name?: string;
  description?: string;
  config?: Record<string, unknown>;
  is_shared?: boolean;
  schedule?: string;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await parseBody<UpdateReportBody>(request);
  if (!body.ok) return body.response;

  const updates: Record<string, unknown> = {};
  if (body.body.name !== undefined) updates.name = body.body.name.trim();
  if (body.body.description !== undefined) updates.description = body.body.description;
  if (body.body.config !== undefined) updates.config = body.body.config;
  if (body.body.is_shared !== undefined) updates.is_shared = body.body.is_shared;
  if (body.body.schedule !== undefined) updates.schedule = body.body.schedule;

  if (Object.keys(updates).length === 0) return errorResponse('No updates provided');

  const report = await updateCustomReport(auth.ctx.supabase, id, updates);
  if (!report) return errorResponse('Failed to update report', 500);
  return successResponse(report);
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  await deleteCustomReport(auth.ctx.supabase, id);
  return successResponse({ deleted: true });
}
