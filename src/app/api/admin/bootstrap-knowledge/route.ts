import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { indexCardBatch, generateBoardSummary, CardToIndex } from '@/lib/ai/knowledge-indexer';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/admin/bootstrap-knowledge
 * One-time bootstrap: indexes ALL cards and generates ALL board summaries.
 * Processes cards in batches of 25 within the 300s Vercel limit.
 * Call repeatedly until `remaining === 0`.
 * Auth: CRON_SECRET bearer token OR authenticated admin session.
 *
 * Body (optional): { batchSize?: number, skipSummaries?: boolean }
 */
export async function POST(request: Request) {
  // Accept either CRON_SECRET or authenticated session
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const hasCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!hasCronAuth) {
    // Fallback: check session auth
    const userSupabase = createServerSupabaseClient();
    const { data: { session } } = await userSupabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Verify admin role
    const { data: profile } = await userSupabase
      .from('profiles')
      .select('user_role')
      .eq('id', session.user.id)
      .single();
    if (profile?.user_role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
  }

  let body: { batchSize?: number; skipSummaries?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // defaults
  }

  const batchSize = Math.min(body.batchSize || 25, 50);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const startTime = Date.now();

  try {
    // Find ALL cards not yet indexed
    const { data: allCards } = await supabase
      .from('cards')
      .select('id, updated_at')
      .order('updated_at', { ascending: false });

    if (!allCards || allCards.length === 0) {
      return NextResponse.json({ message: 'No cards found', total: 0, remaining: 0 });
    }

    // Get already-indexed card IDs
    const { data: indexed } = await supabase
      .from('knowledge_index_state')
      .select('entity_id, last_content_hash')
      .eq('entity_type', 'card')
      .eq('status', 'indexed');

    const indexedSet = new Set((indexed || []).map((i: any) => i.entity_id));
    const unindexedCards: CardToIndex[] = allCards
      .filter((c: any) => !indexedSet.has(c.id))
      .slice(0, batchSize);

    let cardResult = { processed: 0, embedded: 0, skipped: 0, errors: 0 };
    if (unindexedCards.length > 0) {
      cardResult = await indexCardBatch(supabase, unindexedCards);
    }

    const remainingCards = allCards.filter((c: any) => !indexedSet.has(c.id)).length - unindexedCards.length;

    // Board summaries (only on last batch or if no cards left)
    let summariesGenerated = 0;
    let summaryErrors = 0;
    if (!body.skipSummaries && unindexedCards.length === 0) {
      const { data: boards } = await supabase
        .from('boards')
        .select('id, name')
        .eq('is_archived', false);

      if (boards) {
        for (const board of boards) {
          // Check time limit - leave 30s buffer
          if (Date.now() - startTime > 260_000) break;
          try {
            const result = await generateBoardSummary(supabase, board.id);
            if (result) summariesGenerated++;
            else summaryErrors++;
          } catch {
            summaryErrors++;
          }
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[bootstrap-knowledge] Batch done: ${cardResult.embedded} cards embedded, ${summariesGenerated} summaries in ${duration}ms`);

    return NextResponse.json({
      message: remainingCards > 0 ? 'Batch complete, call again for more' : 'Bootstrap complete',
      total_cards: allCards.length,
      indexed_this_batch: cardResult.embedded,
      skipped: cardResult.skipped,
      errors: cardResult.errors,
      remaining: Math.max(0, remainingCards),
      summaries_generated: summariesGenerated,
      summary_errors: summaryErrors,
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
