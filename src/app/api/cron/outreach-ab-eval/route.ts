import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { evaluateAllTests } from '@/lib/outreach/ab-test-engine';
import { notifyABTestResult } from '@/lib/outreach/slack-notify';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/outreach-ab-eval - Evaluate running A/B tests
 * Runs weekly. Checks all running tests and updates their status.
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

  // Find all users with running A/B tests
  const { data: activeTests } = await supabase
    .from('li_ab_tests')
    .select('user_id')
    .in('status', ['running', 'insufficient_data']);

  if (!activeTests || activeTests.length === 0) {
    return NextResponse.json({ message: 'No active A/B tests', evaluated: 0 });
  }

  const userIds = Array.from(new Set(activeTests.map(t => t.user_id)));
  let evaluated = 0;
  const errors: string[] = [];

  for (const userId of userIds) {
    try {
      const results = await evaluateAllTests(supabase, userId);
      evaluated += results.length;

      // Notify for completed tests
      for (const result of results) {
        if (result.status !== 'running' && result.status !== 'insufficient_data') {
          await notifyABTestResult(supabase, userId, {
            templateNumber: 0, // Will be resolved from test data
            winner: result.winner,
            status: result.status,
          });
        }
      }
    } catch (err) {
      errors.push(`User ${userId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return NextResponse.json({
    message: `Evaluated ${evaluated} tests across ${userIds.length} users`,
    evaluated,
    errors: errors.length > 0 ? errors : undefined,
  });
}
