import { OAuth2Client } from 'google-auth-library';
import { SupabaseClient } from '@supabase/supabase-js';
import { encryptToHex, decryptFromHex } from '../encryption';

// ============================================================================
// GOOGLE CALENDAR OAUTH2 + API CLIENT
// ============================================================================

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

export interface GoogleCalendarEvent {
  google_event_id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  location: string | null;
  attendees: { email: string; name?: string; responseStatus?: string }[];
  recurrence_rule: string | null;
  recurring_event_id: string | null;
  is_recurring: boolean;
  event_link: string | null;
  raw_data: Record<string, unknown>;
}

function getOAuth2Client(redirectUri?: string): OAuth2Client {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET must be set');
  }
  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

/**
 * Generate the Google OAuth2 consent URL.
 */
export function getOAuthUrl(redirectUri: string): string {
  const client = getOAuth2Client(redirectUri);
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent to always get refresh_token
    include_granted_scopes: true,
  });
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  email: string;
}> {
  const client = getOAuth2Client(redirectUri);
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Failed to obtain tokens from Google');
  }

  // Get the user's email from the token info
  client.setCredentials(tokens);
  const tokenInfo = await client.getTokenInfo(tokens.access_token);

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : 3600,
    email: tokenInfo.email || 'unknown',
  };
}

/**
 * Refresh an access token using an encrypted refresh token.
 */
export async function refreshAccessToken(
  refreshTokenEncrypted: string
): Promise<{ access_token: string; expires_at: Date }> {
  const refreshToken = decryptFromHex(refreshTokenEncrypted);
  const client = getOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await client.refreshAccessToken();
  if (!credentials.access_token) {
    throw new Error('Failed to refresh Google access token');
  }

  const expiresAt = credentials.expiry_date
    ? new Date(credentials.expiry_date)
    : new Date(Date.now() + 3600 * 1000);

  return {
    access_token: credentials.access_token,
    expires_at: expiresAt,
  };
}

/**
 * Get a valid access token, refreshing if expired.
 * Reads from google_calendar_connection table.
 */
export async function getValidAccessToken(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data: conn } = await supabase
    .from('google_calendar_connection')
    .select('*')
    .eq('is_active', true)
    .single();

  if (!conn) return null;

  // Check if current token is still valid (with 5-min buffer)
  if (conn.access_token_encrypted && conn.token_expires_at) {
    const expiresAt = new Date(conn.token_expires_at);
    if (expiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
      try {
        return decryptFromHex(conn.access_token_encrypted);
      } catch {
        // Token decrypt failed, will refresh below
      }
    }
  }

  // Refresh the token
  try {
    const { access_token, expires_at } = await refreshAccessToken(conn.refresh_token_encrypted);

    // Update cached token in DB
    await supabase
      .from('google_calendar_connection')
      .update({
        access_token_encrypted: encryptToHex(access_token),
        token_expires_at: expires_at.toISOString(),
        sync_error: null,
      })
      .eq('id', conn.id);

    return access_token;
  } catch (err: any) {
    // Token refresh failed — likely revoked
    await supabase
      .from('google_calendar_connection')
      .update({ sync_error: `Token refresh failed: ${err.message}` })
      .eq('id', conn.id);
    return null;
  }
}

/**
 * Fetch upcoming events from Google Calendar API.
 */
export async function fetchUpcomingEvents(
  accessToken: string,
  calendarId: string,
  daysAhead: number
): Promise<GoogleCalendarEvent[]> {
  const now = new Date();
  const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: future.toISOString(),
    singleEvents: 'true', // Expand recurring events into instances
    orderBy: 'startTime',
    maxResults: '250',
  });

  const res = await fetch(
    `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar API ${res.status}: ${text}`);
  }

  const data = await res.json();
  const items: any[] = data.items || [];

  return items
    .filter((e: any) => e.status !== 'cancelled')
    .filter((e: any) => e.start?.dateTime) // Skip all-day events
    .map((e: any): GoogleCalendarEvent => ({
      google_event_id: e.id,
      title: e.summary || '(No title)',
      description: e.description || null,
      start_time: e.start.dateTime,
      end_time: e.end?.dateTime || e.start.dateTime,
      location: e.location || null,
      attendees: (e.attendees || []).map((a: any) => ({
        email: a.email,
        name: a.displayName,
        responseStatus: a.responseStatus,
      })),
      recurrence_rule: e.recurrence?.[0] || null,
      recurring_event_id: e.recurringEventId || null,
      is_recurring: !!e.recurringEventId,
      event_link: e.hangoutLink || e.conferenceData?.entryPoints?.[0]?.uri || null,
      raw_data: e,
    }));
}

/**
 * Get the active calendar connection info (no tokens).
 */
export async function getConnectionStatus(
  supabase: SupabaseClient
): Promise<{
  connected: boolean;
  email: string | null;
  calendarId: string | null;
  lastSyncAt: string | null;
  syncError: string | null;
}> {
  const { data: conn } = await supabase
    .from('google_calendar_connection')
    .select('google_email, calendar_id, last_sync_at, sync_error')
    .eq('is_active', true)
    .single();

  if (!conn) {
    return { connected: false, email: null, calendarId: null, lastSyncAt: null, syncError: null };
  }

  return {
    connected: true,
    email: conn.google_email,
    calendarId: conn.calendar_id,
    lastSyncAt: conn.last_sync_at,
    syncError: conn.sync_error,
  };
}
