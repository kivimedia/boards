import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getValidAccessToken, getIntegrationStatus } from '@/lib/google/token-manager';
import { getEventsAcrossCalendars } from '@/lib/google/calendar';

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { searchParams } = new URL(request.url);

  const timeMin = searchParams.get('timeMin');
  const timeMax = searchParams.get('timeMax');

  if (!timeMin || !timeMax) {
    return errorResponse('timeMin and timeMax query params required');
  }

  try {
    const accessToken = await getValidAccessToken(supabase, userId);
    if (!accessToken) return errorResponse('Google not connected', 401);

    const status = await getIntegrationStatus(supabase, userId);
    const calendarIds = status.selectedCalendars;

    if (!calendarIds || calendarIds.length === 0) {
      return successResponse({ events: [], message: 'No calendars selected' });
    }

    const events = await getEventsAcrossCalendars(accessToken, calendarIds, timeMin, timeMax);

    return successResponse({
      events: events.map((e) => ({
        id: e.id,
        calendarId: e.calendarId,
        summary: e.summary,
        location: e.location,
        start: e.start,
        end: e.end,
        status: e.status,
      })),
    });
  } catch (err) {
    return errorResponse((err as Error).message, 500);
  }
}
