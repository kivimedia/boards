const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const ABS_TRELLO_ID = '5f2ebfea3379be79550b60f0';
const ABS_BOARD_ID = 'fd5f0606-e30c-4c1a-9cc8-fb6a02057619';

async function trelloFetch(path) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `https://api.trello.com/1${path}${sep}key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Trello ${res.status}`);
  return res.json();
}

(async () => {
  // 1. Get Trello lists + cards for Abs board
  const [trelloLists, trelloCards] = await Promise.all([
    trelloFetch(`/boards/${ABS_TRELLO_ID}/lists?filter=all`),
    trelloFetch(`/boards/${ABS_TRELLO_ID}/cards?filter=all`),
  ]);

  // Find 'Quick fix' list on Trello
  const quickFixTrello = trelloLists.find(l => l.name.toLowerCase().includes('quick fix'));
  if (!quickFixTrello) { console.log('No Quick fix list found on Trello'); return; }
  console.log(`Trello list: "${quickFixTrello.name}" (id: ${quickFixTrello.id}, closed: ${quickFixTrello.closed})`);

  const trelloQuickFixCards = trelloCards.filter(c => c.idList === quickFixTrello.id && !c.closed);
  console.log(`Trello open cards in this list: ${trelloQuickFixCards.length}`);
  console.log('');

  // 2. Get KMBoard list + cards
  const { data: kmLists } = await sb.from('lists')
    .select('id, name, position')
    .eq('board_id', ABS_BOARD_ID)
    .ilike('name', '%quick fix%');

  if (!kmLists || kmLists.length === 0) { console.log('No Quick fix list found on KMBoard'); return; }
  const kmList = kmLists[0];
  console.log(`KMBoard list: "${kmList.name}" (id: ${kmList.id})`);

  const { data: kmPlacements } = await sb.from('card_placements')
    .select('card_id, cards(id, title)')
    .eq('list_id', kmList.id)
    .eq('is_mirror', false);

  const kmCards = (kmPlacements || []).map(p => ({ id: p.card_id, title: p.cards?.title }));
  console.log(`KMBoard cards in this list: ${kmCards.length}`);
  console.log('');

  // 3. Build title-based matching
  const kmTitleSet = new Set(kmCards.map(c => c.title?.trim().toLowerCase()));
  const trelloTitleSet = new Set(trelloQuickFixCards.map(c => c.name?.trim().toLowerCase()));

  const missingOnKM = trelloQuickFixCards.filter(c => !kmTitleSet.has(c.name?.trim().toLowerCase()));
  const extraOnKM = kmCards.filter(c => !trelloTitleSet.has(c.title?.trim().toLowerCase()));

  console.log('=== MISSING ON KMBOARD (exist on Trello but not KMBoard) ===');
  console.log(`Count: ${missingOnKM.length}`);
  for (const c of missingOnKM) {
    console.log(`  - ${c.name}  (trello id: ${c.id})`);
  }

  console.log('');
  console.log('=== EXTRA ON KMBOARD (exist on KMBoard but not Trello) ===');
  console.log(`Count: ${extraOnKM.length}`);
  for (const c of extraOnKM) {
    console.log(`  - ${c.title}  (km id: ${c.id})`);
  }

  // 4. Also check migration_entity_map for the missing cards
  if (missingOnKM.length > 0) {
    console.log('');
    console.log('=== CHECKING MIGRATION MAP FOR MISSING CARDS ===');
    for (const tc of missingOnKM) {
      const { data: mapping } = await sb.from('migration_entity_map')
        .select('target_id')
        .eq('source_type', 'card')
        .eq('source_id', tc.id)
        .limit(1);
      if (mapping && mapping.length > 0) {
        // Card was mapped - check where it ended up
        const { data: placements } = await sb.from('card_placements')
          .select('list_id, lists(name)')
          .eq('card_id', mapping[0].target_id)
          .eq('is_mirror', false);
        const listName = placements?.[0]?.lists?.name || 'NO PLACEMENT';
        console.log(`  MAPPED: "${tc.name}" -> card ${mapping[0].target_id} on list: "${listName}"`);
      } else {
        console.log(`  NOT MAPPED: "${tc.name}" (trello id: ${tc.id}) - never imported!`);
      }
    }
  }

  console.log('');
  console.log('=== SUMMARY ===');
  console.log(`Trello "Quick fix" cards: ${trelloQuickFixCards.length}`);
  console.log(`KMBoard "Quick fix" cards: ${kmCards.length}`);
  console.log(`Missing on KMBoard: ${missingOnKM.length}`);
  console.log(`Extra on KMBoard: ${extraOnKM.length}`);
})();
