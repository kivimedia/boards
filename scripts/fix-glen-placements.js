const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const GLEN_BOARD = 'a4523939-07d2-4c8b-a4cc-1764f1bb7c12';
const GLEN_TRELLO = '5f73325f53a6451d2618d238';
const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;

const USER_MAP = {
  '5be1cb5a2a1f1f4523e35fd7': 'b4ccc99c-6c0b-4530-8f98-06aa5fc3c975', // Ziv
  '5e0ebbb13c0b1e8b5a61c51b': '8f04591f-bbb5-4f16-83d3-c230fa3540fa', // Jesus
  '5f3db7bc4d58db0a94e0c0fb': 'ee76a98c-adf3-48be-9156-0038a4c0b84e', // Glen
  '60f0f3a26ae9de3ff7c530dd': 'ba66e07f-b09f-41bb-a2ce-12024cee0308', // Mike
  '62a3dbb7a0c3ee0c7fa97def': '4b63c33b-0120-45b5-b528-cb3f472df300', // Keren
  '5f7e019d3bec750e1d7eaab1': 'c7e42b6f-f585-4caa-bc10-57a3e42e08fb', // Mariz
  '5c9a0bd0d3f6a072c04e0b46': '7c2f77ef-aa2e-4f3f-80de-a2a2f387b862', // Abs
  '63f19e1ac6b04200bf93cd62': '65d0dfe8-2963-4d32-aada-09fc17f70b84', // Abs second
  '5cd58c18bdf7d80c12f7d3bf': '7c2f77ef-aa2e-4f3f-80de-a2a2f387b862', // abs third
};

async function trelloFetch(path) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `https://api.trello.com/1${path}${sep}key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Trello ${res.status} for ${path}`);
  return res.json();
}

