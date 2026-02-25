/**
 * Backfill script: Create mirror placements on client boards
 * for existing cards that have is_client_visible=true and a client_id set.
 *
 * Usage: node scripts/backfill-client-mirrors.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Read env
const env = readFileSync('C:/Users/raviv/agency-board/.env.local', 'utf8');
const getEnv = (key) => {
  const match = env.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return match ? match[1].trim() : null;
};

const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const SERVICE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SERVICE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const DEFAULT_LISTS = ['Backlog', 'In Progress', 'Review', 'Done'];

async function getOrCreateClientBoard(clientId) {
  // Check for existing client board
  const { data: existingBoard } = await supabase
    .from('boards')
    .select('id')
    .eq('client_id', clientId)
    .eq('type', 'client_board')
    .single();

  if (existingBoard) {
    const { data: lists } = await supabase
      .from('lists')
      .select('id, name, position')
      .eq('board_id', existingBoard.id)
      .order('position');
    return { id: existingBoard.id, lists: lists || [] };
  }

  // Get client name for board title
  const { data: client } = await supabase
    .from('clients')
    .select('name')
    .eq('id', clientId)
    .single();

  const boardName = client?.name ? `${client.name} Board` : 'Client Board';

  // Create the board
  const { data: newBoard, error: boardError } = await supabase
    .from('boards')
    .insert({ name: boardName, type: 'client_board', client_id: clientId })
    .select('id')
    .single();

  if (boardError || !newBoard) {
    throw new Error(`Failed to create client board for ${clientId}: ${boardError?.message}`);
  }

  // Create default lists
  const listInserts = DEFAULT_LISTS.map((name, i) => ({
    board_id: newBoard.id,
    name,
    position: i,
  }));

  const { data: lists } = await supabase
    .from('lists')
    .insert(listInserts)
    .select('id, name, position');

  // Link via client_boards table
  await supabase.from('client_boards').upsert(
    { client_id: clientId, board_id: newBoard.id, is_active: true },
    { onConflict: 'client_id,board_id' }
  );

  return { id: newBoard.id, lists: lists || [] };
}

async function main() {
  console.log('Fetching cards with is_client_visible=true and client_id set...');

  const { data: cards, error } = await supabase
    .from('cards')
    .select('id, client_id, title')
    .eq('is_client_visible', true)
    .not('client_id', 'is', null);

  if (error) {
    console.error('Error fetching cards:', error.message);
    process.exit(1);
  }

  if (!cards || cards.length === 0) {
    console.log('No cards found needing backfill.');
    return;
  }

  console.log(`Found ${cards.length} card(s) to process.`);

  // Group cards by client_id
  const byClient = {};
  for (const card of cards) {
    if (!byClient[card.client_id]) byClient[card.client_id] = [];
    byClient[card.client_id].push(card);
  }

  let created = 0;
  let skipped = 0;

  for (const [clientId, clientCards] of Object.entries(byClient)) {
    console.log(`\nProcessing client ${clientId} (${clientCards.length} cards)...`);

    let board;
    try {
      board = await getOrCreateClientBoard(clientId);
      console.log(`  Board: ${board.id} with ${board.lists.length} lists`);
    } catch (err) {
      console.error(`  Error creating board for client ${clientId}:`, err.message);
      continue;
    }

    if (board.lists.length === 0) {
      console.log('  No lists on board, skipping.');
      continue;
    }

    const targetListId = board.lists[0].id; // Backlog
    const listIds = board.lists.map((l) => l.id);

    for (const card of clientCards) {
      // Check if mirror already exists
      const { data: existing } = await supabase
        .from('card_placements')
        .select('id')
        .eq('card_id', card.id)
        .in('list_id', listIds)
        .eq('is_mirror', true)
        .limit(1);

      if (existing && existing.length > 0) {
        console.log(`  Skip: "${card.title}" (mirror already exists)`);
        skipped++;
        continue;
      }

      // Get next position
      const { data: maxPos } = await supabase
        .from('card_placements')
        .select('position')
        .eq('list_id', targetListId)
        .order('position', { ascending: false })
        .limit(1);

      const nextPosition = (maxPos?.[0]?.position ?? -1) + 1;

      const { error: insertErr } = await supabase.from('card_placements').insert({
        card_id: card.id,
        list_id: targetListId,
        position: nextPosition,
        is_mirror: true,
      });

      if (insertErr) {
        console.error(`  Error creating mirror for "${card.title}":`, insertErr.message);
      } else {
        console.log(`  Created mirror for "${card.title}" at position ${nextPosition}`);
        created++;
      }
    }
  }

  console.log(`\nDone! Created: ${created}, Skipped (already mirrored): ${skipped}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
