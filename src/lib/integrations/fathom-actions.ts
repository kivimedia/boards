import { SupabaseClient } from '@supabase/supabase-js';
import type { ActionItem } from './fathom-analysis';

// ============================================================================
// FATHOM AUTO-ACTIONS
// Posts meeting summaries as card comments and creates action item cards
// on the client's active board.
// ============================================================================

/**
 * Post a formatted meeting summary as a comment on an existing card.
 * Uses the [Agent] prefix convention for system-generated comments.
 */
export async function postMeetingSummaryToCard(params: {
  recordingId: string;
  cardId: string;
  title: string;
  summary: string;
  actionItems: ActionItem[];
  shareUrl: string | null;
  supabase: SupabaseClient;
  systemUserId: string;
}): Promise<boolean> {
  const { cardId, title, summary, actionItems, shareUrl, supabase, systemUserId } = params;

  // Build formatted comment
  const parts: string[] = [
    `[Agent] Fathom Meeting: ${title}`,
    '',
    summary,
  ];

  if (actionItems.length > 0) {
    parts.push('');
    parts.push('Action Items:');
    for (const item of actionItems) {
      const assigneeSuffix = item.assignee ? ` (assigned: ${item.assignee})` : '';
      parts.push(`- ${item.text}${assigneeSuffix}`);
    }
  }

  if (shareUrl) {
    parts.push('');
    parts.push(`[Watch Recording](${shareUrl})`);
  }

  const content = parts.join('\n');

  const { error } = await supabase.from('comments').insert({
    id: crypto.randomUUID(),
    card_id: cardId,
    user_id: systemUserId,
    content,
    is_external: false,
  });

  if (error) {
    console.error(
      '[fathom-actions] Failed to post meeting summary comment to card',
      cardId,
      ':',
      error.message
    );
    return false;
  }

  console.log(
    '[fathom-actions] Posted meeting summary comment to card',
    cardId,
    '-',
    actionItems.length,
    'action items referenced'
  );

  return true;
}

/**
 * Create individual cards for each action item on the client's active board.
 * Cards are placed in the "Backlog" list (or the first list if no Backlog exists).
 */
export async function createActionItemCards(params: {
  recordingId: string;
  clientId: string;
  meetingTitle: string;
  actionItems: ActionItem[];
  shareUrl: string | null;
  supabase: SupabaseClient;
  createdBy: string;
}): Promise<{ created: number; boardId: string | null }> {
  const { clientId, meetingTitle, actionItems, shareUrl, supabase, createdBy } = params;

  if (actionItems.length === 0) {
    return { created: 0, boardId: null };
  }

  // Find active client board
  const { data: clientBoard } = await supabase
    .from('client_boards')
    .select('board_id')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (!clientBoard) {
    console.warn(
      '[fathom-actions] No active board found for client',
      clientId,
      '- skipping action item card creation'
    );
    return { created: 0, boardId: null };
  }

  const boardId = clientBoard.board_id;

  // Find "Backlog" list, or fall back to first list on the board
  const { data: lists } = await supabase
    .from('lists')
    .select('id, name, position')
    .eq('board_id', boardId)
    .order('position', { ascending: true });

  if (!lists || lists.length === 0) {
    console.warn(
      '[fathom-actions] No lists found on board',
      boardId,
      '- skipping action item card creation'
    );
    return { created: 0, boardId };
  }

  const backlogList = lists.find(
    (l: { id: string; name: string; position: number }) =>
      l.name.toLowerCase() === 'backlog'
  );
  const targetList = backlogList || lists[0];

  // Get current max position in the target list
  const { data: maxPosRows } = await supabase
    .from('card_placements')
    .select('position')
    .eq('list_id', targetList.id)
    .order('position', { ascending: false })
    .limit(1);

  let nextPosition = maxPosRows?.length ? (maxPosRows[0] as { position: number }).position + 1 : 0;
  let created = 0;

  for (const item of actionItems) {
    const cardId = crypto.randomUUID();
    const title = item.text.length > 100 ? item.text.slice(0, 97) + '...' : item.text;

    // Build description with meeting context
    const descParts: string[] = [
      `Action item from meeting: ${meetingTitle}`,
    ];
    if (item.assignee) {
      descParts.push(`Assignee: ${item.assignee}`);
    }
    if (item.due_date) {
      descParts.push(`Due: ${item.due_date}`);
    }
    if (shareUrl) {
      descParts.push('');
      descParts.push(`[Watch Recording](${shareUrl})`);
    }

    const description = descParts.join('\n');
    const priority = item.priority || 'none';

    // Create the card
    const { error: cardError } = await supabase.from('cards').insert({
      id: cardId,
      title,
      description,
      priority,
      created_by: createdBy,
    });

    if (cardError) {
      console.error(
        '[fathom-actions] Failed to create action item card:',
        cardError.message
      );
      continue;
    }

    // Create the placement
    const { error: placementError } = await supabase.from('card_placements').insert({
      card_id: cardId,
      list_id: targetList.id,
      position: nextPosition,
      is_mirror: false,
    });

    if (placementError) {
      console.error(
        '[fathom-actions] Card created but placement failed for card',
        cardId,
        ':',
        placementError.message
      );
      // Card exists but has no placement - still count it
    }

    nextPosition++;
    created++;
  }

  console.log(
    '[fathom-actions] Created',
    created,
    'action item cards on board',
    boardId,
    'in list',
    targetList.name
  );

  return { created, boardId };
}
