import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import {
  computeBoardRevisionMetrics,
  storeRevisionMetrics,
} from '@/lib/revision-analysis';

interface Params {
  params: { id: string };
}

/**
 * GET /api/boards/:id/revision-analysis
 * Compute and return board revision analysis with optional date range filters.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const boardId = params.id;

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('start_date') ?? undefined;
  const endDate = searchParams.get('end_date') ?? undefined;

  try {
    const analysis = await computeBoardRevisionMetrics(supabase, boardId, startDate, endDate);
    return successResponse(analysis);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to compute revision analysis';
    return errorResponse(message, 500);
  }
}

interface ComputeBody {
  start_date?: string;
  end_date?: string;
}

/**
 * POST /api/boards/:id/revision-analysis
 * Compute revision metrics and store them in the database.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const boardId = params.id;

  const body = await parseBody<ComputeBody>(request);
  if (!body.ok) return body.response;

  const { start_date, end_date } = body.body;

  try {
    const analysis = await computeBoardRevisionMetrics(supabase, boardId, start_date, end_date);
    await storeRevisionMetrics(supabase, analysis.cards);

    return successResponse(analysis, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to compute and store revision metrics';
    return errorResponse(message, 500);
  }
}
