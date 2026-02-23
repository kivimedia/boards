import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { evaluateRules, TriggerEvent } from '@/lib/automation-engine';
import { getBriefedListName } from '@/lib/briefing';
import { notifyCardAssignees } from '@/lib/notification-service';
import { safeNextPosition } from '@/lib/safeNextPosition';
import { SupabaseClient } from '@supabase/supabase-js';

interface Params {
  params: { id: string };
}

interface MoveCardBody {
  placement_id: string;
  list_id: string;
  position: number;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<MoveCardBody>(request);
  if (!body.ok) return body.response;

  const { placement_id, list_id, position } = body.body;
  if (!placement_id || !list_id || position === undefined) {
    return errorResponse('placement_id, list_id, and position are required');
  }

  const { supabase, userId } = auth.ctx;
  const cardId = params.id;

  // Fetch the current placement to get the "from" list before updating
  const { data: currentPlacement } = await supabase
    .from('card_placements')
    .select('list_id')
    .eq('id', placement_id)
    .eq('card_id', cardId)
    .single();

  const fromListId = currentPlacement?.list_id as string | undefined;

  // Brief completeness enforcement: check if moving FROM the "Briefed" list
  if (fromListId && fromListId !== list_id) {
    const { data: fromList } = await supabase
      .from('lists')
      .select('name')
      .eq('id', fromListId)
      .single();

    if (fromList?.name === getBriefedListName()) {
      const { data: brief } = await supabase
        .from('card_briefs')
        .select('is_complete')
        .eq('card_id', cardId)
        .single();

      if (!brief || !brief.is_complete) {
        return errorResponse('Card brief must be complete before moving out of Briefed');
      }
    }
  }

  // Perform the move
  const { data, error } = await supabase
    .from('card_placements')
    .update({ list_id, position })
    .eq('id', placement_id)
    .eq('card_id', cardId)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);

  // Look up list names for the automation trigger event
  const listIds = [list_id];
  if (fromListId && fromListId !== list_id) {
    listIds.push(fromListId);
  }

  const { data: lists } = await supabase
    .from('lists')
    .select('id, name, board_id')
    .in('id', listIds);

  const toList = lists?.find((l: { id: string }) => l.id === list_id);
  const fromList = fromListId
    ? lists?.find((l: { id: string }) => l.id === fromListId)
    : null;

  // Fire automation rules if the card actually moved to a different list
  if (toList && fromListId !== list_id) {
    const boardId = toList.board_id as string;

    const triggerEvent: TriggerEvent = {
      type: 'card_moved',
      data: {
        from_list_id: fromListId,
        to_list_id: list_id,
        from_list_name: fromList?.name as string | undefined,
        to_list_name: toList.name as string,
      },
    };

    // Run automation in the background -- do not block the response
    evaluateRules(
      { supabase, boardId, cardId, userId },
      triggerEvent
    ).catch((err) => {
      console.error('[MoveCard] Automation evaluation failed:', err);
    });

    // Evaluate handoff rules in the background -- do not block the response
    evaluateHandoffRules(
      supabase,
      cardId,
      boardId,
      toList.name as string,
      userId
    ).catch((err) => {
      console.error('[MoveCard] Handoff rule evaluation failed:', err);
    });
  }

  return successResponse(data);
}

/**
 * Evaluate handoff rules when a card arrives at a trigger column.
 * For each matching active rule, create a new card on the target board/list.
 */
