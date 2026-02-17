import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import {
  getScheduledReports,
  createScheduledReport,
} from '@/lib/productivity-analytics';

/**
 * GET /api/scheduled-reports
 * List scheduled reports. Optional query params: report_type, is_active
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);

  const reportType = searchParams.get('report_type') ?? undefined;
  const isActiveParam = searchParams.get('is_active');
  const isActive = isActiveParam !== null ? isActiveParam === 'true' : undefined;

  try {
    const reports = await getScheduledReports(supabase, { reportType, isActive });
    return successResponse(reports);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch scheduled reports';
    return errorResponse(message, 500);
  }
}

interface CreateScheduledReportBody {
  name: string;
  report_type: string;
  schedule: string;
  recipients: string[];
  config?: Record<string, unknown>;
}

/**
 * POST /api/scheduled-reports
 * Create a new scheduled report.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const parsed = await parseBody<CreateScheduledReportBody>(request);
  if (!parsed.ok) return parsed.response;

  const { name, report_type, schedule, recipients, config } = parsed.body;

  if (!name?.trim()) return errorResponse('name is required');
  if (!report_type?.trim()) return errorResponse('report_type is required');
  if (!schedule?.trim()) return errorResponse('schedule is required');
  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return errorResponse('recipients must be a non-empty array');
  }

  try {
    const report = await createScheduledReport(supabase, {
      name: name.trim(),
      reportType: report_type.trim(),
      schedule: schedule.trim(),
      recipients,
      config,
      createdBy: userId,
    });

    if (!report) return errorResponse('Failed to create scheduled report', 500);
    return successResponse(report, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create scheduled report';
    return errorResponse(message, 500);
  }
}
