import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildMeetingPrep } from '@/lib/meeting-prep-builder';
import { getSubscriptions, sendPush, buildPushPayload } from '@/lib/push-notifications';

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

  const now = new Date();
  const in10min = new Date(now.getTime() + 10 * 60 * 1000);

  // Find upcoming events in the next 10 minutes
  const { data: upcomingEvents } = await supabase
    .from('calendar_events')
    .select('google_event_id, title, start_time, end_time, event_link')
    .gte('start_time', now.toISOString())
    .lte('start_time', in10min.toISOString());

  if (!upcomingEvents || upcomingEvents.length === 0) {
    return NextResponse.json({ message: 'No upcoming meetings', preps_created: 0 });
  }

  // Get all active configs
  const { data: configs } = await supabase
    .from('client_meeting_configs')
    .select('id, client_id, calendar_event_keyword, client:clients(name)')
    .eq('is_active', true);

  let prepsCreated = 0;
  let notificationsSent = 0;

  for (const event of upcomingEvents) {
    // Match event to client configs
    for (const config of (configs || [])) {
      if (!event.title.toLowerCase().includes(config.calendar_event_keyword.toLowerCase())) continue;

      // Check if session already exists
      const { data: existingSession } = await supabase
        .from('meeting_prep_sessions')
        .select('id')
        .eq('calendar_event_id', event.google_event_id)
        .limit(1);

      if (existingSession && existingSession.length > 0) continue;

      // Build prep data
      try {
        const prep = await buildMeetingPrep(
          supabase,
          config.client_id,
          event.title,
          event.start_time,
          event.event_link
        );

        // Insert session
        await supabase.from('meeting_prep_sessions').insert({
          client_id: config.client_id,
          calendar_event_id: event.google_event_id,
          meeting_time: event.start_time,
          meeting_title: event.title,
          executive_summary: prep.executive_summary,
          tickets_snapshot: prep.tickets,
          last_update_id: prep.last_update?.id || null,
        });

        prepsCreated++;

        // Send push notification + in-app notification to admin
        const clientName = (config as any).client?.name || 'Client';
        const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin').limit(3);

        for (const admin of (admins || [])) {
          // Push notification
          const subs = await getSubscriptions(supabase, admin.id);
          if (subs.length > 0) {
            const payload = buildPushPayload(
              `Meeting in 5 minutes`,
              `Meeting with ${clientName} starts soon. Tap to prepare.`,
              `/board?meeting_prep=${config.client_id}`
            );
            await sendPush(supabase, subs, payload);
            notificationsSent++;
          }

          // In-app notification
          await supabase.from('notifications').insert({
            user_id: admin.id,
            type: 'meeting_prep',
            title: `Meeting with ${clientName} starting soon`,
            body: `Your meeting starts at ${new Date(event.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}. Tap to see your prep.`,
            metadata: { client_id: config.client_id, event_id: event.google_event_id },
          });
        }
      } catch (err: any) {
        console.error(`[MeetingPrep] Failed for client ${config.client_id}:`, err);
      }
    }
  }

  return NextResponse.json({ preps_created: prepsCreated, notifications_sent: notificationsSent });
}
