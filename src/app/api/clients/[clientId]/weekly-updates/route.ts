import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { gatherClientActivity } from '@/lib/client-activity-gatherer';
import { generateClientUpdate } from '@/lib/ai/client-update-generator';

interface Params { params: { clientId: string } }

/**
 * GET /api/clients/:clientId/weekly-updates — List recent updates
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);

  const { data, error } = await auth.ctx.supabase
    .from('client_weekly_updates')
    .select('id, client_id, meeting_time, period_start, period_end, ai_summary, status, scheduled_send_at, sent_at, sent_to_emails, created_at')
    .eq('client_id', params.clientId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return errorResponse(error.message, 500);
  return successResponse(data || []);
}

/**
 * POST /api/clients/:clientId/weekly-updates — Generate a new update
 */
export const maxDuration = 120;

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    // 1. Get config
    const { data: config } = await auth.ctx.supabase
      .from('client_meeting_configs')
      .select('*')
      .eq('client_id', params.clientId)
      .single();

    if (!config) return errorResponse('No meeting config for this client', 404);

    // 2. Gather activity
    const activityData = await gatherClientActivity(auth.ctx.supabase, params.clientId);

    // 3. Generate AI update
    const generated = await generateClientUpdate(auth.ctx.supabase, activityData);

    // 4. Insert record
    const now = new Date();
    const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const { data: update, error } = await auth.ctx.supabase
      .from('client_weekly_updates')
      .insert({
        client_id: params.clientId,
        config_id: config.id,
        period_start: periodStart.toISOString(),
        period_end: now.toISOString(),
        raw_activity: activityData.cards,
        ai_summary: generated.summary,
        ai_detailed_html: generated.detailed_html,
        ai_model_used: generated.model_used,
        ai_tokens_used: generated.tokens_used,
        status: 'draft',
        created_by: auth.ctx.userId,
      })
      .select()
      .single();

    if (error) return errorResponse(error.message, 500);
    return successResponse(update);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}
