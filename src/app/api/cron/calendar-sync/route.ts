import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken, fetchUpcomingEvents } from '@/lib/integrations/google-calendar';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Get active connection
  const { data: conn } = await supabase
    .from('google_calendar_connection')
    .select('*')
    .eq('is_active', true)
    .single();

  if (!conn) {
    return NextResponse.json({ message: 'No active calendar connection', synced: 0 });
  }

  try {
    const accessToken = await getValidAccessToken(supabase);
    if (!accessToken) {
      return NextResponse.json({ error: 'Failed to get access token' }, { status: 500 });
    }

    const events = await fetchUpcomingEvents(accessToken, conn.calendar_id, 14);

    let synced = 0;
    let rescheduled = 0;

    for (const event of events) {
      // Check if event already exists (for detecting time changes)
      const { data: existing } = await supabase
        .from('calendar_events')
        .select('id, start_time')
        .eq('google_event_id', event.google_event_id)
        .single();

      // Detect time change
      if (existing && existing.start_time !== event.start_time) {
        // Meeting moved — find affected weekly updates
        const { data: configs } = await supabase
          .from('client_meeting_configs')
          .select('id, client_id, update_timing')
          .eq('is_active', true);

        for (const config of (configs || [])) {
          // Check if keyword matches this event title
          const { data: configData } = await supabase
            .from('client_meeting_configs')
            .select('calendar_event_keyword')
            .eq('id', config.id)
            .single();

          if (configData && event.title.toLowerCase().includes(configData.calendar_event_keyword.toLowerCase())) {
            // Recalculate scheduled_send_at for pending updates
            const offset = config.update_timing === '1_day_before' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
            const newSendAt = new Date(new Date(event.start_time).getTime() - offset);

            await supabase
              .from('client_weekly_updates')
              .update({
                scheduled_send_at: newSendAt.toISOString(),
                meeting_time: event.start_time,
                meeting_event_id: event.google_event_id,
              })
              .eq('config_id', config.id)
              .in('status', ['scheduled', 'approved']);

            rescheduled++;
          }
        }
      }

      // Upsert event
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

    // Clean up stale events (past events older than 1 day)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: deleted } = await supabase
      .from('calendar_events')
      .delete({ count: 'exact' })
      .lt('start_time', yesterday);

    // Update last sync time
    await supabase
      .from('google_calendar_connection')
      .update({ last_sync_at: new Date().toISOString(), sync_error: null })
      .eq('id', conn.id);

    return NextResponse.json({ synced, rescheduled, deleted: deleted || 0 });
  } catch (err: any) {
    await supabase
      .from('google_calendar_connection')
      .update({ sync_error: err.message })
      .eq('id', conn.id);

    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
