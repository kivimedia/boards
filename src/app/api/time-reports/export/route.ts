import { NextRequest } from 'next/server';
import {
  getAuthContext,
  errorResponse,
} from '@/lib/api-helpers';
import { getTimeReport, formatTimeEntriesForCSV } from '@/lib/time-tracking';

/**
 * GET /api/time-reports/export
 * Export time report as CSV.
 * Query params: start_date (required), end_date (required), user_id, board_id, client_id
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);

  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');

  if (!startDate) return errorResponse('start_date query param is required');
  if (!endDate) return errorResponse('end_date query param is required');

  const filters: {
    startDate: string;
    endDate: string;
    userId?: string;
    boardId?: string;
    clientId?: string;
  } = { startDate, endDate };

  const userId = searchParams.get('user_id');
  const boardId = searchParams.get('board_id');
  const clientId = searchParams.get('client_id');

  if (userId) filters.userId = userId;
  if (boardId) filters.boardId = boardId;
  if (clientId) filters.clientId = clientId;

  const report = await getTimeReport(supabase, filters);
  const csv = formatTimeEntriesForCSV(report.entries);

  const fileName = `time-report_${startDate}_${endDate}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
