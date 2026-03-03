import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processJobQueue, cleanupStaleLocks } from '@/lib/outreach/orchestrator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/outreach-orchestrator - Process the li_jobs queue
 * Runs every 15 minutes via Vercel Cron. Processes up to 10 jobs per invocation.
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

  // Clean up stale locks from previous invocations that may have timed out
  const cleaned = await cleanupStaleLocks(supabase);

  // Process queue with 270s deadline (leaving 30s buffer for Vercel's 300s limit)
  const result = await processJobQueue(supabase, {
    workerId: `cron-${Date.now()}`,
    maxJobs: 10,
    deadlineMs: 270_000,
  });

  return NextResponse.json({
    stale_locks_cleaned: cleaned,
    processed: result.processed,
    succeeded: result.succeeded,
    failed: result.failed,
    needs_resume: result.needs_resume,
    results: result.results.map(r => ({
      jobId: r.jobId,
      jobType: r.jobType,
      status: r.status,
      durationMs: r.durationMs,
      error: r.error,
    })),
  });
}
