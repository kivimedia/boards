import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateDailyBatch } from '@/lib/outreach/batch-scheduler';
import { notifyBatchGenerated } from '@/lib/outreach/slack-notify';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/outreach-batch - Auto-generate daily outreach batches
 * Runs daily at 6 AM UTC. Only generates if auto_generate_batches is enabled.
 */
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

  // Find all users with auto-generate enabled and outreach not paused
  const { data: settings } = await supabase
    .from('li_settings')
    .select('user_id')
    .eq('auto_generate_batches', true)
    .eq('pause_outreach', false);

  if (!settings || settings.length === 0) {
    return NextResponse.json({ message: 'No users with auto-generate enabled', generated: 0 });
  }

  const today = new Date().toISOString().split('T')[0];
  let generated = 0;
  const errors: string[] = [];

  for (const { user_id } of settings) {
    try {
      const result = await generateDailyBatch(supabase, {
        userId: user_id,
        targetDate: today,
      });

      if (result.batch) {
        generated++;
        await notifyBatchGenerated(supabase, user_id, {
          date: today,
          count: result.stats.generated_count,
          qualityPassed: result.stats.quality_passed,
          qualityFailed: result.stats.quality_failed,
        });
      }
    } catch (err) {
      errors.push(`User ${user_id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return NextResponse.json({
    message: `Generated ${generated} batches`,
    generated,
    errors: errors.length > 0 ? errors : undefined,
  });
}
