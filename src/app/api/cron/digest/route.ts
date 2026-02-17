import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildDigestEmail, sendDigest } from '@/lib/digest-emails';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Get all enabled digest configs
  const { data: configs } = await supabase
    .from('digest_configs')
    .select('user_id, frequency')
    .eq('enabled', true);

  if (!configs || configs.length === 0) {
    return NextResponse.json({ message: 'No digest configs enabled', sent: 0 });
  }

  let sent = 0;
  let failed = 0;

  for (const config of configs) {
    try {
      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, email')
        .eq('id', config.user_id)
        .single();

      if (!profile?.email) continue;

      // Get assigned cards
      const { data: assignedCards } = await supabase
        .from('card_assignees')
        .select('cards(title, due_date, priority, lists(boards(name)))')
        .eq('user_id', config.user_id)
        .limit(20);

      // Get overdue cards
      const { data: overdueCards } = await supabase
        .from('card_assignees')
        .select('cards(title, due_date, lists(boards(name)))')
        .eq('user_id', config.user_id)
        .lt('cards.due_date', new Date().toISOString())
        .limit(10);

      const digestData = {
        userName: profile.display_name || 'Team Member',
        assignedCards: (assignedCards ?? []).map((a: any) => ({
          title: a.cards?.title ?? '',
          boardName: a.cards?.lists?.boards?.name ?? '',
          dueDate: a.cards?.due_date ?? null,
          priority: a.cards?.priority ?? 'none',
        })),
        overdueCards: (overdueCards ?? []).filter((o: any) => o.cards?.due_date).map((o: any) => ({
          title: o.cards?.title ?? '',
          boardName: o.cards?.lists?.boards?.name ?? '',
          dueDate: o.cards?.due_date ?? '',
        })),
        mentionedComments: [],
        completedCards: [],
      };

      const emailContent = buildDigestEmail(digestData);
      const success = await sendDigest(supabase, config.user_id, profile.email, emailContent);
      if (success) sent++;
      else failed++;
    } catch (err) {
      failed++;
      console.error(`[DigestCron] Failed for user ${config.user_id}:`, err);
    }
  }

  return NextResponse.json({ message: 'Digest cron complete', sent, failed });
}
