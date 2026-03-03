import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { enqueueJob } from '@/lib/outreach/orchestrator';

/**
 * POST /api/outreach/queue/send - Trigger SEND_BATCH job for approved batch
 *
 * Body: { batch_id: string }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: { batch_id: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.batch_id) {
    return errorResponse('batch_id is required', 400);
  }

  try {
    // Verify batch exists and is approved
    const { data: batch } = await supabase
      .from('li_daily_batches')
      .select('id, status, approved, batch_size')
      .eq('id', body.batch_id)
      .eq('user_id', userId)
      .single();

    if (!batch) return errorResponse('Batch not found', 404);
    if (batch.status !== 'approved' || !batch.approved) {
      return errorResponse('Batch must be approved before sending', 400);
    }

    // Check for active browser session
    const { data: session } = await supabase
      .from('li_browser_sessions')
      .select('id, status, health_status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (!session) {
      return errorResponse('No active browser session. Set up a session in Settings first.', 400);
    }

    if (session.health_status === 'logged_out' || session.health_status === 'blocked') {
      return errorResponse(`Browser session is ${session.health_status}. Re-authenticate first.`, 400);
    }

    // Check safety
    const { data: settings } = await supabase
      .from('li_settings')
      .select('pause_outreach, pause_reason')
      .eq('user_id', userId)
      .single();

    if (settings?.pause_outreach) {
      return errorResponse(`Outreach is paused: ${settings.pause_reason || 'Manual pause'}`, 400);
    }

    // Enqueue the SEND_BATCH job
    const jobId = await enqueueJob(supabase, userId, 'SEND_BATCH', { batch_id: body.batch_id }, 1);

    // Also create vps_jobs row for the VPS worker
    await supabase.from('vps_jobs').insert({
      user_id: userId,
      job_type: 'li:send_batch',
      status: 'pending',
      payload: { batch_id: body.batch_id, li_job_id: jobId },
    });

    return successResponse({
      job_id: jobId,
      batch_id: body.batch_id,
      batch_size: batch.batch_size,
      message: 'Send batch job enqueued',
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to enqueue send batch', 500);
  }
}
