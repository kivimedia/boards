import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

function getAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

interface ReorderBody {
  /**
   * Same-list reorder: pass the full ordered array of placement IDs after the drag.
   */
  list_id?: string;
  ordered_placement_ids?: string[];

  /**
   * Cross-list move: move one placement to a different list at a specific index.
   */
  placement_id?: string;
  dest_list_id?: string;
  dest_index?: number;
}

/**
 * POST /api/cards/reorder
 * Server-side card position persistence (bypasses RLS).
 *
 * For same-list reorder:
 *   { list_id, ordered_placement_ids: ['uuid1', 'uuid2', ...] }
 *
 * For cross-list drag:
 *   { placement_id, dest_list_id, dest_index }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  let body: ReorderBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid request body');
  }

  const db = getAdminClient() ?? auth.ctx.supabase;

  // ── Same-list reorder ────────────────────────────────────────────────────
  if (body.ordered_placement_ids && body.list_id) {
    const ids = body.ordered_placement_ids;
    const updates = ids.map((id, position) =>
      db.from('card_placements').update({ position }).eq('id', id)
    );
    const results = await Promise.all(updates);
    const failed = results.filter((r) => r.error);
    if (failed.length) {
      return errorResponse(`${failed.length} position updates failed`, 500);
    }
    return successResponse({ updated: ids.length });
  }

  // ── Cross-list move ──────────────────────────────────────────────────────
  if (body.placement_id && body.dest_list_id && body.dest_index !== undefined) {
    const { placement_id, dest_list_id, dest_index } = body;

    // Move the placement to the new list
    const { error: moveErr } = await db
      .from('card_placements')
      .update({ list_id: dest_list_id, position: dest_index })
      .eq('id', placement_id);

    if (moveErr) return errorResponse(moveErr.message, 500);

    // Re-sequence destination list (shift cards at or after dest_index up by 1)
    // We do a full renumber to be safe
    const { data: destCards } = await db
      .from('card_placements')
      .select('id')
      .eq('list_id', dest_list_id)
      .order('position', { ascending: true });

    if (destCards && destCards.length > 1) {
      await Promise.all(
        destCards.map((c: any, i: number) =>
          db.from('card_placements').update({ position: i }).eq('id', c.id)
        )
      );
    }

    return successResponse({ moved: true });
  }

  return errorResponse('Invalid body: provide either (list_id + ordered_placement_ids) or (placement_id + dest_list_id + dest_index)');
}
