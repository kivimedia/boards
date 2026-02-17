import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getCustomReports, createCustomReport } from '@/lib/analytics';

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const reportType = searchParams.get('report_type') ?? undefined;
  const sharedParam = searchParams.get('shared');
  const shared = sharedParam !== null ? sharedParam === 'true' : undefined;

  const reports = await getCustomReports(auth.ctx.supabase, {
    reportType,
    createdBy: searchParams.get('created_by') ?? undefined,
    shared,
  });

  return successResponse(reports);
}

interface CreateReportBody {
  name: string;
  description?: string;
  report_type: string;
  config: Record<string, unknown>;
  is_shared?: boolean;
  schedule?: string;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateReportBody>(request);
  if (!body.ok) return body.response;

  const { name, report_type, config } = body.body;

  if (!name?.trim()) return errorResponse('Report name is required');
  if (!report_type) return errorResponse('Report type is required');
  if (!['burndown', 'velocity', 'cycle_time', 'workload', 'ai_effectiveness', 'custom'].includes(report_type)) {
    return errorResponse('Invalid report type');
  }
  if (!config || typeof config !== 'object') return errorResponse('Config is required');

  const report = await createCustomReport(auth.ctx.supabase, {
    name: name.trim(),
    description: body.body.description,
    reportType: report_type,
    config,
    createdBy: auth.ctx.userId,
    isShared: body.body.is_shared,
    schedule: body.body.schedule,
  });

  if (!report) return errorResponse('Failed to create report', 500);
  return successResponse(report, 201);
}
