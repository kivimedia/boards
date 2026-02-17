import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { processDeferred } from '@/lib/integrations/direct-email';

/**
 * GET /api/podcast/cron
 * Cron job endpoint for podcast module tasks:
 * 1. Send deferred emails (those beyond Resend's 7-day schedule limit)
 * 2. Send notifications for new replies/bookings
 *
 * Expected to be called daily via Vercel Cron or external scheduler.
 * Secured by CRON_SECRET header.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results: Record<string, unknown> = {};

  // 1. Process deferred emails
  try {
    const emailResult = await processDeferred(supabase as any);
    results.deferred_emails = emailResult;
  } catch (err: any) {
    results.deferred_emails = { error: err.message };
  }

  // 2. Send reply/booking notifications
  try {
    const notifResult = await sendPendingNotifications(supabase);
    results.notifications = notifResult;
  } catch (err: any) {
    results.notifications = { error: err.message };
  }

  return NextResponse.json({ ok: true, results });
}

interface CandidateNotif {
  id: string;
  name: string;
  email: string | null;
  status: string;
  notes: string | null;
  updated_at: string;
}

/**
 * Check for recent status changes (replied, scheduled) and notify.
 */
async function sendPendingNotifications(
  supabase: SupabaseClient
): Promise<{ sent: number }> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Find candidates who recently replied or got scheduled
  const { data } = await supabase
    .from('pga_candidates')
    .select('id, name, email, status, notes, updated_at')
    .in('status', ['replied', 'scheduled'])
    .gte('updated_at', oneDayAgo)
    .order('updated_at', { ascending: false });

  const candidates = (data ?? []) as unknown as CandidateNotif[];
  if (candidates.length === 0) return { sent: 0 };

  // Check which ones we already notified
  const toNotify = candidates.filter(
    (c) => !(c.notes ?? '').includes('[notified]')
  );

  if (toNotify.length === 0) return { sent: 0 };

  // Send digest notification email
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { sent: 0 };

  const notifEmail = process.env.PODCAST_NOTIFICATION_EMAIL || 'ziv@dailycookie.co';
  const lines = toNotify.map(
    (c) =>
      `<li><strong>${c.name}</strong> ${c.email ? `(${c.email})` : ''} &mdash; <em>${c.status}</em></li>`
  );

  const html = `
    <h2>Podcast Guest Updates</h2>
    <p>${toNotify.length} candidate(s) have new activity:</p>
    <ul>${lines.join('')}</ul>
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/podcast/approval">View in Approval Queue</a></p>
  `;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? 'updates@agency.com',
        to: [notifEmail],
        subject: `Podcast: ${toNotify.length} guest update(s) — ${toNotify.map((c) => c.name).join(', ')}`,
        html,
      }),
    });

    // Mark as notified
    for (const c of toNotify) {
      await supabase
        .from('pga_candidates')
        .update({
          notes: (c.notes || '') + ' [notified]',
        } as any)
        .eq('id', c.id);
    }

    return { sent: toNotify.length };
  } catch {
    return { sent: 0 };
  }
}
