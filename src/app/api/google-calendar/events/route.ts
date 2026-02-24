import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getValidAccessToken, fetchUpcomingEvents } from '@/lib/integrations/google-calendar';

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '30', 10);

    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    // Try cached events first
    const { data: cached } = await auth.ctx.supabase
      .from('calendar_events')
      .select('id, google_event_id, title, description, start_time, end_time, location, event_link, is_recurring, attendees')
      .gte('start_time', now.toISOString())
      .lte('start_time', future.toISOString())
      .order('start_time', { ascending: true });

    if (cached && cached.length > 0) {
      return successResponse(cached);
    }

    // No cache — fetch live from Google Calendar
    const accessToken = await getValidAccessToken(auth.ctx.supabase);
    if (!accessToken) {
      return successResponse([]);
    }

    const { data: conn } = await auth.ctx.supabase
      .from('google_calendar_connection')
      .select('calendar_id')
      .eq('is_active', true)
      .single();

    const calendarId = conn?.calendar_id || 'primary';
    const events = await fetchUpcomingEvents(accessToken, calendarId, days);

    return successResponse(events.map(e => ({
      id: e.google_event_id,
      google_event_id: e.google_event_id,
      title: e.title,
      description: e.description,
      start_time: e.start_time,
      end_time: e.end_time,
      location: e.location,
      event_link: e.event_link,
      is_recurring: e.is_recurring,
      attendees: e.attendees,
    })));
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}
