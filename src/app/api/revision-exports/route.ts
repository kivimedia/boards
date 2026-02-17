import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getRevisionExports, createRevisionExport } from '@/lib/revision-analysis';
import type { RevisionExportFormat } from '@/lib/types';

/**
 * GET /api/revision-exports
 * List all revision report exports, optionally filtered by board_id.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const boardId = searchParams.get('board_id') ?? undefined;

  try {
    const exports = await getRevisionExports(supabase, boardId);
    return successResponse(exports);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch exports';
    return errorResponse(message, 500);
  }
}

interface CreateExportBody {
  board_id?: string;
  department?: string;
  date_range_start: string;
  date_range_end: string;
  format: RevisionExportFormat;
}

const VALID_FORMATS: RevisionExportFormat[] = ['pdf', 'csv', 'json'];

/**
 * POST /api/revision-exports
 * Create a new revision report export request.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const body = await parseBody<CreateExportBody>(request);
  if (!body.ok) return body.response;

  const { board_id, department, date_range_start, date_range_end, format } = body.body;

  if (!date_range_start || !date_range_end) {
    return errorResponse('date_range_start and date_range_end are required');
  }

  if (!format || !VALID_FORMATS.includes(format)) {
    return errorResponse('format must be one of: pdf, csv, json');
  }

  try {
    const exportRecord = await createRevisionExport(supabase, {
      boardId: board_id,
      department,
      dateRangeStart: date_range_start,
      dateRangeEnd: date_range_end,
      format,
      generatedBy: userId,
    });

    if (!exportRecord) {
      return errorResponse('Failed to create export', 500);
    }

    return successResponse(exportRecord, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create export';
    return errorResponse(message, 500);
  }
}
