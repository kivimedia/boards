const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BOARDS = [
  { targetId: 'fd5f0606-e30c-4c1a-9cc8-fb6a02057619', trelloId: '5f2ebfea3379be79550b60f0', name: 'Abs / Dev Board' },
  { targetId: '00b502d5-c05b-46ef-900a-ba594e8ac730', trelloId: '5f7e01bd200e1e0ff8c23320', name: 'Daily Cookie / Account Managers' },
  { targetId: 'a4523939-07d2-4c8b-a4cc-1764f1bb7c12', trelloId: '5f73325f53a6451d2618d238', name: 'Glen / Design Board' },
  { targetId: '18413c78-473c-4fb6-9f42-5c2428140d66', trelloId: '5e0ee7c8c98da78b707c2944', name: 'Jesus / Design Board' },
  { targetId: '2a7b6c44-4380-4c60-a14b-de94ab70facb', trelloId: '5cd58c883cbb325032444b5c', name: 'Mariz / Executive Assistant' },
  { targetId: '94b7b432-3f62-41ee-8e2a-7d6caa568a38', trelloId: '68c68b2fd8a6ec847872837c', name: 'Video Editing / Video Board' },
];

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;

async function trelloFetch(path) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `https://api.trello.com/1${path}${sep}key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Trello ${res.status} for ${path}`);
  return res.json();
}

(async () => {
  const emptyLists = [];
  const bigDiffs = [];

  for (const board of BOARDS) {
    console.log(`\nFetching ${board.name}...`);

    // KMBoard lists
    const { data: kmLists } = await sb.from('lists')
      .select('id, name, position')
      .eq('board_id', board.targetId)
      .order('position');

    // Card counts per KM list
    const kmCounts = {};
    for (const list of kmLists || []) {
      const { count } = await sb.from('card_placements')
        .select('*', { count: 'exact', head: true })
        .eq('list_id', list.id)
        .eq('is_mirror', false);
      kmCounts[list.id] = count || 0;
    }

    // Trello lists and cards
    const trelloLists = await trelloFetch(`/boards/${board.trelloId}/lists?filter=all`);
    const trelloCards = await trelloFetch(`/boards/${board.trelloId}/cards?filter=all`);
    const openCards = trelloCards.filter(c => c.closed === false);

    // Count per Trello list
    const trelloCountByName = {};
    for (const tl of trelloLists) {
      const key = tl.name.trim().toLowerCase();
      trelloCountByName[key] = {
        name: tl.name,
        count: openCards.filter(c => c.idList === tl.id).length,
        closed: tl.closed || false,
      };
    }

    // Also check: Trello lists that have no KM match
    const kmListNames = new Set((kmLists || []).map(l => l.name.trim().toLowerCase()));
    const unmatchedTrello = trelloLists.filter(tl => {
      const key = tl.name.trim().toLowerCase();
      return !kmListNames.has(key);
    });

    const kmTotal = Object.values(kmCounts).reduce((s, c) => s + c, 0);
    const trelloTotal = openCards.length;

    console.log(`\n=== ${board.name} ===`);
    console.log(`KMBoard total: ${kmTotal} | Trello total: ${trelloTotal} | Diff: ${kmTotal - trelloTotal}`);
    console.log('');
    console.log('List Name'.padEnd(45) + '| KM   | Trello | Diff   | Notes');
    console.log('-'.repeat(100));

    for (const list of kmLists || []) {
      const kmCount = kmCounts[list.id];
      const key = list.name.trim().toLowerCase();
      const trello = trelloCountByName[key];
      const trelloCount = trello ? trello.count : null;
      const diff = trelloCount !== null ? kmCount - trelloCount : null;
      const diffStr = diff !== null ? (diff > 0 ? `+${diff}` : `${diff}`) : 'N/A';

      let notes = '';
      if (kmCount === 0 && (trelloCount === null || trelloCount === 0)) {
        notes = 'EMPTY (both)';
        emptyLists.push({ board: board.name, list: list.name, km: kmCount, trello: trelloCount === null ? 'no match' : trelloCount });
      } else if (kmCount === 0 && trelloCount > 0) {
        notes = '** EMPTY ON KM, HAS CARDS ON TRELLO **';
        emptyLists.push({ board: board.name, list: list.name, km: 0, trello: trelloCount });
      } else if (trelloCount === null) {
        notes = 'KM-only list (not on Trello)';
      } else if (trello && trello.closed) {
        notes = 'Trello list is CLOSED';
      } else if (diff !== null && Math.abs(diff) > 5) {
        notes = 'BIG DIFF';
        bigDiffs.push({ board: board.name, list: list.name, km: kmCount, trello: trelloCount, diff });
      }

      const trelloStr = trelloCount !== null ? String(trelloCount) : 'N/A';
      console.log(
        list.name.substring(0, 44).padEnd(45) + '| ' +
        String(kmCount).padStart(4) + ' | ' +
        trelloStr.padStart(6) + ' | ' +
        diffStr.padStart(6) + ' | ' +
        notes
      );
    }

    if (unmatchedTrello.length > 0) {
      console.log('');
      console.log('Trello lists NOT on KMBoard:');
      for (const tl of unmatchedTrello) {
        const count = openCards.filter(c => c.idList === tl.id).length;
        console.log(`  - "${tl.name}" (${count} cards, ${tl.closed ? 'CLOSED' : 'open'})`);
      }
    }
  }

  // Summary
  console.log('\n\n========================================');
  console.log('SUMMARY: EMPTY LISTS ON KMBOARD');
  console.log('========================================');
  if (emptyLists.length === 0) {
    console.log('None found.');
  } else {
    for (const e of emptyLists) {
      console.log(`  ${e.board} > "${e.list}" — KM: ${e.km}, Trello: ${e.trello}`);
    }
  }

  console.log('\n========================================');
  console.log('SUMMARY: BIG DISCREPANCIES (>5 cards)');
  console.log('========================================');
  if (bigDiffs.length === 0) {
    console.log('None found.');
  } else {
    for (const d of bigDiffs) {
      console.log(`  ${d.board} > "${d.list}" — KM: ${d.km}, Trello: ${d.trello}, Diff: ${d.diff > 0 ? '+' : ''}${d.diff}`);
    }
  }
})();
