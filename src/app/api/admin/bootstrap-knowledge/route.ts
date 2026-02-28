import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { findCardsNeedingReindex, indexCardBatch, generateBoardSummary, CardToIndex } from '@/lib/ai/knowledge-indexer';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/admin/bootstrap-knowledge
 * One-time bootstrap: indexes ALL cards and generates ALL board summaries.
 * Loops internally within the 300s Vercel limit, processing batches of 25.
 * Progress is visible via /api/settings/knowledge-status polling.
 * Auth: CRON_SECRET bearer token OR authenticated admin session.
 */
export async function POST(request: Request) {
  // Accept either CRON_SECRET or authenticated session
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const hasCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!hasCronAuth) {
    const userSupabase = createServerSupabaseClient();
    const { data: { session } } = await userSupabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: profile } = await userSupabase
      .from('profiles')
      .select('user_role')
      .eq('id', session.user.id)
      .single();
    if (profile?.user_role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const startTime = Date.now();
  const TIME_LIMIT = 230_000; // 230s, leave 70s buffer for response + cleanup
  const BATCH_SIZE = 50;

  let totalEmbedded = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let batches = 0;

  try {
    // Loop: keep finding unindexed cards and processing them until time runs out
    while (Date.now() - startTime < TIME_LIMIT) {
      // Use the RPC function which does a proper LEFT JOIN - no .in() overflow
      const unindexed = await findCardsNeedingReindex(supabase, BATCH_SIZE);

      if (unindexed.length === 0) break; // All cards indexed

      const result = await indexCardBatch(supabase, unindexed);
      totalEmbedded += result.embedded;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
      batches++;

      console.log(`[bootstrap] Batch ${batches}: ${result.embedded} embedded, ${result.skipped} skipped, ${result.errors} errors (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);

      // If entire batch was skipped/errored with nothing embedded, break to avoid infinite loop
      if (result.embedded === 0 && result.errors === 0) break;
    }

    // Board summaries are handled by the separate /api/cron/board-summaries endpoint
    const summariesGenerated = 0;

    // Check how many remain
    const { count: totalCards } = await supabase
      .from('cards')
      .select('id', { count: 'exact', head: true });
    const { count: indexedCount } = await supabase
      .from('knowledge_index_state')
      .select('entity_id', { count: 'exact', head: true })
      .eq('entity_type', 'card')
      .eq('status', 'indexed');

    const remaining = (totalCards || 0) - (indexedCount || 0);
    const duration = Date.now() - startTime;

    console.log(`[bootstrap] Done: ${totalEmbedded} embedded in ${batches} batches, ${summariesGenerated} summaries (${Math.round(duration / 1000)}s)`);

    return NextResponse.json({
      message: remaining > 0 ? 'Time limit reached, run again for more' : 'Bootstrap complete',
      batches,
      total_embedded: totalEmbedded,
      total_skipped: totalSkipped,
      total_errors: totalErrors,
      summaries_generated: summariesGenerated,
      remaining,
      duration_ms: duration,
    });
  } catch (err: any) {
    console.error('[bootstrap-knowledge] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Bootstrap error' },
      { status: 500 }
    );
  }
}
