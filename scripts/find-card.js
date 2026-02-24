const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;

const BOARDS = [
  { trelloId: '5f2ebfea3379be79550b60f0', targetId: 'fd5f0606-e30c-4c1a-9cc8-fb6a02057619', name: 'Abs / Dev Board' },
  { trelloId: '5f7e01bd200e1e0ff8c23320', targetId: '00b502d5-c05b-46ef-900a-ba594e8ac730', name: 'Daily Cookie / Account Managers' },
  { trelloId: '5f73325f53a6451d2618d238', targetId: 'a4523939-07d2-4c8b-a4cc-1764f1bb7c12', name: 'Glen / Design Board' },
  { trelloId: '5e0ee7c8c98da78b707c2944', targetId: '18413c78-473c-4fb6-9f42-5c2428140d66', name: 'Jesus / Design Board' },
  { trelloId: '5cd58c883cbb325032444b5c', targetId: '2a7b6c44-4380-4c60-a14b-de94ab70facb', name: 'Mariz / Executive Assistant' },
  { trelloId: '68c68b2fd8a6ec847872837c', targetId: '94b7b432-3f62-41ee-8e2a-7d6caa568a38', name: 'Video Editing / Video Board' },
];

const SEARCH = process.argv[2] || 'Moodtopia';

async function trelloFetch(path) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `https://api.trello.com/1${path}${sep}key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Trello ${res.status}`);
  return res.json();
}

(async () => {
  const term = SEARCH.toLowerCase();
  console.log(`Searching for "${SEARCH}" across all boards...\n`);

  // 1. Search KMBoard
  console.log('=== KMBOARD SEARCH ===');
  const { data: kmCards } = await sb.from('cards')
    .select('id, title')
    .ilike('title', `%${SEARCH}%`);

  if (!kmCards || kmCards.length === 0) {
    console.log('No cards found in KMBoard.');
  } else {
    for (const card of kmCards) {
      // Find placement
      const { data: placements } = await sb.from('card_placements')
        .select('list_id, is_mirror, lists(name, board_id, boards(title))')
        .eq('card_id', card.id);

      if (!placements || placements.length === 0) {
        console.log(`  "${card.title}" (${card.id}) - NO PLACEMENT (orphaned)`);
      } else {
        for (const p of placements) {
          const boardTitle = p.lists?.boards?.title || 'Unknown board';
          const listName = p.lists?.name || 'Unknown list';
          console.log(`  "${card.title}" (${card.id})`);
          console.log(`    Board: ${boardTitle} | List: "${listName}" | Mirror: ${p.is_mirror}`);
        }
      }
    }
  }

  // 2. Search Trello
  console.log('\n=== TRELLO SEARCH ===');
  for (const board of BOARDS) {
    const cards = await trelloFetch(`/boards/${board.trelloId}/cards?filter=all`);
    const lists = await trelloFetch(`/boards/${board.trelloId}/lists?filter=all`);
    const listMap = Object.fromEntries(lists.map(l => [l.id, l]));

    const matches = cards.filter(c => c.name.toLowerCase().includes(term));
    for (const c of matches) {
      const list = listMap[c.idList];
      console.log(`  "${c.name}" (${c.id})`);
      console.log(`    Board: ${board.name} | List: "${list?.name || 'unknown'}" | Closed: ${c.closed} | List closed: ${list?.closed || false}`);
    }
  }
})();
