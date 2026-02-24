/**
 * Google Calendar API helpers using raw fetch (no npm dependency).
 *
 * All functions take a pre-validated access token obtained via token-manager.ts.
 */

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

export interface GoogleCalendar {
  id: string;
  summary: string;
  description?: string;
  timeZone?: string;
  colorId?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  primary?: boolean;
  accessRole: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  status: string;
  htmlLink?: string;
  colorId?: string;
  creator?: { email: string; displayName?: string };
  organizer?: { email: string; displayName?: string };
}

interface CalendarListResponse {
  items: GoogleCalendar[];
  nextPageToken?: string;
}

interface EventListResponse {
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
  timeZone?: string;
}

async function calendarFetch<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${CALENDAR_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Calendar API ${path} failed: ${res.status} ${text}`);
  }

  return res.json();
}

/**
 * List all calendars visible to the user.
 */
export async function listCalendars(accessToken: string): Promise<GoogleCalendar[]> {
  const calendars: GoogleCalendar[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ minAccessRole: 'reader' });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await calendarFetch<CalendarListResponse>(
      accessToken,
      `/users/me/calendarList?${params}`,
    );
    calendars.push(...data.items);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return calendars;
}

/**
 * Get events from a single calendar within a date range.
 */
export async function getEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string, // ISO 8601
  timeMax: string, // ISO 8601
  maxResults = 100,
): Promise<GoogleCalendarEvent[]> {
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      maxResults: maxResults.toString(),
      singleEvents: 'true',
      orderBy: 'startTime',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const data = await calendarFetch<EventListResponse>(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    );
    events.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return events;
}

/**
 * Get events across multiple calendars for a date range.
 * Returns a flat array sorted by start time.
 */
export async function getEventsAcrossCalendars(
  accessToken: string,
  calendarIds: string[],
  timeMin: string,
  timeMax: string,
): Promise<(GoogleCalendarEvent & { calendarId: string })[]> {
  const results = await Promise.all(
    calendarIds.map(async (calId) => {
      const events = await getEvents(accessToken, calId, timeMin, timeMax);
      return events.map((e) => ({ ...e, calendarId: calId }));
    }),
  );

  return results
    .flat()
    .sort((a, b) => {
      const aTime = a.start.dateTime || a.start.date || '';
      const bTime = b.start.dateTime || b.start.date || '';
      return aTime.localeCompare(bTime);
    });
}
