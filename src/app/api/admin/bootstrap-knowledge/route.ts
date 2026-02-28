import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { findCardsNeedingReindex, indexCardBatch } from '@/lib/ai/knowledge-indexer';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/admin/bootstrap-knowledge
 * Indexes unindexed cards in small batches with strict time checks.
 * Each batch is 10 cards (~20s), with a hard stop at 250s.
 * Auth: CRON_SECRET bearer token OR authenticated admin session.
 */
export async function POST(request: Request) {
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
  const HARD_STOP = 250_000; // Stop starting new batches after 250s
  const BATCH_SIZE = 10; // Small batches (~20s each) so we never overshoot

  let totalEmbedded = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let batches = 0;

  try {
    while (Date.now() - startTime < HARD_STOP) {
      const unindexed = await findCardsNeedingReindex(supabase, BATCH_SIZE);
      if (unindexed.length === 0) break;

      const result = await indexCardBatch(supabase, unindexed);
      totalEmbedded += result.embedded;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
      batches++;

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`[bootstrap] Batch ${batches}: +${result.embedded} embedded, ${result.skipped} skipped, ${result.errors} errors (${elapsed}s)`);

      if (result.embedded === 0 && result.errors === 0) break;
    }

    const { count: totalCards } = await supabase
      .from('cards')
      .select('id', { count: 'exact', head: true });
    const { count: indexedCount } = await supabase
      .from('knowledge_index_state')
      .select('entity_id', { count: 'exact', head: true })
      .eq('entity_type', 'card')
      .eq('status', 'indexed');

    const remaining = (totalCards || 0) - (indexedCount || 0);

    return NextResponse.json({
      message: remaining > 0 ? 'Time limit reached, run again for more' : 'Bootstrap complete',
      batches,
      total_embedded: totalEmbedded,
      total_skipped: totalSkipped,
      total_errors: totalErrors,
      remaining,
      duration_ms: Date.now() - startTime,
    });
  } catch (err: any) {
    console.error('[bootstrap-knowledge] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Bootstrap error' },
      { status: 500 }
    );
  }
}
