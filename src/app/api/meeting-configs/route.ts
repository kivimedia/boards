import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/meeting-configs — List all active meeting configs with client names
 * Used by useMeetingPrep hook to match calendar events to clients
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.ctx.supabase
    .from('client_meeting_configs')
    .select('client_id, calendar_event_keyword, client:clients(name)')
    .eq('is_active', true);

  if (error) return errorResponse(error.message, 500);

  const configs = (data || []).map(c => ({
    client_id: c.client_id,
    calendar_event_keyword: c.calendar_event_keyword,
    client_name: (c.client as any)?.name || 'Client',
  }));

  return successResponse(configs);
}
