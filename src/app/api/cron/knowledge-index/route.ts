import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findCardsNeedingReindex, indexCardBatch } from '@/lib/ai/knowledge-indexer';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/knowledge-index
 * Background cron that indexes changed cards into the knowledge embedding store.
 * Runs every 2 hours. Processes up to 50 cards per run.
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

  const startTime = Date.now();

  try {
    // Find cards that need indexing
    const cards = await findCardsNeedingReindex(supabase, 200);

    if (cards.length === 0) {
      return NextResponse.json({
        message: 'No cards need indexing',
        processed: 0,
        duration_ms: Date.now() - startTime,
      });
    }

    // Index the batch
    const result = await indexCardBatch(supabase, cards);

    const duration = Date.now() - startTime;
    console.log(`[knowledge-index] Done: ${result.embedded} embedded, ${result.skipped} skipped, ${result.errors} errors in ${duration}ms`);

    return NextResponse.json({
      message: 'Knowledge index updated',
      ...result,
      duration_ms: duration,
    });
  } catch (err: any) {
    console.error('[knowledge-index] Cron error:', err);
    return NextResponse.json(
      { error: err.message || 'Knowledge index error' },
      { status: 500 }
    );
  }
}
