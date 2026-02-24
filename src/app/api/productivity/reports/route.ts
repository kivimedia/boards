import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getReportFiles, createReportFile } from '@/lib/whatsapp-advanced';

/**
 * GET /api/productivity/reports
 * List generated report files. Optional ?config_id filter.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);

  const configId = searchParams.get('config_id') || undefined;
  const limit = parseInt(searchParams.get('limit') || '20', 10) || 20;

  try {
    const files = await getReportFiles(supabase, configId, limit);
    return successResponse(files);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : 'Failed to load report files',
      500
    );
  }
}

interface GenerateReportBody {
  configId?: string;
  reportType?: string;
  format?: string;
  dateRangeStart: string;
  dateRangeEnd: string;
}

/**
 * POST /api/productivity/reports
 * Generate a new report file.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<GenerateReportBody>(request);
  if (!parsed.ok) return parsed.response;

  const { configId, reportType, format, dateRangeStart, dateRangeEnd } = parsed.body;

  if (!dateRangeStart) return errorResponse('dateRangeStart is required');
  if (!dateRangeEnd) return errorResponse('dateRangeEnd is required');

  const { supabase, userId } = auth.ctx;

  const file = await createReportFile(supabase, {
    configId,
    reportType: reportType || 'individual',
    format: format || 'pdf',
    dateRangeStart,
    dateRangeEnd,
    generatedBy: userId,
  });

  if (!file) return errorResponse('Failed to create report file', 500);
  return successResponse(file, 201);
}
