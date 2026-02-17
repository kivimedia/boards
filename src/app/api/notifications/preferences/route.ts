import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

const DEFAULT_PREFERENCES = {
  email_enabled: true,
  push_enabled: true,
  event_settings: {},
  quiet_hours_start: null,
  quiet_hours_end: null,
};

/**
 * GET /api/notifications/preferences
 * Get notification preferences for the current user.
 * If no preferences exist yet, return default preferences.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    // Return defaults if no preferences exist
    return successResponse({
      user_id: userId,
      ...DEFAULT_PREFERENCES,
    });
  }

  return successResponse(data);
}

interface UpdatePreferencesBody {
  email_enabled?: boolean;
  push_enabled?: boolean;
  event_settings?: Record<string, boolean>;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
}

/**
 * PUT /api/notifications/preferences
 * Create or update notification preferences. Upsert.
 */
export async function PUT(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdatePreferencesBody>(request);
  if (!body.ok) return body.response;

  const { supabase, userId } = auth.ctx;
  const { email_enabled, push_enabled, event_settings, quiet_hours_start, quiet_hours_end } = body.body;

  const upsertData: Record<string, unknown> = {
    user_id: userId,
  };

  if (email_enabled !== undefined) upsertData.email_enabled = email_enabled;
  if (push_enabled !== undefined) upsertData.push_enabled = push_enabled;
  if (event_settings !== undefined) upsertData.event_settings = event_settings;
  if (quiet_hours_start !== undefined) upsertData.quiet_hours_start = quiet_hours_start;
  if (quiet_hours_end !== undefined) upsertData.quiet_hours_end = quiet_hours_end;

  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert(upsertData, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}
