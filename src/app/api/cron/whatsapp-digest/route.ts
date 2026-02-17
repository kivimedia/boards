import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getWhatsAppConfig,
  sendTextMessage,
  logOutboundMessage,
} from '@/lib/integrations/whatsapp-business-api';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/cron/whatsapp-digest
 * Hourly cron job that sends WhatsApp digests to users whose send_time matches
 * the current hour. Respects DND windows.
 *
 * Protected by CRON_SECRET bearer token.
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Check WhatsApp config
  const config = await getWhatsAppConfig(supabase);
  if (!config) {
    return NextResponse.json({
      message: 'WhatsApp not configured',
      sent: 0,
    });
  }

  const now = new Date();
  const currentHour = now.getUTCHours();

  try {
    // Find users with active digests whose send_time matches current hour
    const { data: digestConfigs } = await supabase
      .from('whatsapp_digest_config')
      .select('*, whatsapp_users(phone_number, profile_id, dnd_start, dnd_end)')
      .eq('is_active', true);

    if (!digestConfigs || digestConfigs.length === 0) {
      return NextResponse.json({
        message: 'No active digest configs',
        sent: 0,
      });
    }

    let sent = 0;
    let skipped = 0;

    for (const digestConfig of digestConfigs) {
      // Parse send_time (e.g., "08:00") and check if it matches current hour
      const sendTime = digestConfig.send_time ?? '08:00';
      const sendHour = parseInt(sendTime.split(':')[0], 10);
      if (sendHour !== currentHour) continue;

      const waUser = digestConfig.whatsapp_users as unknown as {
        phone_number: string;
        profile_id: string;
        dnd_start: string | null;
        dnd_end: string | null;
      };

      if (!waUser?.phone_number) continue;

      // Check DND window
      if (waUser.dnd_start && waUser.dnd_end) {
        const dndStartHour = parseInt(waUser.dnd_start.split(':')[0], 10);
        const dndEndHour = parseInt(waUser.dnd_end.split(':')[0], 10);

        const isInDND = dndStartHour <= dndEndHour
          ? currentHour >= dndStartHour && currentHour < dndEndHour
          : currentHour >= dndStartHour || currentHour < dndEndHour;

        if (isInDND) {
          skipped++;
          continue;
        }
      }

      // Build digest content
      const digestContent = await buildDigestForUser(supabase, waUser.profile_id);
      if (!digestContent) continue;

      // Send via WhatsApp Business API
      const result = await sendTextMessage(config, waUser.phone_number, digestContent);

      if (result.success) {
        await logOutboundMessage(supabase, {
          userId: waUser.profile_id,
          phone: waUser.phone_number,
          content: digestContent,
          messageType: 'digest',
          externalId: result.messageId,
        });
        sent++;
      }
    }

    return NextResponse.json({
      message: 'WhatsApp digest cron complete',
      sent,
      skipped,
      checked: digestConfigs.length,
    });
  } catch (err) {
    console.error('[WhatsAppDigest] Cron error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Digest cron failed' },
      { status: 500 }
    );
  }
}

/**
 * Build a digest message for a user.
 * Gathers overdue tasks, upcoming deadlines, and recent activity.
 */
async function buildDigestForUser(
  supabase: SupabaseClient,
  profileId: string
): Promise<string | null> {
  const now = new Date().toISOString();

  // Get overdue cards
  const { data: overdueCards } = await supabase
    .from('cards')
    .select('title, due_date')
    .contains('assignee_ids', [profileId])
    .lt('due_date', now)
    .not('due_date', 'is', null)
    .limit(5);

  // Get upcoming cards (next 3 days)
  const threeDaysLater = new Date();
  threeDaysLater.setDate(threeDaysLater.getDate() + 3);
  const { data: upcomingCards } = await supabase
    .from('cards')
    .select('title, due_date')
    .contains('assignee_ids', [profileId])
    .gte('due_date', now)
    .lte('due_date', threeDaysLater.toISOString())
    .not('due_date', 'is', null)
    .limit(5);

  const lines: string[] = ['📋 *Daily Digest*\n'];

  if (overdueCards && overdueCards.length > 0) {
    lines.push('🔴 *Overdue:*');
    for (const card of overdueCards) {
      lines.push(`  - ${card.title}`);
    }
    lines.push('');
  }

  if (upcomingCards && upcomingCards.length > 0) {
    lines.push('🟡 *Due Soon:*');
    for (const card of upcomingCards) {
      const dueDate = card.due_date ? new Date(card.due_date).toLocaleDateString() : '';
      lines.push(`  - ${card.title} (${dueDate})`);
    }
    lines.push('');
  }

  // If nothing to report, skip
  if (lines.length <= 1) return null;

  lines.push('_Have a productive day!_');

  return lines.join('\n');
}

// Need to import SupabaseClient for the helper
import type { SupabaseClient } from '@supabase/supabase-js';
