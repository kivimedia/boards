import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateBoardSummary } from '@/lib/ai/knowledge-indexer';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/board-summaries
 * Background cron that generates AI summaries for all boards.
 * Runs every 6 hours. Uses Haiku for cost efficiency.
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
    // Fetch all non-archived boards
    const { data: boards } = await supabase
      .from('boards')
      .select('id, name')
      .eq('is_archived', false)
      .order('created_at');

    if (!boards || boards.length === 0) {
      return NextResponse.json({ message: 'No boards found', generated: 0 });
    }

    let generated = 0;
    let errors = 0;

    for (const board of boards) {
      try {
        const result = await generateBoardSummary(supabase, board.id);
        if (result) {
          generated++;
        } else {
          errors++;
        }
      } catch (err) {
        console.error(`[board-summaries] Error for board ${board.name}:`, err);
        errors++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[board-summaries] Done: ${generated} generated, ${errors} errors in ${duration}ms`);

    return NextResponse.json({
      message: 'Board summaries updated',
      total_boards: boards.length,
      generated,
      errors,
      duration_ms: duration,
    });
  } catch (err: any) {
    console.error('[board-summaries] Cron error:', err);
    return NextResponse.json(
      { error: err.message || 'Board summaries error' },
      { status: 500 }
    );
  }
}
