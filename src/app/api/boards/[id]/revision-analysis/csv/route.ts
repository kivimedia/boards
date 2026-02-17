import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { getRevisionMetrics, formatRevisionMetricsCSV } from '@/lib/revision-analysis';

interface Params {
  params: { id: string };
}

/**
 * GET /api/boards/:id/revision-analysis/csv
 * Export revision metrics for a board as a downloadable CSV file.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const boardId = params.id;

  try {
    const metrics = await getRevisionMetrics(supabase, boardId);
    const csv = formatRevisionMetricsCSV(metrics);

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="revision-metrics-${boardId}.csv"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to export CSV';
    return errorResponse(message, 500);
  }
}
