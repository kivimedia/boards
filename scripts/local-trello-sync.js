#!/usr/bin/env node
/**
 * Local 6-board Trello sync script.
 * Runs outside Vercel (no 5-min timeout). Uses Supabase service role key.
 *
 * Usage: export $(grep -v '^#' .env.local | xargs) && node scripts/local-trello-sync.js
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// ─── Config ───────────────────────────────────────────────────────────────────

const TRELLO_API_BASE = 'https://api.trello.com/1';
const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE env vars. Run: export $(grep -v "^#" .env.local | xargs) && node scripts/local-trello-sync.js');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// User ID for migration (admin)
const ADMIN_USER_ID = '9fdf34b0-bc1e-40e0-9aae-7846e0efe770';

// 6 boards: Trello ID → KMBoard target ID + name
const BOARDS = [
  { trelloId: '5f2ebfea3379be79550b60f0', targetId: 'fd5f0606-e30c-4c1a-9cc8-fb6a02057619', trelloName: 'Abs', kmName: 'Dev Board' },
  { trelloId: '5f7e01bd200e1e0ff8c23320', targetId: '00b502d5-c05b-46ef-900a-ba594e8ac730', trelloName: 'Daily Cookie Copywriters', kmName: 'Account Managers' },
  { trelloId: '5f73325f53a6451d2618d238', targetId: 'a4523939-07d2-4c8b-a4cc-1764f1bb7c12', trelloName: 'Glen', kmName: 'Design Board' },
  { trelloId: '5e0ee7c8c98da78b707c2944', targetId: '18413c78-473c-4fb6-9f42-5c2428140d66', trelloName: 'Jesus', kmName: 'Design Board (Jesus)' },
  { trelloId: '5cd58c883cbb325032444b5c', targetId: '2a7b6c44-4380-4c60-a14b-de94ab70facb', trelloName: 'Mariz', kmName: 'Executive Assistant' },
  { trelloId: '68c68b2fd8a6ec847872837c', targetId: '94b7b432-3f62-41ee-8e2a-7d6caa568a38', trelloName: 'Video Editing', kmName: 'Video Board' },
];

// 16 Trello users → KMBoard profile IDs
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uuid() { return crypto.randomUUID(); }

const startTime = Date.now();
let totalCardsProcessed = 0;
let totalCommentsProcessed = 0;
let totalErrors = 0;

function elapsed() {
  const s = Math.floor((Date.now() - startTime) / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${s % 60}s` : `${s}s`;
}

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function logProgress(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  process.stdout.write(`\r[${ts}] ${msg}                    `);
}

async function trelloFetch(path, params = {}, retries = 3) {
  const url = new URL(`${TRELLO_API_BASE}${path}`);
  url.searchParams.set('key', TRELLO_KEY);
  url.searchParams.set('token', TRELLO_TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(60000) });
      if (res.status === 429) {
        const wait = parseInt(res.headers.get('retry-after') || '10', 10) || 10;
        log(`  Rate limited on ${path}, waiting ${wait}s...`);
        await new Promise(r => setTimeout(r, wait * 1000));
        continue;
      }
      if (!res.ok) throw new Error(`Trello ${res.status} for ${path}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 10000);
      log(`  Retry ${attempt}/${retries} for ${path}: ${err.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function fetchAllComments(boardId) {
  const all = [];
  let before;
  while (true) {
    const params = { filter: 'commentCard', limit: '1000' };
    if (before) params.before = before;
    const page = await trelloFetch(`/boards/${boardId}/actions`, params);
    if (!page || page.length === 0) break;
    all.push(...page);
    if (page.length < 1000) break;
    before = page[page.length - 1].id;
  }
  return all;
}

// Load all entity mappings across ALL jobs for cross-job dedup
async function loadGlobalMappings(sourceTypes) {
  const map = new Map(); // key: "type:sourceId" → targetId
  for (const sourceType of sourceTypes) {
    let offset = 0;
    while (true) {
      const { data } = await supabase
        .from('migration_entity_map')
        .select('source_id, target_id')
        .eq('source_type', sourceType)
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      for (const row of data) map.set(`${sourceType}:${row.source_id}`, row.target_id);
      if (data.length < 1000) break;
      offset += 1000;
    }
  }
  return map;
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

// ─── Create migration job record ─────────────────────────────────────────────

async function createJob() {
  const jobId = uuid();
  const config = {
    trello_api_key: TRELLO_KEY,
    trello_token: TRELLO_TOKEN,
    board_ids: BOARDS.map(b => b.trelloId),
    sync_mode: 'merge',
    board_type_mapping: Object.fromEntries(BOARDS.map(b => [b.trelloId, 'dev'])),
    board_merge_targets: Object.fromEntries(BOARDS.map(b => [b.trelloId, b.targetId])),
    user_mapping: USER_MAPPING,
  };

  await supabase.from('migration_jobs').insert({
    id: jobId,
    status: 'running',
    started_at: new Date().toISOString(),
    config,
    created_by: ADMIN_USER_ID,
    progress: { phase: 'starting', detail: 'Local 6-board sync' },
    report: { boards_created: 0, lists_created: 0, cards_created: 0, cards_updated: 0, comments_created: 0, attachments_created: 0, labels_created: 0, checklists_created: 0, errors: [] },
  });

  return jobId;
}

// ─── Board sync functions ─────────────────────────────────────────────────────

async function syncBoard(board, jobId, globalMaps) {
  const { trelloId, targetId, trelloName, kmName } = board;
  log(`\n========================================`);
  log(`BOARD: ${trelloName} → ${kmName}`);
  log(`========================================`);

  // Ensure board mapping exists
  if (!globalMaps.has(`board:${trelloId}`)) {
    await supabase.from('migration_entity_map').insert({
      job_id: jobId, source_type: 'board', source_id: trelloId, target_id: targetId, metadata: { name: trelloName },
    });
    globalMaps.set(`board:${trelloId}`, targetId);
  }

  // 1. Fetch Trello data
  log(`  Fetching Trello data...`);
  const [trelloLists, trelloCards, trelloLabels] = await Promise.all([
    trelloFetch(`/boards/${trelloId}/lists`, { filter: 'all' }),
    trelloFetch(`/boards/${trelloId}/cards`, { filter: 'all' }),
    trelloFetch(`/boards/${trelloId}/labels`),
  ]);
  const openCards = trelloCards.filter(c => !c.closed).sort((a, b) => {
    if (a.idList !== b.idList) return a.idList.localeCompare(b.idList);
    return a.pos - b.pos;
  });
  log(`  Found ${trelloLists.length} lists, ${openCards.length} open cards, ${trelloLabels.length} labels`);

  // 2. Sync labels
  log(`  Syncing labels...`);
  let labelsCreated = 0;
  for (const tLabel of trelloLabels) {
    if (globalMaps.has(`label:${tLabel.id}`)) continue;
    if (!tLabel.name && !tLabel.color) continue;
    const { data: existing } = await supabase.from('labels')
      .select('id').eq('board_id', targetId).eq('name', tLabel.name || tLabel.color).limit(1);
    if (existing && existing.length > 0) {
      globalMaps.set(`label:${tLabel.id}`, existing[0].id);
      await supabase.from('migration_entity_map').insert({
        job_id: jobId, source_type: 'label', source_id: tLabel.id, target_id: existing[0].id,
      });
      continue;
    }
    const { data: newLabel } = await supabase.from('labels')
      .insert({ board_id: targetId, name: tLabel.name || tLabel.color || 'Unnamed', color: TRELLO_COLOR_MAP[tLabel.color] || '#94a3b8' })
      .select().single();
    if (newLabel) {
      globalMaps.set(`label:${tLabel.id}`, newLabel.id);
      await supabase.from('migration_entity_map').insert({
        job_id: jobId, source_type: 'label', source_id: tLabel.id, target_id: newLabel.id,
      });
      labelsCreated++;
    }
  }
  log(`  Labels: ${labelsCreated} new, ${trelloLabels.length - labelsCreated} existing`);

  // 3. Sync lists
  log(`  Syncing lists...`);
  let listsCreated = 0;
  for (const tList of trelloLists) {
    if (globalMaps.has(`list:${tList.id}`)) continue;
    // Check if list name already exists on target board
    const { data: existing } = await supabase.from('lists')
      .select('id').eq('board_id', targetId).ilike('name', tList.name).limit(1);
    if (existing && existing.length > 0) {
      globalMaps.set(`list:${tList.id}`, existing[0].id);
      await supabase.from('migration_entity_map').insert({
        job_id: jobId, source_type: 'list', source_id: tList.id, target_id: existing[0].id,
      });
      continue;
    }
    // Create new list
    const { data: newList } = await supabase.from('lists')
      .insert({ board_id: targetId, name: tList.name, position: tList.pos })
      .select().single();
    if (newList) {
      globalMaps.set(`list:${tList.id}`, newList.id);
      await supabase.from('migration_entity_map').insert({
        job_id: jobId, source_type: 'list', source_id: tList.id, target_id: newList.id,
      });
      listsCreated++;
    }
  }
  log(`  Lists: ${listsCreated} new, ${trelloLists.length - listsCreated} existing`);

  // 4. Sync cards (MERGE MODE - don't change locations of existing cards!)
  log(`  Syncing cards...`);
  let cardsUpdated = 0;
  let cardsCreated = 0;
  let cardsSkipped = 0;

  // Process cards with 8x concurrency for speed
  const CONCURRENCY = 8;
  const BATCH = 50;
  let active = 0;
  const queue = [];

  function semAcquire() {
    if (active < CONCURRENCY) { active++; return Promise.resolve(); }
    return new Promise(resolve => queue.push(resolve));
  }
  function semRelease() {
    active--;
    if (queue.length > 0) { active++; queue.shift()(); }
  }

  async function processCard(tCard) {
    await semAcquire();
    try {
      const existingTargetId = globalMaps.get(`card:${tCard.id}`);
      const targetListId = globalMaps.get(`list:${tCard.idList}`);

      if (existingTargetId) {
        // MERGE: Update card fields but do NOT change placement (requirement #2)
        const priority = inferPriority(tCard, trelloLabels);
        await supabase.from('cards')
          .update({ title: tCard.name, description: tCard.desc || '', due_date: tCard.due, priority })
          .eq('id', existingTargetId);

        // Re-sync labels
        await supabase.from('card_labels').delete().eq('card_id', existingTargetId);
        const labelInserts = tCard.idLabels
          .map(lid => globalMaps.get(`label:${lid}`))
          .filter(Boolean)
          .map(labelId => ({ card_id: existingTargetId, label_id: labelId }));
        if (labelInserts.length > 0) await supabase.from('card_labels').insert(labelInserts);

        // Re-sync assignees
        await supabase.from('card_assignees').delete().eq('card_id', existingTargetId);
        const assigneeInserts = tCard.idMembers
          .map(mid => USER_MAPPING[mid])
          .filter(u => u && u !== '__skip__')
          .map(u => ({ card_id: existingTargetId, user_id: u }));
        if (assigneeInserts.length > 0) await supabase.from('card_assignees').insert(assigneeInserts);

        cardsUpdated++;
      } else if (targetListId) {
        // NEW: Create card + placement
        const priority = inferPriority(tCard, trelloLabels);
        const { data: newCard } = await supabase.from('cards')
          .insert({ title: tCard.name, description: tCard.desc || '', due_date: tCard.due, priority, created_by: ADMIN_USER_ID })
          .select().single();

        if (newCard) {
          await supabase.from('card_placements').insert({
            card_id: newCard.id, list_id: targetListId, position: tCard.pos, is_mirror: false,
          });
          const labelInserts = tCard.idLabels
            .map(lid => globalMaps.get(`label:${lid}`))
            .filter(Boolean)
            .map(labelId => ({ card_id: newCard.id, label_id: labelId }));
          if (labelInserts.length > 0) await supabase.from('card_labels').insert(labelInserts);
          const assigneeInserts = tCard.idMembers
            .map(mid => USER_MAPPING[mid])
            .filter(u => u && u !== '__skip__')
            .map(u => ({ card_id: newCard.id, user_id: u }));
          if (assigneeInserts.length > 0) await supabase.from('card_assignees').insert(assigneeInserts);
          await supabase.from('migration_entity_map').insert({
            job_id: jobId, source_type: 'card', source_id: tCard.id, target_id: newCard.id,
            metadata: { original_name: tCard.name },
          });
          globalMaps.set(`card:${tCard.id}`, newCard.id);
          cardsCreated++;
        }
      } else {
        cardsSkipped++;
      }
    } catch (err) {
      totalErrors++;
    } finally {
      semRelease();
    }
  }

  for (let i = 0; i < openCards.length; i += BATCH) {
    const batch = openCards.slice(i, i + BATCH);
    const batchEnd = Math.min(i + BATCH, openCards.length);

    await Promise.all(batch.map(tCard => processCard(tCard)));

    totalCardsProcessed += batch.length;
    logProgress(`  Cards: ${batchEnd}/${openCards.length} (${cardsUpdated} updated, ${cardsCreated} new, ${cardsSkipped} skipped) [${elapsed()}]`);
  }
  console.log(''); // newline after \r progress
  log(`  Cards done: ${cardsUpdated} updated, ${cardsCreated} new, ${cardsSkipped} skipped`);

  // 5. Sync comments (only ADD new ones from Trello, never delete KMBoard comments)
  log(`  Fetching Trello comments...`);
  const trelloComments = await fetchAllComments(trelloId);
  log(`  Found ${trelloComments.length} Trello comments`);

  let commentsCreated = 0;
  let commentsSkipped = 0;

  // Pre-filter comments that can be skipped (no card, already imported, no target)
  const newComments = trelloComments.filter(tc => {
    if (!tc.data?.card) return false;
    if (globalMaps.has(`comment:${tc.id}`)) return false;
    if (!globalMaps.get(`card:${tc.data.card.id}`)) return false;
    return true;
  });
  commentsSkipped = trelloComments.length - newComments.length;
  log(`  ${newComments.length} new comments to add, ${commentsSkipped} already exist`);

  // Process comments with 10x concurrency
  let cActive = 0;
  const cQueue = [];
  function cAcquire() { if (cActive < 10) { cActive++; return Promise.resolve(); } return new Promise(r => cQueue.push(r)); }
  function cRelease() { cActive--; if (cQueue.length > 0) { cActive++; cQueue.shift()(); } }

  const COMMENT_BATCH = 100;
  for (let i = 0; i < newComments.length; i += COMMENT_BATCH) {
    const batch = newComments.slice(i, i + COMMENT_BATCH);
    const batchEnd = Math.min(i + COMMENT_BATCH, newComments.length);

    await Promise.all(batch.map(async (tc) => {
      await cAcquire();
      try {
        const targetCardId = globalMaps.get(`card:${tc.data.card.id}`);
        const mapped = USER_MAPPING[tc.idMemberCreator];
        const commentUserId = (mapped && mapped !== '__skip__') ? mapped : ADMIN_USER_ID;

        const { data: newComment } = await supabase.from('comments')
          .insert({ card_id: targetCardId, user_id: commentUserId, content: tc.data.text })
          .select().single();
        if (newComment) {
          await supabase.from('migration_entity_map').insert({
            job_id: jobId, source_type: 'comment', source_id: tc.id, target_id: newComment.id,
          });
          globalMaps.set(`comment:${tc.id}`, newComment.id);
          commentsCreated++;
        }
      } catch (err) {
        totalErrors++;
      } finally {
        cRelease();
      }
    }));

    totalCommentsProcessed += batch.length;
    logProgress(`  Comments: ${batchEnd}/${newComments.length} (${commentsCreated} added) [${elapsed()}]`);
  }
  console.log('');
  log(`  Comments done: ${commentsCreated} new, ${commentsSkipped} skipped`);

  // 6. Sync checklists
  log(`  Syncing checklists...`);
  let checklistsCreated = 0;
  let checklistsSkipped = 0;
  let clIdx = 0;

  for (const tCard of openCards) {
    if (!tCard.idChecklists || tCard.idChecklists.length === 0) continue;
    const targetCardId = globalMaps.get(`card:${tCard.id}`);
    if (!targetCardId) continue;

    for (const clId of tCard.idChecklists) {
      if (globalMaps.has(`checklist:${clId}`)) { checklistsSkipped++; continue; }
      try {
        const checklist = await trelloFetch(`/checklists/${clId}`);
        const { data: newCl } = await supabase.from('checklists')
          .insert({ card_id: targetCardId, title: checklist.name || 'Checklist' })
          .select().single();
        if (newCl && checklist.checkItems) {
          for (const item of checklist.checkItems) {
            await supabase.from('checklist_items').insert({
              checklist_id: newCl.id, title: item.name, is_checked: item.state === 'complete', position: item.pos,
            });
          }
          await supabase.from('migration_entity_map').insert({
            job_id: jobId, source_type: 'checklist', source_id: clId, target_id: newCl.id,
          });
          globalMaps.set(`checklist:${clId}`, newCl.id);
          checklistsCreated++;
        }
      } catch (err) {
        totalErrors++;
      }
    }
    clIdx++;
    if (clIdx % 20 === 0) logProgress(`  Checklists: ${clIdx} cards scanned, ${checklistsCreated} new [${elapsed()}]`);
  }
  console.log('');
  log(`  Checklists done: ${checklistsCreated} new, ${checklistsSkipped} skipped`);

  return { cardsUpdated, cardsCreated, commentsCreated, checklistsCreated, labelsCreated, listsCreated };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('=== LOCAL 6-BOARD TRELLO SYNC ===');
  log('');

  // Print plan
  log('BOARDS TO SYNC:');
  for (const b of BOARDS) {
    log(`  ${b.trelloName} → ${b.kmName}`);
  }
  log('');
  log('USER MAPPING (16 users):');
  // Fetch profile names for display
  const profileIds = [...new Set(Object.values(USER_MAPPING))];
  const { data: profiles } = await supabase.from('profiles').select('id, display_name').in('id', profileIds);
  const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p.display_name]));
  for (const [trelloId, kmId] of Object.entries(USER_MAPPING)) {
    log(`  Trello ${trelloId.slice(0, 8)}... → ${profileMap[kmId] || kmId}`);
  }
  log('');
  log('RULES:');
  log('  - Merge mode: update existing cards (title, desc, due, priority, labels, assignees)');
  log('  - Do NOT move cards that exist on KMBoards (preserve current placement)');
  log('  - Do NOT delete KMBoard comments (only add new Trello comments)');
  log('  - Do NOT remove stale placements');
  log('');

  // Count Trello cards first
  log('Counting Trello cards...');
  let totalTrelloCards = 0;
  let totalTrelloComments = 0;
  for (const b of BOARDS) {
    const cards = await trelloFetch(`/boards/${b.trelloId}/cards`, { filter: 'all' });
    const openCount = cards.filter(c => !c.closed).length;
    totalTrelloCards += openCount;
    log(`  ${b.trelloName}: ${openCount} open cards`);
  }
  log(`  Total: ${totalTrelloCards} cards`);
  const estMinutes = Math.ceil(totalTrelloCards / 300); // ~5 cards/sec = 300/min
  log(`  Estimated time: ~${estMinutes}-${estMinutes * 2} minutes`);
  log('');

  // Load global mappings (across all previous migration jobs)
  log('Loading existing entity mappings...');
  const globalMaps = await loadGlobalMappings(['board', 'list', 'card', 'label', 'comment', 'checklist']);
  log(`  Loaded ${globalMaps.size} existing mappings`);
  log('');

  // Create job record
  const jobId = await createJob();
  log(`Migration job: ${jobId}`);
  log('');

  // Process each board
  const results = { cardsUpdated: 0, cardsCreated: 0, commentsCreated: 0, checklistsCreated: 0, labelsCreated: 0, listsCreated: 0 };

  for (const board of BOARDS) {
    try {
      const r = await syncBoard(board, jobId, globalMaps);
      results.cardsUpdated += r.cardsUpdated;
      results.cardsCreated += r.cardsCreated;
      results.commentsCreated += r.commentsCreated;
      results.checklistsCreated += r.checklistsCreated;
      results.labelsCreated += r.labelsCreated;
      results.listsCreated += r.listsCreated;
    } catch (err) {
      totalErrors++;
      log(`FATAL ERROR on board ${board.trelloName}: ${err.message}`);
      log(err.stack);
    }
  }

  // Mark job completed
  await supabase.from('migration_jobs').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    report: {
      boards_created: 0,
      lists_created: results.listsCreated,
      cards_created: results.cardsCreated,
      cards_updated: results.cardsUpdated,
      comments_created: results.commentsCreated,
      attachments_created: 0,
      labels_created: results.labelsCreated,
      checklists_created: results.checklistsCreated,
      errors: [],
    },
    progress: { phase: 'completed', detail: 'Local sync finished' },
  }).eq('id', jobId);

  // Final summary
  log('');
  log('========================================');
  log('SYNC COMPLETE');
  log('========================================');
  log(`  Total time: ${elapsed()}`);
  log(`  Cards updated: ${results.cardsUpdated}`);
  log(`  Cards created: ${results.cardsCreated}`);
  log(`  Comments added: ${results.commentsCreated}`);
  log(`  Checklists added: ${results.checklistsCreated}`);
  log(`  Labels added: ${results.labelsCreated}`);
  log(`  Lists added: ${results.listsCreated}`);
  log(`  Errors: ${totalErrors}`);
  log(`  Job ID: ${jobId}`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
