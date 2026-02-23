import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * POST /api/admin/backfill-comment-dates
 * Admin-only. Backfills created_at for Trello-imported comments by extracting
 * the original timestamp from the Trello/MongoDB ObjectID stored in migration_entity_map.
 *
 * Trello IDs are MongoDB ObjectIDs: first 8 hex chars = Unix timestamp in seconds.
 */
export async function POST(_request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase: userClient, userId } = auth.ctx;

  // Admin check
  const { data: profile } = await userClient
    .from('profiles')
    .select('user_role')
    .eq('id', userId)
    .single();
  if (profile?.user_role !== 'admin') return errorResponse('Admin only', 403);

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return errorResponse('Service role key not configured', 500);

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  // Fetch all Trello comment mappings
  const { data: mappings, error: mapErr } = await adminClient
    .from('migration_entity_map')
    .select('source_id, target_id')
    .eq('source_type', 'comment');

  if (mapErr) return errorResponse(mapErr.message, 500);
  if (!mappings?.length) return successResponse({ updated: 0, message: 'No comment mappings found' });

  // Extract timestamp from Trello/MongoDB ObjectID (first 8 hex chars = Unix seconds)
  function trelloIdToDate(trelloId: string): string | null {
    try {
      const hex = trelloId.slice(0, 8);
      const unixSeconds = parseInt(hex, 16);
      if (isNaN(unixSeconds) || unixSeconds <= 0) return null;
      return new Date(unixSeconds * 1000).toISOString();
    } catch {
      return null;
    }
  }

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Batch update in groups of 100
  for (let i = 0; i < mappings.length; i += 100) {
    const batch = mappings.slice(i, i + 100);
    for (const { source_id, target_id } of batch) {
      const isoDate = trelloIdToDate(source_id);
      if (!isoDate) { skipped++; continue; }

      const { error } = await adminClient
        .from('comments')
        .update({ created_at: isoDate })
        .eq('id', target_id);

      if (error) { errors.push(`${target_id}: ${error.message}`); }
      else { updated++; }
    }
  }

  return successResponse({
    updated,
    skipped,
    errors: errors.slice(0, 20), // cap error list
    total: mappings.length,
  });
}
