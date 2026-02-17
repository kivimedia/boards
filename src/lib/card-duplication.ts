import { SupabaseClient } from '@supabase/supabase-js';
import type { Card } from './types';

// ============================================================================
// CARD DUPLICATION
// ============================================================================

/**
 * Create a full duplicate of a card, including placement, labels, assignees,
 * checklists (with items), and custom field values.
 * Returns the new card or null on failure.
 */
export async function duplicateCard(
  supabase: SupabaseClient,
  cardId: string,
  userId: string
): Promise<Card | null> {
  // 1. Fetch original card
  const { data: original, error: cardError } = await supabase
    .from('cards')
    .select('*')
    .eq('id', cardId)
    .single();

  if (cardError || !original) {
    console.error('[CardDuplication] Failed to fetch original card:', cardError?.message);
    return null;
  }

  // 2. Insert new card with "(copy)" suffix
  const { data: newCard, error: insertError } = await supabase
    .from('cards')
    .insert({
      title: `${original.title} (copy)`,
      description: original.description,
      due_date: original.due_date,
      priority: original.priority,
      client_id: original.client_id,
      is_client_visible: original.is_client_visible,
      created_by: userId,
    })
    .select()
    .single();

  if (insertError || !newCard) {
    console.error('[CardDuplication] Failed to create duplicate card:', insertError?.message);
    return null;
  }

  const newCardId = newCard.id;

  // 3. Copy primary placement (is_mirror = false) at position + 1
  const { data: placement } = await supabase
    .from('card_placements')
    .select('*')
    .eq('card_id', cardId)
    .eq('is_mirror', false)
    .single();

  if (placement) {
    const { error: placementError } = await supabase
      .from('card_placements')
      .insert({
        card_id: newCardId,
        list_id: placement.list_id,
        position: placement.position + 1,
        is_mirror: false,
      });

    if (placementError) {
      console.error('[CardDuplication] Failed to copy placement:', placementError.message);
    }
  }

  // 4. Copy card labels
  const { data: labels } = await supabase
    .from('card_labels')
    .select('label_id')
    .eq('card_id', cardId);

  if (labels && labels.length > 0) {
    const labelRows = labels.map((l: { label_id: string }) => ({
      card_id: newCardId,
      label_id: l.label_id,
    }));

    const { error: labelsError } = await supabase
      .from('card_labels')
      .insert(labelRows);

    if (labelsError) {
      console.error('[CardDuplication] Failed to copy labels:', labelsError.message);
    }
  }

  // 5. Copy card assignees
  const { data: assignees } = await supabase
    .from('card_assignees')
    .select('user_id')
    .eq('card_id', cardId);

  if (assignees && assignees.length > 0) {
    const assigneeRows = assignees.map((a: { user_id: string }) => ({
      card_id: newCardId,
      user_id: a.user_id,
    }));

    const { error: assigneesError } = await supabase
      .from('card_assignees')
      .insert(assigneeRows);

    if (assigneesError) {
      console.error('[CardDuplication] Failed to copy assignees:', assigneesError.message);
    }
  }

  // 6. Copy checklists and their items
  const { data: checklists } = await supabase
    .from('checklists')
    .select('*')
    .eq('card_id', cardId);

  if (checklists && checklists.length > 0) {
    for (const checklist of checklists) {
      const { data: newChecklist, error: clError } = await supabase
        .from('checklists')
        .insert({
          card_id: newCardId,
          title: checklist.title,
          position: checklist.position,
        })
        .select()
        .single();

      if (clError || !newChecklist) {
        console.error('[CardDuplication] Failed to copy checklist:', clError?.message);
        continue;
      }

      const { data: items } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('checklist_id', checklist.id);

      if (items && items.length > 0) {
        const itemRows = items.map((item: { content: string; position: number }) => ({
          checklist_id: newChecklist.id,
          content: item.content,
          is_completed: false,
          position: item.position,
        }));

        const { error: itemsError } = await supabase
          .from('checklist_items')
          .insert(itemRows);

        if (itemsError) {
          console.error('[CardDuplication] Failed to copy checklist items:', itemsError.message);
        }
      }
    }
  }

  // 7. Copy custom field values
  const { data: fieldValues } = await supabase
    .from('custom_field_values')
    .select('*')
    .eq('card_id', cardId);

  if (fieldValues && fieldValues.length > 0) {
    const fieldRows = fieldValues.map(
      (fv: { field_definition_id: string; value: unknown }) => ({
        card_id: newCardId,
        field_definition_id: fv.field_definition_id,
        value: fv.value,
      })
    );

    const { error: fieldsError } = await supabase
      .from('custom_field_values')
      .insert(fieldRows);

    if (fieldsError) {
      console.error('[CardDuplication] Failed to copy custom field values:', fieldsError.message);
    }
  }

  return newCard as Card;
}
