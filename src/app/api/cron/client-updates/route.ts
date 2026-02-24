import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { gatherClientActivity } from '@/lib/client-activity-gatherer';
import { generateClientUpdate } from '@/lib/ai/client-update-generator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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

  let generated = 0;
  let autoScheduled = 0;
  let pendingApproval = 0;
  let sent = 0;
  let errors: string[] = [];

  // === PART 1: Send due updates ===
  const { data: dueUpdates } = await supabase
    .from('client_weekly_updates')
    .select('*, config:client_meeting_configs(send_to_contacts, client:clients(name, contacts))')
    .eq('status', 'scheduled')
    .lte('scheduled_send_at', new Date().toISOString());

  for (const update of (dueUpdates || [])) {
    const clientContacts = (update as any).config?.client?.contacts || [];
    const sendToFilter = (update as any).config?.send_to_contacts || [];
    const recipients = sendToFilter.length > 0
      ? clientContacts.filter((c: any) => sendToFilter.includes(c.email))
      : clientContacts;
    const emails = recipients.map((c: any) => c.email).filter(Boolean);

    if (emails.length === 0) {
      await supabase.from('client_weekly_updates')
        .update({ status: 'failed', error_message: 'No recipients' })
        .eq('id', update.id);
      continue;
    }

    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'ziv@dailycookie.co';
    const clientName = (update as any).config?.client?.name || 'Client';
    const messageIds: string[] = [];

    for (const email of emails) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject: `Weekly Update - ${clientName} - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
            html: update.ai_detailed_html || '<p>No content</p>',
          }),
        });
        if (res.ok) {
          const data = await res.json();
          messageIds.push(data.id);
        }
      } catch {}
    }

    if (messageIds.length > 0) {
      await supabase.from('client_weekly_updates')
        .update({ status: 'sent', sent_at: new Date().toISOString(), sent_to_emails: emails, resend_message_ids: messageIds })
        .eq('id', update.id);
      sent++;
    }
  }

  // === PART 2: Generate new updates for upcoming meetings ===
  const { data: configs } = await supabase
    .from('client_meeting_configs')
    .select('*')
    .eq('is_active', true);

  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  for (const config of (configs || [])) {
    try {
      // Find next matching event
      const { data: events } = await supabase
        .from('calendar_events')
        .select('google_event_id, title, start_time, event_link')
        .ilike('title', `%${config.calendar_event_keyword}%`)
        .gte('start_time', now.toISOString())
        .lte('start_time', in48h.toISOString())
        .order('start_time', { ascending: true })
        .limit(1);

      if (!events || events.length === 0) continue;
      const event = events[0];

      // Check if update already exists for this event
      const { data: existing } = await supabase
        .from('client_weekly_updates')
        .select('id')
        .eq('config_id', config.id)
        .eq('meeting_event_id', event.google_event_id)
        .limit(1);

      if (existing && existing.length > 0) continue;

      // Generate update
      const activityData = await gatherClientActivity(supabase, config.client_id);
      const generatedUpdate = await generateClientUpdate(supabase, activityData);

      const meetingTime = new Date(event.start_time);
      const offset = config.update_timing === '1_day_before' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
      const scheduledSendAt = new Date(meetingTime.getTime() - offset);

      const status = config.send_mode === 'auto_send' ? 'scheduled' : 'pending_approval';

      await supabase.from('client_weekly_updates').insert({
        client_id: config.client_id,
        config_id: config.id,
        meeting_event_id: event.google_event_id,
        meeting_time: event.start_time,
        period_start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        period_end: now.toISOString(),
        raw_activity: activityData.cards,
        ai_summary: generatedUpdate.summary,
        ai_detailed_html: generatedUpdate.detailed_html,
        ai_model_used: generatedUpdate.model_used,
        ai_tokens_used: generatedUpdate.tokens_used,
        status,
        scheduled_send_at: status === 'scheduled' ? scheduledSendAt.toISOString() : null,
      });

      generated++;
      if (status === 'scheduled') autoScheduled++;
      else pendingApproval++;

      // For pending_approval, create notification
      if (status === 'pending_approval') {
        // Get agency owner (first admin)
        const { data: admins } = await supabase
          .from('profiles')
          .select('id')
          .eq('role', 'admin')
          .limit(1);

        if (admins?.[0]) {
          await supabase.from('notifications').insert({
            user_id: admins[0].id,
            type: 'client_update_pending',
            title: `Weekly update needs approval`,
            body: `Update for ${activityData.client.name} is ready for review before their meeting.`,
            metadata: { client_id: config.client_id },
          });
        }
      }
    } catch (err: any) {
      errors.push(`${config.client_id}: ${err.message}`);
    }
  }

  return NextResponse.json({ generated, autoScheduled, pendingApproval, sent, errors: errors.length });
}
