import { NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/settings/knowledge-status
 * Returns current AI knowledge indexing status.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  try {
    const [
      totalCardsRes,
      indexStateRes,
      embeddingsCountRes,
      boardSummariesRes,
      errorCardsRes,
      recentEmbeddingsRes,
    ] = await Promise.all([
      supabase.from('cards').select('id', { count: 'exact', head: true }),
      supabase.from('knowledge_index_state').select('entity_type, status', { count: 'exact' }),
      supabase.from('knowledge_embeddings').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('board_summaries').select('board_id, generated_at, key_themes').order('generated_at', { ascending: false }),
      supabase.from('knowledge_index_state').select('entity_id, error_message, last_indexed_at').eq('status', 'error').limit(10),
      supabase.from('knowledge_embeddings').select('indexed_at').eq('is_active', true).order('indexed_at', { ascending: false }).limit(1),
    ]);

    const totalCards = totalCardsRes.count || 0;
    const indexStates = indexStateRes.data || [];
    const indexedCards = indexStates.filter((s: any) => s.entity_type === 'card' && s.status === 'indexed').length;
    const pendingCards = indexStates.filter((s: any) => s.entity_type === 'card' && s.status === 'pending').length;
    const errorCards = indexStates.filter((s: any) => s.entity_type === 'card' && s.status === 'error').length;
    const activeEmbeddings = embeddingsCountRes.count || 0;
    const boardSummaries = boardSummariesRes.data || [];
    const lastEmbedding = recentEmbeddingsRes.data?.[0]?.indexed_at || null;

    // Fetch board names for summaries
    const boardIds = boardSummaries.map((bs: any) => bs.board_id);
    let boardNames: Record<string, string> = {};
    if (boardIds.length > 0) {
      const { data: boards } = await supabase
        .from('boards')
        .select('id, name')
        .in('id', boardIds);
      if (boards) {
        boardNames = Object.fromEntries(boards.map((b: any) => [b.id, b.name]));
      }
    }

    // Total non-archived boards
    const { count: totalBoards } = await supabase
      .from('boards')
      .select('id', { count: 'exact', head: true })
      .eq('is_archived', false);

    return NextResponse.json({
      cards: {
        total: totalCards,
        indexed: indexedCards,
        pending: pendingCards,
        errors: errorCards,
        coverage: totalCards > 0 ? Math.round((indexedCards / totalCards) * 100) : 0,
      },
      embeddings: {
        active: activeEmbeddings,
        last_indexed_at: lastEmbedding,
      },
      board_summaries: {
        total_boards: totalBoards || 0,
        summarized: boardSummaries.length,
        details: boardSummaries.map((bs: any) => ({
          board_id: bs.board_id,
          board_name: boardNames[bs.board_id] || 'Unknown',
          generated_at: bs.generated_at,
          themes: bs.key_themes || [],
        })),
      },
      error_cards: (errorCardsRes.data || []).map((e: any) => ({
        entity_id: e.entity_id,
        error: e.error_message,
        last_attempt: e.last_indexed_at,
      })),
    });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to fetch knowledge status', 500);
  }
}
