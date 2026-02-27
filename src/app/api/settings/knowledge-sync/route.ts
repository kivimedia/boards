import { NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';
import { findCardsNeedingReindex, indexCardBatch, generateBoardSummary } from '@/lib/ai/knowledge-indexer';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/settings/knowledge-sync
 * Force sync: re-indexes cards and regenerates board summaries.
 * Body: { type: 'cards' | 'summaries' | 'all' }
 */
export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  let body: { type?: string } = {};
  try {
    body = await request.json();
  } catch {
    // default
  }

  const syncType = body.type || 'all';

  // Use service role for write operations to knowledge tables
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const startTime = Date.now();

  try {
    let cardResult = { processed: 0, embedded: 0, skipped: 0, errors: 0 };
    let summariesGenerated = 0;
    let summaryErrors = 0;

    if (syncType === 'cards' || syncType === 'all') {
      const cards = await findCardsNeedingReindex(supabase, 50);
      if (cards.length > 0) {
        cardResult = await indexCardBatch(supabase, cards);
      }
    }

    if (syncType === 'summaries' || syncType === 'all') {
      const { data: boards } = await supabase
        .from('boards')
        .select('id, name')
        .eq('is_archived', false);

      if (boards) {
        for (const board of boards) {
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

    return NextResponse.json({
      message: 'Sync complete',
      sync_type: syncType,
      cards: cardResult,
      summaries: { generated: summariesGenerated, errors: summaryErrors },
      duration_ms: Date.now() - startTime,
    });
  } catch (err: any) {
    console.error('[knowledge-sync] Error:', err);
    return errorResponse(err.message || 'Sync error', 500);
  }
}