(async () => {
  console.log('=== Fix Glen Board Placements ===\n');

  // 1. Get Glen KM lists
  const { data: kmLists } = await sb.from('lists')
    .select('id, name, position')
    .eq('board_id', GLEN_BOARD)
    .order('position');

  const kmListIds = new Set(kmLists.map(l => l.id));
  console.log(`Glen KM lists: ${kmLists.length}`);

  // 2. Get Trello lists and cards
  const trelloLists = await trelloFetch(`/boards/${GLEN_TRELLO}/lists?filter=open`);
  const trelloCards = await trelloFetch(`/boards/${GLEN_TRELLO}/cards?filter=open`);
  console.log(`Trello open lists: ${trelloLists.length}, cards: ${trelloCards.length}`);

  // 3. Build Trello list → KM list mapping
  const listMap = {};
  for (const tl of trelloLists) {
    const { data: maps } = await sb.from('migration_entity_map')
      .select('target_id')
      .eq('source_type', 'list')
      .eq('source_id', tl.id)
      .limit(1);

    if (maps && maps.length > 0) {
      listMap[tl.id] = maps[0].target_id;
      const kmList = kmLists.find(l => l.id === maps[0].target_id);
      console.log(`  List "${tl.name}" → KM "${kmList ? kmList.name : 'UNKNOWN'}" (${maps[0].target_id})`);
    } else {
      console.log(`  List "${tl.name}" → NO MAPPING`);
    }
  }

  // 4. Process each Trello card
  let placementsCreated = 0;
  let cardsCreated = 0;
  let alreadyPlaced = 0;
  let errors = 0;
  let noListMapping = 0;

  for (let i = 0; i < trelloCards.length; i++) {
    const tc = trelloCards[i];
    const targetListId = listMap[tc.idList];

    if (!targetListId) {
      noListMapping++;
      continue;
    }

    // Check entity map for this card
    const { data: cardMaps } = await sb.from('migration_entity_map')
      .select('target_id')
      .eq('source_type', 'card')
      .eq('source_id', tc.id)
      .limit(1);

    let targetCardId;

    if (cardMaps && cardMaps.length > 0) {
      targetCardId = cardMaps[0].target_id;

      // Check if already placed on Glen board
      const { data: placements } = await sb.from('card_placements')
        .select('id, list_id')
        .eq('card_id', targetCardId);

      const onGlen = (placements || []).some(p => kmListIds.has(p.list_id));
      if (onGlen) {
        alreadyPlaced++;
        continue;
      }

      // Verify card still exists in cards table
      const { data: cardExists } = await sb.from('cards')
        .select('id')
        .eq('id', targetCardId)
        .single();

      if (!cardExists) {
        // Card was deleted - need to recreate
        console.log(`  Card "${tc.name.substring(0, 40)}" was deleted, recreating...`);
        const assigneeId = tc.idMembers && tc.idMembers.length > 0
          ? USER_MAP[tc.idMembers[0]] || null
          : null;

        const { data: newCard, error: cardErr } = await sb.from('cards').insert({
          title: tc.name,
          description: tc.desc || null,
          priority: 'medium',
          due_date: tc.due || null,
          created_at: tc.dateLastActivity || new Date().toISOString(),
          owner_id: assigneeId,
        }).select('id').single();

        if (cardErr) {
          console.log(`  ERROR recreating card: ${cardErr.message}`);
          errors++;
          continue;
        }

        // Update entity map
        await sb.from('migration_entity_map')
          .update({ target_id: newCard.id })
          .eq('source_type', 'card')
          .eq('source_id', tc.id);

        targetCardId = newCard.id;
        cardsCreated++;
      }

      // Normalize position: cap at Postgres INT max (2147483647), convert float to int
      const safePos = Math.min(Math.floor(tc.pos || (i * 65536)), 2147483647);

      // Card exists but no placement on Glen → create placement
      const { error: placeErr } = await sb.from('card_placements').insert({
        card_id: targetCardId,
        list_id: targetListId,
        position: safePos,
        is_mirror: false,
      });

      if (placeErr) {
        console.log(`  ERROR placing card "${tc.name.substring(0, 40)}": ${placeErr.message}`);
        errors++;
      } else {
        placementsCreated++;
      }
    } else {
      // Card not in entity map - create new card + placement
      const assigneeId = tc.idMembers && tc.idMembers.length > 0
        ? USER_MAP[tc.idMembers[0]] || null
        : null;

      const { data: newCard, error: cardErr } = await sb.from('cards').insert({
        title: tc.name,
        description: tc.desc || null,
        priority: 'medium',
        due_date: tc.due || null,
        created_at: tc.dateLastActivity || new Date().toISOString(),
        owner_id: assigneeId,
      }).select('id').single();

      if (cardErr) {
        console.log(`  ERROR creating card "${tc.name.substring(0, 40)}": ${cardErr.message}`);
        errors++;
        continue;
      }

      // Create placement
      const safePos2 = Math.min(Math.floor(tc.pos || (i * 65536)), 2147483647);
      const { error: placeErr } = await sb.from('card_placements').insert({
        card_id: newCard.id,
        list_id: targetListId,
        position: safePos2,
        is_mirror: false,
      });

      if (placeErr) {
        console.log(`  ERROR placing new card: ${placeErr.message}`);
        errors++;
        continue;
      }

      // Create entity map entry
      await sb.from('migration_entity_map').insert({
        job_id: 'b4aaecd6-29cc-4e81-ab71-be7cbca1db80', // sync job
        source_type: 'card',
        source_id: tc.id,
        target_id: newCard.id,
      });

      cardsCreated++;
    }

    if ((i + 1) % 50 === 0) {
      console.log(`  Progress: ${i + 1}/${trelloCards.length} (${placementsCreated} placements, ${cardsCreated} new cards, ${alreadyPlaced} already placed, ${errors} errors)`);
    }
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`Total Trello cards: ${trelloCards.length}`);
  console.log(`Already placed on Glen: ${alreadyPlaced}`);
  console.log(`New placements created: ${placementsCreated}`);
  console.log(`New cards created: ${cardsCreated}`);
  console.log(`No list mapping: ${noListMapping}`);
  console.log(`Errors: ${errors}`);

  // Verify final counts
  console.log('\n=== VERIFICATION ===');
  let total = 0;
  for (const l of kmLists) {
    const { count } = await sb.from('card_placements')
      .select('*', { count: 'exact', head: true })
      .eq('list_id', l.id)
      .eq('is_mirror', false);
    total += count || 0;
    console.log(`  "${l.name}" → ${count || 0} cards`);
  }
  console.log(`Total cards on Glen board: ${total}`);
})();
