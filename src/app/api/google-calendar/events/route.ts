import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '14', 10);

    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const { data: events, error } = await auth.ctx.supabase
      .from('calendar_events')
      .select('id, google_event_id, title, description, start_time, end_time, location, event_link, is_recurring, attendees')
      .gte('start_time', now.toISOString())
      .lte('start_time', future.toISOString())
      .order('start_time', { ascending: true });

    if (error) return errorResponse(error.message, 500);
    return successResponse(events || []);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}
