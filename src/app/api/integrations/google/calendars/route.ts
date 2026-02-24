import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getValidAccessToken, getIntegrationStatus, updateSelectedCalendars } from '@/lib/google/token-manager';
import { listCalendars } from '@/lib/google/calendar';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  try {
    const accessToken = await getValidAccessToken(supabase, userId);
    if (!accessToken) return errorResponse('Google not connected', 401);

    const calendars = await listCalendars(accessToken);
    const status = await getIntegrationStatus(supabase, userId);

    return successResponse({
      calendars: calendars.map((c) => ({
        id: c.id,
        summary: c.summary,
        description: c.description,
        primary: c.primary,
        backgroundColor: c.backgroundColor,
        selected: status.selectedCalendars?.includes(c.id) ?? c.primary ?? false,
      })),
    });
  } catch (err) {
    return errorResponse((err as Error).message, 500);
  }
}

interface UpdateCalendarsBody {
  calendarIds: string[];
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateCalendarsBody>(request);
  if (!body.ok) return body.response;

  const { supabase, userId } = auth.ctx;

  try {
    if (!Array.isArray(body.body.calendarIds)) {
      return errorResponse('calendarIds must be an array');
    }

    await updateSelectedCalendars(supabase, userId, body.body.calendarIds);
    return successResponse({ updated: true });
  } catch (err) {
    return errorResponse((err as Error).message, 500);
  }
}
