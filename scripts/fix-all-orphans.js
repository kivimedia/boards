/**
 * Full orphan scan + fix across all 6 boards.
 *
 * For each board:
 *   1. Find all cards in migration_entity_map that have no card_placements
 *   2. Look up where they belong on Trello
 *   3. Re-create the placement (or re-import if the card row was deleted)
 */
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const ADMIN_USER_ID = '9fdf34b0-bc1e-40e0-9aae-7846e0efe770';

const BOARDS = [
  { trelloId: '5f2ebfea3379be79550b60f0', targetId: 'fd5f0606-e30c-4c1a-9cc8-fb6a02057619', name: 'Abs / Dev Board' },
  { trelloId: '5f7e01bd200e1e0ff8c23320', targetId: '00b502d5-c05b-46ef-900a-ba594e8ac730', name: 'Daily Cookie / Account Managers' },
  { trelloId: '5f73325f53a6451d2618d238', targetId: 'a4523939-07d2-4c8b-a4cc-1764f1bb7c12', name: 'Glen / Design Board' },
  { trelloId: '5e0ee7c8c98da78b707c2944', targetId: '18413c78-473c-4fb6-9f42-5c2428140d66', name: 'Jesus / Design Board' },
  { trelloId: '5cd58c883cbb325032444b5c', targetId: '2a7b6c44-4380-4c60-a14b-de94ab70facb', name: 'Mariz / Executive Assistant' },
  { trelloId: '68c68b2fd8a6ec847872837c', targetId: '94b7b432-3f62-41ee-8e2a-7d6caa568a38', name: 'Video Editing / Video Board' },
];

const USER_MAPPING = {
  '576d12434dcfe588048637ce': '9fdf34b0-bc1e-40e0-9aae-7846e0efe770',
  '5869c3e21bee2fe8007b4c0b': '665bb89d-6b23-4576-a1f9-cd7178e1e1f7',
  '58ae81fac324a5467af1675b': '15fe3bb7-2af4-4f7f-932b-48b942db0408',
  '59d432b1ebcc4108ebe1179f': '5308dd11-c9c9-4464-b4cb-be05cf809c8e',
  '5f71383d6acde719cdf24bd5': '708a02f2-1144-48e5-a4dd-293b5805fe81',
  '61409d72d6f71901d299584c': '8e0102c4-229a-4dfc-86f5-f6f7f7d7a9de',
  '61873b9b2bc984153a0832df': 'da155870-37c9-4c75-a3bf-420031b31b75',
  '62f60498fcdc596b07d9f0bc': 'a0e39691-dc9a-490c-85d3-aae14330ee61',
  '632991ef6c8f8f015d61cbd6': 'be70e719-9286-4cdf-9eb8-5f0453a9be32',
  '642169a66baa8ab087218cc4': '89fa2720-e494-4646-88a7-e34570fa1cb2',
  '65bc8f5d49ca8d46fca0f8ec': 'a70a02a1-6492-42fb-a166-574b1f5b12d1',
  '67ce83b3113fe165406dccf2': '8354ced0-3fb2-4131-a828-a6d2793de276',
  '67e24514d577f54185ee60cb': 'e191d3bf-9428-4be5-b09f-f155cb3a9ea4',
  '6805b512afeec69ce427e1ef': '7a147664-131c-432e-a99b-38b9dfff4711',
  '68624a3920c3a9d8caa859cb': 'e1c9a7a3-d085-4273-a86d-c32ac9ac20f4',
  '68ee598af0decc686bbdc8ba': '62e485dd-9294-43d2-a0ef-ac0ae521c01c',
};

async function trelloFetch(path) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `https://api.trello.com/1${path}${sep}key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Trello ${res.status} for ${path}`);
  return res.json();
}

