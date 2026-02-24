import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getScoutCostReport, formatCostReport } from '@/lib/ai/scout-cost-tracker';

/**
 * GET /api/podcast/costs
 * Get scout pipeline cost report.
 * Query params: run_id, since, until, format (json|text)
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);

  const runId = searchParams.get('run_id') || undefined;
  const since = searchParams.get('since') || undefined;
  const until = searchParams.get('until') || undefined;
  const format = searchParams.get('format') || 'json';

  const report = await getScoutCostReport(supabase, { runId, since, until });

  if (format === 'text') {
    return new Response(formatCostReport(report), {
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return successResponse({ report });
}
