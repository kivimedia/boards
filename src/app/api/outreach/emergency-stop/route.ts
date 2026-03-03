import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { emergencyStop } from '@/lib/outreach/linkedin-browser';

/**
 * POST /api/outreach/emergency-stop - Kill browser and pause outreach
 */
export async function POST() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  try {
    // Kill browser
    try {
      await emergencyStop();
    } catch {
      // Service might already be down
    }

    // Pause outreach
    await supabase
      .from('li_settings')
      .update({
        pause_outreach: true,
        pause_reason: 'Emergency stop activated',
      })
      .eq('user_id', userId);

    // Mark any active sessions as inactive
    await supabase
      .from('li_browser_sessions')
      .update({
        status: 'inactive',
        health_status: 'unknown',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('status', 'active');

    // Log the event
    await supabase.from('li_pipeline_events').insert({
      user_id: userId,
      lead_id: null,
      from_stage: null,
      to_stage: null,
      triggered_by: 'manual',
      notes: 'Emergency stop activated - browser killed, outreach paused',
    });

    return successResponse({
      stopped: true,
      message: 'Emergency stop activated. Browser killed and outreach paused.',
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to stop', 500);
  }
}
