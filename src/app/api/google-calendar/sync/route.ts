import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthContext } from '@/lib/api-helpers';
import { getValidAccessToken, fetchUpcomingEvents } from '@/lib/integrations/google-calendar';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  // Require authenticated user (not cron secret)
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: conn } = await supabase
    .from('google_calendar_connection')
    .select('*')
    .eq('is_active', true)
    .single();

  if (!conn) {
    return NextResponse.json({ error: 'No active calendar connection' }, { status: 400 });
  }

  try {
    const accessToken = await getValidAccessToken(supabase);
    if (!accessToken) {
      return NextResponse.json({ error: 'Failed to get access token' }, { status: 500 });
    }

    const events = await fetchUpcomingEvents(accessToken, conn.calendar_id, 14);

    let synced = 0;
    for (const event of events) {
      await supabase
        .from('calendar_events')
        .upsert({
          google_event_id: event.google_event_id,
          title: event.title,
          description: event.description,
          start_time: event.start_time,
          end_time: event.end_time,
          location: event.location,
          attendees: event.attendees,
          recurrence_rule: event.recurrence_rule,
          recurring_event_id: event.recurring_event_id,
          is_recurring: event.is_recurring,
          event_link: event.event_link,
          raw_data: event.raw_data,
          fetched_at: new Date().toISOString(),
        }, { onConflict: 'google_event_id' });
      synced++;
    }

    // Remove future events deleted from Google
    const now = new Date().toISOString();
    const syncedGoogleIds = events.map(e => e.google_event_id);
    let removedFuture = 0;
    if (syncedGoogleIds.length > 0) {
      const { count } = await supabase
        .from('calendar_events')
        .delete({ count: 'exact' })
        .gte('start_time', now)
        .not('google_event_id', 'in', `(${syncedGoogleIds.map(id => `"${id}"`).join(',')})`);
      removedFuture = count || 0;
    } else {
      const { count } = await supabase
        .from('calendar_events')
        .delete({ count: 'exact' })
        .gte('start_time', now);
      removedFuture = count || 0;
    }

    // Clean stale past events
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from('calendar_events')
      .delete()
      .lt('start_time', yesterday);

    // Update last sync
    await supabase
      .from('google_calendar_connection')
      .update({ last_sync_at: new Date().toISOString(), sync_error: null })
      .eq('id', conn.id);

    return NextResponse.json({ synced, removedFuture });
  } catch (err: any) {
    await supabase
      .from('google_calendar_connection')
      .update({ sync_error: err.message })
      .eq('id', conn.id);

    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
