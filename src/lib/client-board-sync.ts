import { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_CLIENT_BOARD_LISTS = ['Backlog', 'In Progress', 'Review', 'Done'];

/**
 * Find or create a dedicated client board (type='client_board') for the given client.
 * Creates default lists if the board is newly created.
 */
export async function getOrCreateClientBoard(
  supabase: SupabaseClient,
  clientId: string
): Promise<{ id: string; lists: { id: string; name: string; position: number }[] }> {
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
    .insert({
      name: boardName,
      type: 'client_board',
      client_id: clientId,
    })
    .select('id')
    .single();

  if (boardError || !newBoard) {
    throw new Error(`Failed to create client board: ${boardError?.message}`);
  }

  // Create default lists
  const listInserts = DEFAULT_CLIENT_BOARD_LISTS.map((name, i) => ({
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

/**
 * Create a mirror placement for a card on the client's board.
 * Placed in the first list (Backlog) by default.
 * No-op if a mirror already exists on the client board.
 */
export async function ensureClientBoardMirror(
  supabase: SupabaseClient,
  cardId: string,
  clientId: string
): Promise<void> {
  const board = await getOrCreateClientBoard(supabase, clientId);
  if (board.lists.length === 0) return;

  const listIds = board.lists.map((l) => l.id);

  // Check if mirror already exists on this client board
  const { data: existing } = await supabase
    .from('card_placements')
    .select('id')
    .eq('card_id', cardId)
    .in('list_id', listIds)
    .eq('is_mirror', true)
    .limit(1);

  if (existing && existing.length > 0) return;

  // Get max position in the first list
  const targetListId = board.lists[0].id;
  const { data: maxPos } = await supabase
    .from('card_placements')
    .select('position')
    .eq('list_id', targetListId)
    .order('position', { ascending: false })
    .limit(1);

  const nextPosition = (maxPos?.[0]?.position ?? -1) + 1;

  await supabase.from('card_placements').insert({
    card_id: cardId,
    list_id: targetListId,
    position: nextPosition,
    is_mirror: true,
  });
}

/**
 * Remove all mirror placements for a card from the client's board.
 */
export async function removeClientBoardMirror(
  supabase: SupabaseClient,
  cardId: string,
  clientId: string
): Promise<void> {
  // Find the client's board
  const { data: board } = await supabase
    .from('boards')
    .select('id')
    .eq('client_id', clientId)
    .eq('type', 'client_board')
    .single();

  if (!board) return;

  // Get all list IDs on this board
  const { data: lists } = await supabase
    .from('lists')
    .select('id')
    .eq('board_id', board.id);

  if (!lists || lists.length === 0) return;

  const listIds = lists.map((l) => l.id);

  // Delete mirror placements for this card on this board
  await supabase
    .from('card_placements')
    .delete()
    .eq('card_id', cardId)
    .eq('is_mirror', true)
    .in('list_id', listIds);
}

/**
 * Sync mirrors when client_id changes on a card.
 * Removes mirror from old client board, adds to new client board (if visible).
 */
export async function syncClientBoardMirrorOnClientChange(
  supabase: SupabaseClient,
  cardId: string,
  oldClientId: string | null,
  newClientId: string | null,
  isClientVisible: boolean
): Promise<void> {
  if (oldClientId) {
    await removeClientBoardMirror(supabase, cardId, oldClientId);
  }
  if (newClientId && isClientVisible) {
    await ensureClientBoardMirror(supabase, cardId, newClientId);
  }
}
