/**
 * Capacity Awareness Engine
 *
 * Checks Google Calendar + existing card event dates to determine
 * how busy a given date/weekend is, and whether a venue is "far."
 *
 * Used during lead triage and proposal generation to:
 *  - Flag "Busy Weekend" on leads for already-packed dates
 *  - Flag "Far Location" for venues outside the primary service area
 *  - Help Halley make scheduling decisions
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getValidAccessToken } from './google/token-manager';
import { getEventsAcrossCalendars } from './google/calendar';

interface CapacityInfo {
  date: string;
  dayOfWeek: string;
  isWeekend: boolean;
  calendarEventCount: number;
  bookedCardCount: number;
  totalCommitments: number;
  isBusy: boolean;
  cards: { id: string; title: string; venue_city: string | null }[];
  calendarEvents: { summary: string; start: string; end: string }[];
}

const BUSY_THRESHOLD = 2; // 2+ events on the same day = busy

// Cities considered "local" (no surcharge)
const LOCAL_CITIES = [
  'charlotte', 'concord', 'huntersville', 'cornelius', 'davidson',
  'mooresville', 'matthews', 'mint hill', 'indian trail', 'weddington',
  'waxhaw', 'pineville', 'fort mill', 'rock hill', 'gastonia',
  'belmont', 'mount holly', 'harrisburg', 'kannapolis',
];

/**
 * Get capacity info for a specific date.
 */
export async function getCapacityForDate(
  supabase: SupabaseClient,
  userId: string,
  date: string,
): Promise<CapacityInfo> {
  const targetDate = new Date(date);
  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  const dayOfWeek = targetDate.toLocaleDateString('en-US', { weekday: 'long' });
  const isWeekend = targetDate.getDay() === 0 || targetDate.getDay() === 6;

  // Check Google Calendar events
  let calendarEvents: { summary: string; start: string; end: string }[] = [];
  try {
    const accessToken = await getValidAccessToken(supabase, userId);
    if (accessToken) {
      // Get selected calendars
      const { data: integration } = await supabase
        .from('google_integrations')
        .select('selected_calendars')
        .eq('user_id', userId)
        .single();

      const calendarIds = (integration?.selected_calendars as string[]) || ['primary'];

      const events = await getEventsAcrossCalendars(
        accessToken,
        calendarIds,
        dayStart.toISOString(),
        dayEnd.toISOString(),
      );

      calendarEvents = events.map((e) => ({
        summary: e.summary || 'Busy',
        start: e.start?.dateTime || e.start?.date || '',
        end: e.end?.dateTime || e.end?.date || '',
      }));
    }
  } catch {
    // Google Calendar not connected, skip
  }

  // Check cards with events on this date
  const dateStr = targetDate.toISOString().split('T')[0];
  const { data: cards } = await supabase
    .from('cards')
    .select('id, title, venue_city')
    .gte('event_date', `${dateStr}T00:00:00`)
    .lte('event_date', `${dateStr}T23:59:59`);

  const bookedCards = (cards || []).map((c) => ({
    id: c.id,
    title: c.title,
    venue_city: c.venue_city,
  }));

  const totalCommitments = calendarEvents.length + bookedCards.length;

  return {
    date: dateStr,
    dayOfWeek,
    isWeekend,
    calendarEventCount: calendarEvents.length,
    bookedCardCount: bookedCards.length,
    totalCommitments,
    isBusy: totalCommitments >= BUSY_THRESHOLD,
    cards: bookedCards,
    calendarEvents,
  };
}

/**
 * Check if a city is considered "far" (outside the local service area).
 */
export function isFarLocation(city: string | null | undefined): boolean {
  if (!city) return false;
  return !LOCAL_CITIES.includes(city.toLowerCase().trim());
}

/**
 * Get capacity summary for a date range (e.g., a week).
 */
export async function getCapacityRange(
  supabase: SupabaseClient,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<CapacityInfo[]> {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const results: CapacityInfo[] = [];

  const current = new Date(start);
  while (current <= end) {
    const info = await getCapacityForDate(supabase, userId, current.toISOString());
    results.push(info);
    current.setDate(current.getDate() + 1);
  }

  return results;
}
