const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const ADMIN_USER_ID = '9fdf34b0-bc1e-40e0-9aae-7846e0efe770';

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

const TRELLO_COLOR_MAP = {
  green: '#10b981', yellow: '#f59e0b', orange: '#f97316', red: '#ef4444',
  purple: '#8b5cf6', blue: '#3b82f6', sky: '#0ea5e9', lime: '#84cc16',
  pink: '#ec4899', black: '#1e293b',
};

const crypto = require('crypto');
function uuid() { return crypto.randomUUID(); }

async function trelloFetch(path) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `https://api.trello.com/1${path}${sep}key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`Trello ${res.status} for ${path}`);
  return res.json();
}

async function fetchAllComments(boardId) {
  const all = [];
  let before;
  while (true) {
    const params = `filter=commentCard&limit=1000${before ? '&before=' + before : ''}`;
    const page = await trelloFetch(`/boards/${boardId}/actions?${params}`);
    if (!page || page.length === 0) break;
    all.push(...page);
    if (page.length < 1000) break;
    before = page[page.length - 1].id;
  }
  return all;
}

function inferPriority(card, labels) {
  const cardLabels = labels.filter(l => card.idLabels.includes(l.id));
  for (const label of cardLabels) {
    const name = label.name.toLowerCase();
    if (name.includes('urgent') || name.includes('critical')) return 'urgent';
    if (name.includes('high')) return 'high';
    if (name.includes('medium')) return 'medium';
    if (name.includes('low')) return 'low';
  }
  return 'none';
}

const startTime = Date.now();
function elapsed() {
  const s = Math.floor((Date.now() - startTime) / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${s % 60}s` : `${s}s`;
}
function log(msg) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`); }
function logProgress(msg) { process.stdout.write(`\r[${new Date().toISOString().slice(11, 19)}] ${msg}                    `); }

// ─── Semaphore for concurrency ────────────────────────────────────────────────
function createSem(limit) {
  let active = 0;
  const queue = [];
  return {
    acquire() { if (active < limit) { active++; return Promise.resolve(); } return new Promise(r => queue.push(r)); },
    release() { active--; if (queue.length > 0) { active++; queue.shift()(); } },
  };
}

// ─── FIX 1: Delete Mariz duplicate empty lists ───────────────────────────────

async function fixMarizDuplicates() {
  log('=== FIX 1: Delete Mariz duplicate empty lists ===');
  const MARIZ_BOARD = '2a7b6c44-4380-4c60-a14b-de94ab70facb';

  const { data: allLists } = await sb.from('lists')
    .select('id, name, position')
    .eq('board_id', MARIZ_BOARD)
    .order('position');

  // Group by lowercase name
  const byName = {};
  for (const list of allLists) {
    const key = list.name.trim().toLowerCase();
    if (!byName[key]) byName[key] = [];
    byName[key].push(list);
  }

  let deleted = 0;
  for (const [name, lists] of Object.entries(byName)) {
    if (lists.length <= 1) continue;

    // For each duplicate group, find which ones have cards and which are empty
    for (const list of lists) {
      const { count } = await sb.from('card_placements')
        .select('*', { count: 'exact', head: true })
        .eq('list_id', list.id)
        .eq('is_mirror', false);

      list._cardCount = count || 0;
    }

    // Keep the one(s) with cards, delete the empty ones
    const withCards = lists.filter(l => l._cardCount > 0);
    const empty = lists.filter(l => l._cardCount === 0);

    if (empty.length === 0) continue;

    for (const emptyList of empty) {
      // Double-check no placements at all (including mirrors)
      const { count: anyPlacements } = await sb.from('card_placements')
        .select('*', { count: 'exact', head: true })
        .eq('list_id', emptyList.id);

      if (anyPlacements > 0) {
        log(`  SKIP "${emptyList.name}" (id ${emptyList.id.slice(0,8)}) — has ${anyPlacements} placements`);
        continue;
      }

      log(`  DELETE "${emptyList.name}" (id ${emptyList.id.slice(0,8)}, pos ${emptyList.position}) — empty duplicate, keeping ${withCards.length > 0 ? withCards[0].id.slice(0,8) : 'none'} with ${withCards.length > 0 ? withCards[0]._cardCount : 0} cards`);
      await sb.from('lists').delete().eq('id', emptyList.id);
      deleted++;
    }
  }

  log(`  Deleted ${deleted} empty duplicate lists from Mariz board`);
  return deleted;
}

// ─── FIX 2: Populate Glen's Design Board ─────────────────────────────────────

async function fixGlenBoard() {
  log('');
  log('=== FIX 2: Populate Glen / Design Board ===');
  const GLEN_KM_BOARD = 'a4523939-07d2-4c8b-a4cc-1764f1bb7c12';
  const GLEN_TRELLO = '5f73325f53a6451d2618d238';

  // Create a job record for entity mapping
  const jobId = uuid();
  await sb.from('migration_jobs').insert({
    id: jobId,
    status: 'running',
    started_at: new Date().toISOString(),
    config: { note: 'Glen board fix — local script' },
    created_by: ADMIN_USER_ID,
    progress: { phase: 'glen_fix' },
    report: {},
  });
  log(`  Job ID: ${jobId}`);

  // Load global mappings to skip already-imported entities
  const globalMaps = new Map();
  for (const sourceType of ['board', 'list', 'card', 'label', 'comment', 'checklist']) {
    let offset = 0;
    while (true) {
      const { data } = await sb.from('migration_entity_map')
        .select('source_id, target_id')
        .eq('source_type', sourceType)
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      for (const row of data) globalMaps.set(`${sourceType}:${row.source_id}`, row.target_id);
      if (data.length < 1000) break;
      offset += 1000;
    }
  }
  log(`  Loaded ${globalMaps.size} global mappings`);

  // Board mapping
  globalMaps.set(`board:${GLEN_TRELLO}`, GLEN_KM_BOARD);
  await sb.from('migration_entity_map').insert({
    job_id: jobId, source_type: 'board', source_id: GLEN_TRELLO, target_id: GLEN_KM_BOARD,
  });

  // Fetch Trello data
  log(`  Fetching Trello data...`);
  const [trelloLists, trelloCards, trelloLabels] = await Promise.all([
    trelloFetch(`/boards/${GLEN_TRELLO}/lists?filter=open`),
    trelloFetch(`/boards/${GLEN_TRELLO}/cards?filter=all`),
    trelloFetch(`/boards/${GLEN_TRELLO}/labels`),
  ]);
  const openCards = trelloCards.filter(c => c.closed === false).sort((a, b) => {
    if (a.idList !== b.idList) return a.idList.localeCompare(b.idList);
    return a.pos - b.pos;
  });
  log(`  Found ${trelloLists.length} open lists, ${openCards.length} open cards, ${trelloLabels.length} labels`);

  // 1. Create labels
  log(`  Creating labels...`);
  let labelsCreated = 0;
  for (const tLabel of trelloLabels) {
    if (globalMaps.has(`label:${tLabel.id}`)) continue;
    if (!tLabel.name && !tLabel.color) continue;

    const { data: existing } = await sb.from('labels')
      .select('id').eq('board_id', GLEN_KM_BOARD).eq('name', tLabel.name || tLabel.color).limit(1);
    if (existing && existing.length > 0) {
      globalMaps.set(`label:${tLabel.id}`, existing[0].id);
      await sb.from('migration_entity_map').insert({
        job_id: jobId, source_type: 'label', source_id: tLabel.id, target_id: existing[0].id,
      });
      continue;
    }

    const { data: newLabel } = await sb.from('labels')
      .insert({ board_id: GLEN_KM_BOARD, name: tLabel.name || tLabel.color || 'Unnamed', color: TRELLO_COLOR_MAP[tLabel.color] || '#94a3b8' })
      .select().single();
    if (newLabel) {
      globalMaps.set(`label:${tLabel.id}`, newLabel.id);
      await sb.from('migration_entity_map').insert({
        job_id: jobId, source_type: 'label', source_id: tLabel.id, target_id: newLabel.id,
      });
      labelsCreated++;
    }
  }
  log(`  Labels: ${labelsCreated} created`);

  // 2. Create lists
  log(`  Creating lists...`);
  let listsCreated = 0;
  for (let i = 0; i < trelloLists.length; i++) {
    const tList = trelloLists[i];
    if (globalMaps.has(`list:${tList.id}`)) continue;

    const { data: existing } = await sb.from('lists')
      .select('id').eq('board_id', GLEN_KM_BOARD).ilike('name', tList.name).limit(1);
    if (existing && existing.length > 0) {
      globalMaps.set(`list:${tList.id}`, existing[0].id);
      await sb.from('migration_entity_map').insert({
        job_id: jobId, source_type: 'list', source_id: tList.id, target_id: existing[0].id,
      });
      continue;
    }

    const { data: newList } = await sb.from('lists')
      .insert({ board_id: GLEN_KM_BOARD, name: tList.name, position: i })
      .select().single();
    if (newList) {
      globalMaps.set(`list:${tList.id}`, newList.id);
      await sb.from('migration_entity_map').insert({
        job_id: jobId, source_type: 'list', source_id: tList.id, target_id: newList.id,
      });
      listsCreated++;
    }
  }
  log(`  Lists: ${listsCreated} created`);

  // 3. Create cards (8x concurrency)
  log(`  Creating cards...`);
  let cardsCreated = 0;
  let cardsSkipped = 0;
  let errors = 0;
  const sem = createSem(8);

  async function processCard(tCard) {
    await sem.acquire();
    try {
      if (globalMaps.has(`card:${tCard.id}`)) { cardsSkipped++; return; }

      const targetListId = globalMaps.get(`list:${tCard.idList}`);
      if (!targetListId) { cardsSkipped++; return; }

      const priority = inferPriority(tCard, trelloLabels);
      const { data: newCard } = await sb.from('cards')
        .insert({ title: tCard.name, description: tCard.desc || '', due_date: tCard.due, priority, created_by: ADMIN_USER_ID })
        .select().single();

      if (newCard) {
        await sb.from('card_placements').insert({
          card_id: newCard.id, list_id: targetListId, position: tCard.pos, is_mirror: false,
        });
        const labelInserts = tCard.idLabels
          .map(lid => globalMaps.get(`label:${lid}`))
          .filter(Boolean)
          .map(labelId => ({ card_id: newCard.id, label_id: labelId }));
        if (labelInserts.length > 0) await sb.from('card_labels').insert(labelInserts);

        const assigneeInserts = tCard.idMembers
          .map(mid => USER_MAPPING[mid])
          .filter(u => u && u !== '__skip__')
          .map(u => ({ card_id: newCard.id, user_id: u }));
        if (assigneeInserts.length > 0) await sb.from('card_assignees').insert(assigneeInserts);

        await sb.from('migration_entity_map').insert({
          job_id: jobId, source_type: 'card', source_id: tCard.id, target_id: newCard.id,
          metadata: { original_name: tCard.name },
        });
        globalMaps.set(`card:${tCard.id}`, newCard.id);
        cardsCreated++;
      }
    } catch (err) {
      errors++;
    } finally {
      sem.release();
    }
  }

  const BATCH = 50;
  for (let i = 0; i < openCards.length; i += BATCH) {
    const batch = openCards.slice(i, i + BATCH);
    await Promise.all(batch.map(c => processCard(c)));
    logProgress(`  Cards: ${Math.min(i + BATCH, openCards.length)}/${openCards.length} (${cardsCreated} created, ${cardsSkipped} skipped) [${elapsed()}]`);
  }
  console.log('');
  log(`  Cards done: ${cardsCreated} created, ${cardsSkipped} skipped, ${errors} errors`);

  // 4. Import comments (10x concurrency)
  log(`  Fetching comments...`);
  const trelloComments = await fetchAllComments(GLEN_TRELLO);
  const newComments = trelloComments.filter(tc => {
    if (!tc.data || !tc.data.card) return false;
    if (globalMaps.has(`comment:${tc.id}`)) return false;
    if (!globalMaps.get(`card:${tc.data.card.id}`)) return false;
    return true;
  });
  log(`  ${newComments.length} new comments to import (${trelloComments.length - newComments.length} already exist)`);

  let commentsCreated = 0;
  const cSem = createSem(10);

  const CBATCH = 100;
  for (let i = 0; i < newComments.length; i += CBATCH) {
    const batch = newComments.slice(i, i + CBATCH);
    await Promise.all(batch.map(async (tc) => {
      await cSem.acquire();
      try {
        const targetCardId = globalMaps.get(`card:${tc.data.card.id}`);
        const mapped = USER_MAPPING[tc.idMemberCreator];
        const commentUserId = (mapped && mapped !== '__skip__') ? mapped : ADMIN_USER_ID;
        const { data: newComment } = await sb.from('comments')
          .insert({ card_id: targetCardId, user_id: commentUserId, content: tc.data.text })
          .select().single();
        if (newComment) {
          await sb.from('migration_entity_map').insert({
            job_id: jobId, source_type: 'comment', source_id: tc.id, target_id: newComment.id,
          });
          globalMaps.set(`comment:${tc.id}`, newComment.id);
          commentsCreated++;
        }
      } catch (err) { /* skip */ } finally { cSem.release(); }
    }));
    logProgress(`  Comments: ${Math.min(i + CBATCH, newComments.length)}/${newComments.length} (${commentsCreated} added) [${elapsed()}]`);
  }
  console.log('');
  log(`  Comments done: ${commentsCreated} added`);

  // 5. Import checklists
  log(`  Importing checklists...`);
  let checklistsCreated = 0;
  for (const tCard of openCards) {
    if (!tCard.idChecklists || tCard.idChecklists.length === 0) continue;
    const targetCardId = globalMaps.get(`card:${tCard.id}`);
    if (!targetCardId) continue;
    for (const clId of tCard.idChecklists) {
      if (globalMaps.has(`checklist:${clId}`)) continue;
      try {
        const checklist = await trelloFetch(`/checklists/${clId}`);
        const { data: newCl } = await sb.from('checklists')
          .insert({ card_id: targetCardId, title: checklist.name || 'Checklist' })
          .select().single();
        if (newCl && checklist.checkItems) {
          for (const item of checklist.checkItems) {
            await sb.from('checklist_items').insert({
              checklist_id: newCl.id, title: item.name, is_checked: item.state === 'complete', position: item.pos,
            });
          }
          await sb.from('migration_entity_map').insert({
            job_id: jobId, source_type: 'checklist', source_id: clId, target_id: newCl.id,
          });
          globalMaps.set(`checklist:${clId}`, newCl.id);
          checklistsCreated++;
        }
      } catch (err) { /* skip */ }
    }
  }
  log(`  Checklists done: ${checklistsCreated} created`);

  // Mark job completed
  await sb.from('migration_jobs').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    report: { cards_created: cardsCreated, comments_created: commentsCreated, lists_created: listsCreated, labels_created: labelsCreated, checklists_created: checklistsCreated, errors },
    progress: { phase: 'completed' },
  }).eq('id', jobId);

  return { cardsCreated, commentsCreated, listsCreated, labelsCreated, checklistsCreated };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const marizDeleted = await fixMarizDuplicates();
  const glenResult = await fixGlenBoard();

  log('');
  log('========================================');
  log('ALL FIXES COMPLETE');
  log('========================================');
  log(`  Total time: ${elapsed()}`);
  log(`  Mariz: ${marizDeleted} duplicate empty lists deleted`);
  log(`  Glen: ${glenResult.listsCreated} lists, ${glenResult.cardsCreated} cards, ${glenResult.commentsCreated} comments, ${glenResult.checklistsCreated} checklists created`);
})();