async function evaluateHandoffRules(
  supabase: SupabaseClient,
  cardId: string,
  sourceBoardId: string,
  toListName: string,
  userId: string
): Promise<void> {
  // Find matching active handoff rules where source_board_id and source_column match
  const { data: rules, error: rulesError } = await supabase
    .from('handoff_rules')
    .select('*')
    .eq('source_board_id', sourceBoardId)
    .eq('source_column', toListName)
    .eq('is_active', true);

  if (rulesError || !rules || rules.length === 0) return;

  // Fetch the original card details
  const { data: originalCard, error: cardError } = await supabase
    .from('cards')
    .select('*')
    .eq('id', cardId)
    .single();

  if (cardError || !originalCard) return;

  // Fetch labels for the original card (in case inherit_fields includes 'labels')
  const { data: cardLabels } = await supabase
    .from('card_labels')
    .select('label_id, labels(name, color)')
    .eq('card_id', cardId);

  for (const rule of rules) {
    const inheritFields: string[] = (rule.inherit_fields as string[]) || [];

    // Find the target list on the target board
    const { data: targetList } = await supabase
      .from('lists')
      .select('id, board_id, name')
      .eq('board_id', rule.target_board_id)
      .eq('name', rule.target_column)
      .single();

    if (!targetList) {
      console.error(`[Handoff] Target list "${rule.target_column}" not found on board ${rule.target_board_id}`);
      continue;
    }

    // Build the new card data based on inherit_fields
    const newCardData: Record<string, unknown> = {
      title: inheritFields.includes('title') ? originalCard.title : `[Handoff] ${originalCard.title}`,
      description: inheritFields.includes('description') ? (originalCard.description || '') : '',
      priority: inheritFields.includes('priority') ? originalCard.priority : 'medium',
      created_by: userId,
    };

    if (inheritFields.includes('client_id') && originalCard.client_id) {
      newCardData.client_id = originalCard.client_id;
    }

    // Create the new card on the target board
    const { data: newCard, error: newCardError } = await supabase
      .from('cards')
      .insert(newCardData)
      .select()
      .single();

    if (newCardError || !newCard) {
      console.error(`[Handoff] Failed to create handoff card: ${newCardError?.message}`);
      continue;
    }

    // Create card_placement on the target list (safe overflow-proof position)
    const position = await safeNextPosition(supabase, targetList.id);

    await supabase
      .from('card_placements')
      .insert({
        card_id: newCard.id,
        list_id: targetList.id,
        position,
        is_mirror: false,
      });

    // Copy labels if inherit_fields includes 'labels'
    if (inheritFields.includes('labels') && cardLabels && cardLabels.length > 0) {
      // Find matching labels on the target board by name+color
      const { data: targetBoardLabels } = await supabase
        .from('labels')
        .select('id, name, color')
        .eq('board_id', rule.target_board_id);

      if (targetBoardLabels) {
        for (const cl of cardLabels) {
          const labelInfo = cl.labels as unknown as { name: string; color: string } | null;
          if (!labelInfo) continue;

          const matchingLabel = targetBoardLabels.find(
            (tl: { name: string; color: string }) =>
              tl.name === labelInfo.name && tl.color === labelInfo.color
          );

          if (matchingLabel) {
            await supabase
              .from('card_labels')
              .insert({ card_id: newCard.id, label_id: matchingLabel.id });
          }
        }
      }
    }

    // Create a card_dependency linking the new card to the original
    await supabase
      .from('card_dependencies')
      .insert({
        source_card_id: newCard.id,
        target_card_id: cardId,
        dependency_type: 'spawned_from',
        created_by: userId,
      });

    // Create activity log entries on both cards
    await supabase.from('activity_log').insert([
      {
        card_id: cardId,
        board_id: sourceBoardId,
        user_id: userId,
        event_type: 'handoff_triggered',
        metadata: {
          rule_id: rule.id,
          rule_name: rule.name,
          target_card_id: newCard.id,
          target_board_id: rule.target_board_id,
          target_column: rule.target_column,
        },
      },
      {
        card_id: newCard.id,
        board_id: rule.target_board_id,
        user_id: userId,
        event_type: 'handoff_received',
        metadata: {
          rule_id: rule.id,
          rule_name: rule.name,
          source_card_id: cardId,
          source_board_id: sourceBoardId,
          source_column: rule.source_column,
        },
      },
    ]);

    // Notify assignees of the original card about the handoff
    await notifyCardAssignees(
      supabase,
      cardId,
      {
        type: 'handoff_created',
        title: `Handoff: "${originalCard.title}" triggered rule "${rule.name}"`,
        body: `A new card has been created on the target board in column "${rule.target_column}".`,
        cardId: newCard.id as string,
        boardId: rule.target_board_id as string,
        metadata: {
          rule_id: rule.id,
          source_card_id: cardId,
          target_card_id: newCard.id,
        },
      },
      userId
    );
  }
}
