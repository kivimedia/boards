import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/podcast/webhooks/instantly
 * Webhook endpoint for Instantly.io campaign events.
 * Tracks opens, clicks, replies, and bounces.
 *
 * Instantly sends events for: email_sent, email_opened, link_clicked, reply_received, bounced
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventType = body.event_type ?? body.event ?? body.type;
    const campaignId = body.campaign_id;
    const leadEmail = body.lead_email ?? body.email ?? body.lead?.email;

    if (!campaignId || !eventType) {
      console.log('[Webhook/Instantly] Missing campaign_id or event_type:', JSON.stringify(body).slice(0, 500));
      return NextResponse.json({ ok: true, message: 'Missing required fields' });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Find the email sequence by campaign ID
    const { data: sequence } = await supabase
      .from('pga_email_sequences')
      .select('id, candidate_id, emails')
      .eq('instantly_campaign_id', campaignId)
      .maybeSingle();

    if (!sequence) {
      console.log(`[Webhook/Instantly] No sequence found for campaign ${campaignId}`);
      return NextResponse.json({ ok: true, message: 'No matching sequence' });
    }

    const now = new Date().toISOString();
    const emails = (sequence.emails ?? []) as Array<Record<string, unknown>>;

    switch (eventType) {
      case 'email_sent': {
        // Mark the appropriate step as sent
        const step = body.step ?? body.sequence_step ?? 1;
        const idx = emails.findIndex((e: any) => e.step === step);
        if (idx >= 0) {
          emails[idx] = { ...emails[idx], sent_at: now };
          await supabase
            .from('pga_email_sequences')
            .update({ emails, status: 'active', updated_at: now })
            .eq('id', sequence.id);
        }
        break;
      }

      case 'email_opened': {
        // Mark opened on the most recent sent email
        const sentEmails = emails.filter((e: any) => e.sent_at && !e.opened_at);
        if (sentEmails.length > 0) {
          const lastSent = sentEmails[sentEmails.length - 1];
          const idx = emails.indexOf(lastSent);
          emails[idx] = { ...emails[idx], opened_at: now };
          await supabase
            .from('pga_email_sequences')
            .update({ emails, updated_at: now })
            .eq('id', sequence.id);
        }
        break;
      }

      case 'link_clicked': {
        // Mark clicked on the most recent opened email
        const openedEmails = emails.filter((e: any) => e.opened_at && !e.clicked_at);
        if (openedEmails.length > 0) {
          const lastOpened = openedEmails[openedEmails.length - 1];
          const idx = emails.indexOf(lastOpened);
          emails[idx] = { ...emails[idx], clicked_at: now };
          await supabase
            .from('pga_email_sequences')
            .update({ emails, updated_at: now })
            .eq('id', sequence.id);
        }
        break;
      }

      case 'reply_received': {
        // Update candidate status to 'replied'
        await supabase
          .from('pga_candidates')
          .update({ status: 'replied', updated_at: now })
          .eq('id', sequence.candidate_id)
          .eq('status', 'outreach_active');

        // Pause sequence (don't send more emails)
        await supabase
          .from('pga_email_sequences')
          .update({ status: 'paused', updated_at: now })
          .eq('id', sequence.id);

        break;
      }

      case 'bounced':
      case 'unsubscribed': {
        // Stop sequence
        await supabase
          .from('pga_email_sequences')
          .update({ status: 'stopped', updated_at: now })
          .eq('id', sequence.id);

        // Mark email as unverified
        await supabase
          .from('pga_candidates')
          .update({ email_verified: false, updated_at: now })
          .eq('id', sequence.candidate_id);

        break;
      }
    }

    console.log(`[Webhook/Instantly] ${eventType} for campaign ${campaignId}`);
    return NextResponse.json({ ok: true, event: eventType });
  } catch (err: any) {
    console.error('[Webhook/Instantly] Error:', err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
