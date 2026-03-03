import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/outreach/settings - Get outreach settings
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // Get or create settings
  let { data: settings } = await supabase
    .from('li_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!settings) {
    const { data: created } = await supabase
      .from('li_settings')
      .insert({
        user_id: userId,
        warmup_week: 1,
        daily_send_limit: 25,
        weekly_send_limit: 100,
        budget_cap_usd: 500,
        budget_alert_pct: 80,
        shadow_mode: false,
        dry_run_mode: true,
        auto_generate_batches: false,
        pause_outreach: false,
      })
      .select()
      .single();
    settings = created;
  }

  return successResponse({ settings });
}

/**
 * PATCH /api/outreach/settings - Update outreach settings
 *
 * Body: Partial<LISettings>
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  // Whitelist allowed fields
  const allowed = [
    'warmup_week', 'daily_send_limit', 'weekly_send_limit',
    'budget_cap_usd', 'budget_alert_pct', 'shadow_mode', 'dry_run_mode',
    'auto_generate_batches', 'pause_outreach', 'pause_reason', 'slack_webhook_url',
    'auto_send_approved', 'min_delay_between_actions_ms', 'max_delay_between_actions_ms',
    'enable_response_detection', 'response_check_interval_hours',
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update', 400);
  }

  // If unpausing, clear the pause reason
  if (updates.pause_outreach === false) {
    updates.pause_reason = null;
  }

  const { data: settings, error } = await supabase
    .from('li_settings')
    .update(updates)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);

  return successResponse({ settings });
}