(async () => {
  console.log('=== FULL ORPHAN SCAN & FIX ===\n');

  // 1. Load ALL card mappings from migration_entity_map
  console.log('Loading all card migration mappings...');
  const allMappings = [];
  let offset = 0;
  while (true) {
    const { data } = await sb.from('migration_entity_map')
      .select('source_id, target_id')
      .eq('source_type', 'card')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allMappings.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`Loaded ${allMappings.length} card mappings.\n`);

  // 2. Load ALL list mappings
  console.log('Loading all list migration mappings...');
  const listMappings = new Map();
  offset = 0;
  while (true) {
    const { data } = await sb.from('migration_entity_map')
      .select('source_id, target_id')
      .eq('source_type', 'list')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const row of data) listMappings.set(row.source_id, row.target_id);
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`Loaded ${listMappings.size} list mappings.\n`);

  // 3. Load label mappings
  const labelMappings = new Map();
  offset = 0;
  while (true) {
    const { data } = await sb.from('migration_entity_map')
      .select('source_id, target_id')
      .eq('source_type', 'label')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const row of data) labelMappings.set(row.source_id, row.target_id);
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`Loaded ${labelMappings.size} label mappings.\n`);

  // 4. Check which mapped cards have no placements
  console.log('Checking for orphaned cards (no placements)...');
  const BATCH = 200;
  const orphanedMappings = []; // { source_id (trello), target_id (km card id), cardExists: bool }

  for (let i = 0; i < allMappings.length; i += BATCH) {
    const batch = allMappings.slice(i, i + BATCH);
    const targetIds = batch.map(m => m.target_id);

    // Check which have placements
    const { data: placements } = await sb.from('card_placements')
      .select('card_id')
      .in('card_id', targetIds);
    const hasPlacement = new Set((placements || []).map(p => p.card_id));

    // Check which cards still exist
    const { data: existingCards } = await sb.from('cards')
      .select('id')
      .in('id', targetIds);
    const cardExists = new Set((existingCards || []).map(c => c.id));

    for (const m of batch) {
      if (!hasPlacement.has(m.target_id)) {
        orphanedMappings.push({
          trelloId: m.source_id,
          kmId: m.target_id,
          cardExists: cardExists.has(m.target_id),
        });
      }
    }

    if ((i + BATCH) % 1000 === 0 || i + BATCH >= allMappings.length) {
      process.stdout.write(`\r  Checked ${Math.min(i + BATCH, allMappings.length)}/${allMappings.length} mappings, found ${orphanedMappings.length} orphans`);
    }
  }
  console.log(`\n\nTotal orphaned cards: ${orphanedMappings.length}`);
  const existingOrphans = orphanedMappings.filter(o => o.cardExists);
  const deletedOrphans = orphanedMappings.filter(o => !o.cardExists);
  console.log(`  Card exists (just needs placement): ${existingOrphans.length}`);
  console.log(`  Card deleted (needs re-import): ${deletedOrphans.length}\n`);

  // 5. Fetch Trello data for all boards to locate orphans
  console.log('Fetching Trello data for all boards...');
  const trelloCardMap = new Map(); // trelloCardId -> { card, boardName, listId }
  const trelloLabelMap = new Map(); // trelloBoardId -> labels[]

  for (const board of BOARDS) {
    const [cards, labels] = await Promise.all([
      trelloFetch(`/boards/${board.trelloId}/cards?filter=all`),
      trelloFetch(`/boards/${board.trelloId}/labels`),
    ]);
    trelloLabelMap.set(board.trelloId, labels);
    const openCards = cards.filter(c => !c.closed);
    for (const c of openCards) {
      trelloCardMap.set(c.id, { card: c, boardName: board.name, trelloBoardId: board.trelloId });
    }
    console.log(`  ${board.name}: ${openCards.length} open cards`);
  }
  console.log('');

  // Track per-list max positions for efficient insertion
  const listMaxPos = new Map();

  async function getNextPosition(listId) {
    if (!listMaxPos.has(listId)) {
      const { data } = await sb.from('card_placements')
        .select('position')
        .eq('list_id', listId)
        .order('position', { ascending: false })
        .limit(1);
      listMaxPos.set(listId, (data && data.length > 0) ? data[0].position : 0);
    }
    const next = listMaxPos.get(listId) + 65536;
    listMaxPos.set(listId, next);
    return next;
  }

  function inferPriority(trelloCard, labels) {
    const cardLabels = labels.filter(l => trelloCard.idLabels.includes(l.id));
    for (const label of cardLabels) {
      const name = (label.name || '').toLowerCase();
      if (name.includes('urgent') || name.includes('critical')) return 'urgent';
      if (name.includes('high')) return 'high';
      if (name.includes('medium')) return 'medium';
      if (name.includes('low')) return 'low';
    }
    return 'none';
  }

  // 6. Fix orphans that still have card rows (just need placement)
  let relinked = 0;
  let relinkedFail = 0;
  if (existingOrphans.length > 0) {
    console.log(`--- RELINKING ${existingOrphans.length} existing orphaned cards ---`);
    for (const orphan of existingOrphans) {
      const trello = trelloCardMap.get(orphan.trelloId);
      if (!trello) {
        // Card no longer open on Trello - skip
        continue;
      }
      const targetListId = listMappings.get(trello.card.idList);
      if (!targetListId) {
        console.log(`  SKIP (no list mapping): "${trello.card.name}" on list ${trello.card.idList}`);
        relinkedFail++;
        continue;
      }

      const pos = await getNextPosition(targetListId);
      const { error } = await sb.from('card_placements').insert({
        card_id: orphan.kmId,
        list_id: targetListId,
        position: pos,
        is_mirror: false,
      });

      if (error) {
        console.log(`  FAIL: "${trello.card.name}" -> ${error.message}`);
        relinkedFail++;
      } else {
        relinked++;
      }
    }
    console.log(`  Relinked: ${relinked}, Failed: ${relinkedFail}\n`);
  }

  // 7. Re-import orphans whose card rows were deleted
  let reimported = 0;
  let reimportFail = 0;
  if (deletedOrphans.length > 0) {
    console.log(`--- RE-IMPORTING ${deletedOrphans.length} deleted orphaned cards ---`);
    for (const orphan of deletedOrphans) {
      const trello = trelloCardMap.get(orphan.trelloId);
      if (!trello) {
        // Card no longer open on Trello - skip
        continue;
      }
      const targetListId = listMappings.get(trello.card.idList);
      if (!targetListId) {
        console.log(`  SKIP (no list mapping): "${trello.card.name}" on list ${trello.card.idList}`);
        reimportFail++;
        continue;
      }

      const labels = trelloLabelMap.get(trello.trelloBoardId) || [];
      const priority = inferPriority(trello.card, labels);

      // Create card
      const { data: newCard, error: cardErr } = await sb.from('cards')
        .insert({
          title: trello.card.name,
          description: trello.card.desc || '',
          due_date: trello.card.due,
          priority,
          created_by: ADMIN_USER_ID,
        })
        .select()
        .single();

      if (cardErr) {
        console.log(`  FAIL card insert: "${trello.card.name}" -> ${cardErr.message}`);
        reimportFail++;
        continue;
      }

      // Create placement
      const pos = await getNextPosition(targetListId);
      const { error: plErr } = await sb.from('card_placements').insert({
        card_id: newCard.id,
        list_id: targetListId,
        position: pos,
        is_mirror: false,
      });
      if (plErr) {
        console.log(`  FAIL placement: "${trello.card.name}" -> ${plErr.message}`);
        reimportFail++;
        continue;
      }

      // Sync labels
      const labelInserts = trello.card.idLabels
        .map(lid => labelMappings.get(lid))
        .filter(Boolean)
        .map(labelId => ({ card_id: newCard.id, label_id: labelId }));
      if (labelInserts.length > 0) await sb.from('card_labels').insert(labelInserts);

      // Sync assignees
      const assigneeInserts = (trello.card.idMembers || [])
        .map(mid => USER_MAPPING[mid])
        .filter(Boolean)
        .map(u => ({ card_id: newCard.id, user_id: u }));
      if (assigneeInserts.length > 0) await sb.from('card_assignees').insert(assigneeInserts);

      // Update migration map
      await sb.from('migration_entity_map')
        .update({ target_id: newCard.id })
        .eq('source_type', 'card')
        .eq('source_id', orphan.trelloId);

      reimported++;
    }
    console.log(`  Re-imported: ${reimported}, Failed: ${reimportFail}\n`);
  }

  // 8. Summary
  console.log('========================================');
  console.log('SUMMARY');
  console.log('========================================');
  console.log(`Total orphaned mappings found: ${orphanedMappings.length}`);
  console.log(`  Relinked (card existed, added placement): ${relinked}`);
  console.log(`  Re-imported (card deleted, created new): ${reimported}`);
  console.log(`  Skipped/Failed: ${relinkedFail + reimportFail}`);
  console.log(`  Not on Trello anymore (closed/deleted): ${orphanedMappings.length - relinked - reimported - relinkedFail - reimportFail}`);
})();
