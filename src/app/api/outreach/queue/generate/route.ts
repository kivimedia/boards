import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { generateDailyBatch } from '@/lib/outreach/batch-scheduler';

/**
 * POST /api/outreach/queue/generate - Generate today's daily batch
 *
 * Body: {
 *   date?: string;      // YYYY-MM-DD, defaults to today
 *   dry_run?: boolean;   // Preview without saving
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: { date?: string; dry_run?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine, use defaults
  }

  try {
    const result = await generateDailyBatch(supabase, {
      userId,
      targetDate: body.date,
      isDryRun: body.dry_run,
    });

    return successResponse(result);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to generate batch', 500);
  }
}
