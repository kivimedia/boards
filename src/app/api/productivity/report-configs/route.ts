import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getReportConfigs, createReportConfig } from '@/lib/whatsapp-advanced';
import type { ProductivityReportType, ProductivityReportFormat } from '@/lib/types';

/**
 * GET /api/productivity/report-configs
 * List the current user's report configurations.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  try {
    const configs = await getReportConfigs(supabase, userId);
    return successResponse(configs);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : 'Failed to load report configs',
      500
    );
  }
}

interface CreateReportConfigBody {
  name: string;
  reportType: ProductivityReportType;
  schedule?: string;
  recipients: string[];
  format?: ProductivityReportFormat;
  includeSections?: string[];
  filters?: Record<string, unknown>;
}

/**
 * POST /api/productivity/report-configs
 * Create a new report configuration.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<CreateReportConfigBody>(request);
  if (!parsed.ok) return parsed.response;

  const { name, reportType, schedule, recipients, format, includeSections, filters } = parsed.body;

  if (!name?.trim()) return errorResponse('name is required');
  if (!reportType) return errorResponse('reportType is required');
  if (!recipients || !Array.isArray(recipients)) return errorResponse('recipients array is required');

  const { supabase, userId } = auth.ctx;

  const config = await createReportConfig(supabase, {
    name: name.trim(),
    reportType,
    schedule,
    recipients,
    format,
    includeSections,
    filters,
    createdBy: userId,
  });

  if (!config) return errorResponse('Failed to create report config', 500);
  return successResponse(config, 201);
}
