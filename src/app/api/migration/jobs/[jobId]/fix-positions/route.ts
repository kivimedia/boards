import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthContext, errorResponse, successResponse } from '@/lib/api-helpers';
import { fetchTrelloCards } from '@/lib/trello-migration';

export const maxDuration = 300;

interface Params {
  params: { jobId: string };
}

/**
 * POST /api/migration/jobs/[jobId]/fix-positions
 * One-time repair: re-read Trello card positions and update card_placements.position
 * to match the original Trello ordering within each list.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  // Auth check (user must be logged in)
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  // Use service role to bypass RLS for bulk updates
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { jobId } = params;

  // 1. Load the migration job to get Trello credentials + board IDs
  const { data: job, error: fetchError } = await supabase
    .from('migration_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (fetchError || !job) return errorResponse('Migration job not found', 404);

  const config = job.config as {
    trello_api_key: string;
    trello_token: string;
    board_ids: string[];
  };

  if (!config.trello_api_key || !config.trello_token) {
    return errorResponse('Migration job config missing Trello credentials');
  }

  const trelloAuth = { key: config.trello_api_key, token: config.trello_token };
  let totalUpdated = 0;
  const errors: string[] = [];

  for (const trelloBoardId of config.board_ids) {
    try {
      // 2. Fetch cards from Trello (includes pos field)
      console.log(`[fix-positions] Fetching cards from Trello board ${trelloBoardId}...`);
      const trelloCards = await fetchTrelloCards(trelloAuth, trelloBoardId);
      const openCards = trelloCards.filter((c) => !c.closed);
      console.log(`[fix-positions] Got ${openCards.length} open cards from Trello`);

      // 3. Sort by list, then by Trello pos (this is the correct order)
      openCards.sort((a, b) => {
        if (a.idList !== b.idList) return a.idList.localeCompare(b.idList);
        return a.pos - b.pos;
      });

      // 4. Load ALL card mappings for this job (paginate to handle >1000 rows)
      const cardMap = new Map<string, string>();
      const pageSize = 1000;
      let offset = 0;
      while (true) {
        const { data: mappings } = await supabase
          .from('migration_entity_map')
          .select('source_id, target_id')
          .eq('job_id', jobId)
          .eq('source_type', 'card')
          .range(offset, offset + pageSize - 1);
        if (!mappings || mappings.length === 0) break;
        for (const m of mappings) {
          cardMap.set(m.source_id, m.target_id);
        }
        if (mappings.length < pageSize) break;
        offset += pageSize;
      }

      console.log(`[fix-positions] Loaded ${cardMap.size} card mappings`);

      if (cardMap.size === 0) {
        errors.push(`No card mappings found for board ${trelloBoardId}`);
        continue;
      }

      // 5. Assign per-list positions based on Trello order
      const listPositionCounters = new Map<string, number>();

      for (const trelloCard of openCards) {
        const ourCardId = cardMap.get(trelloCard.id);
        if (!ourCardId) continue;

        const listKey = trelloCard.idList;
        const pos = listPositionCounters.get(listKey) ?? 0;
        listPositionCounters.set(listKey, pos + 1);

        // 6. Update card_placements.position for this card
        const { error: updateError } = await supabase
          .from('card_placements')
          .update({ position: pos })
          .eq('card_id', ourCardId)
          .eq('is_mirror', false);

        if (updateError) {
          errors.push(`Failed to update card ${ourCardId}: ${updateError.message}`);
        } else {
          totalUpdated++;
        }
      }

      console.log(`[fix-positions] Updated ${totalUpdated} card positions`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[fix-positions] Error: ${msg}`);
      errors.push(`Error processing board ${trelloBoardId}: ${msg}`);
    }
  }

  return successResponse({
    totalUpdated,
    errors,
  });
}
