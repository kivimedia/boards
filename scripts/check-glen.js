const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // 1. Check Glen board current state
  const GLEN_BOARD = 'a4523939-07d2-4c8b-a4cc-1764f1bb7c12';

  const { data: lists } = await sb.from('lists')
    .select('id, name, position')
    .eq('board_id', GLEN_BOARD)
    .order('position');

  console.log(`Glen board lists: ${(lists || []).length}`);
  for (const l of lists || []) {
    const { count } = await sb.from('card_placements')
      .select('*', { count: 'exact', head: true })
      .eq('list_id', l.id)
      .eq('is_mirror', false);
    console.log(`  "${l.name}" → ${count || 0} cards`);
  }

  // 2. Check how many cards exist in entity map for Glen's Trello board
  const GLEN_TRELLO = '5f73325f53a6451d2618d238';

  // Get Trello lists for Glen
  const TRELLO_KEY = process.env.TRELLO_KEY;
  const TRELLO_TOKEN = process.env.TRELLO_TOKEN;

  const listsRes = await fetch(`https://api.trello.com/1/boards/${GLEN_TRELLO}/lists?filter=open&key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
  const trelloLists = await listsRes.json();
  console.log(`\nTrello open lists: ${trelloLists.length}`);

  const cardsRes = await fetch(`https://api.trello.com/1/boards/${GLEN_TRELLO}/cards?filter=open&key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
  const trelloCards = await cardsRes.json();
  console.log(`Trello open cards: ${trelloCards.length}`);

  // 3. Check entity maps for these cards
  const { data: allJobs } = await sb.from('migration_jobs')
    .select('id')
    .in('status', ['completed', 'running', 'pending']);

  const jobIds = (allJobs || []).map(j => j.id);
  console.log(`\nMigration jobs to check: ${jobIds.length}`);

  // Sample first 5 Trello cards - check their entity maps
  const sampleCards = trelloCards.slice(0, 5);
  let mappedCount = 0;
  let unmappedCount = 0;
  let placedCount = 0;
  let unplacedCount = 0;

  for (const tc of trelloCards) {
    const { data: maps } = await sb.from('migration_entity_map')
      .select('target_id')
      .eq('source_type', 'card')
      .eq('source_id', tc.id);

    if (maps && maps.length > 0) {
      mappedCount++;
      // Check if card has placement on Glen board
      const targetCardId = maps[0].target_id;
      const { data: placements } = await sb.from('card_placements')
        .select('id, list_id')
        .eq('card_id', targetCardId);

      if (placements && placements.length > 0) {
        // Check if any placement is on Glen board
        const glenListIds = new Set((lists || []).map(l => l.id));
        const onGlen = placements.some(p => glenListIds.has(p.list_id));
        if (onGlen) placedCount++;
        else unplacedCount++;
      } else {
        unplacedCount++;
      }
    } else {
      unmappedCount++;
    }
  }

  console.log(`\nEntity map results for ${trelloCards.length} Trello cards:`);
  console.log(`  Mapped (in entity_map): ${mappedCount}`);
  console.log(`  Unmapped (not in entity_map): ${unmappedCount}`);
  console.log(`  Placed on Glen board: ${placedCount}`);
  console.log(`  NOT placed on Glen board: ${unplacedCount}`);

  // 4. Check list entity maps too
  console.log('\nList mapping check:');
  for (const tl of trelloLists) {
    const { data: listMaps } = await sb.from('migration_entity_map')
      .select('target_id')
      .eq('source_type', 'list')
      .eq('source_id', tl.id);

    const mapped = listMaps && listMaps.length > 0;
    let targetOnGlen = false;
    if (mapped) {
      const targetListId = listMaps[0].target_id;
      const matchingList = (lists || []).find(l => l.id === targetListId);
      targetOnGlen = !!matchingList;
    }
    console.log(`  Trello "${tl.name}" → ${mapped ? 'MAPPED' : 'NOT MAPPED'} ${mapped ? (targetOnGlen ? '(on Glen board)' : '(NOT on Glen board)') : ''}`);
  }
})();
