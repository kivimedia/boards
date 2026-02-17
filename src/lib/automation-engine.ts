import { SupabaseClient } from '@supabase/supabase-js';
import type {
  AutomationRule,
  AutomationTriggerType,
  AutomationActionType,
  BoardType,
} from './types';

export interface AutomationContext {
  supabase: SupabaseClient;
  boardId: string;
  cardId: string;
  userId: string;
}

export interface TriggerEvent {
  type: AutomationTriggerType;
  data: {
    from_list_id?: string;
    to_list_id?: string;
    from_list_name?: string;
    to_list_name?: string;
    field_name?: string;
    field_value?: unknown;
    old_value?: unknown;
    [key: string]: unknown;
  };
}

/**
 * Evaluate and execute all matching automation rules for a given trigger event.
 */
export async function evaluateRules(
  ctx: AutomationContext,
  event: TriggerEvent
): Promise<void> {
  const { supabase, boardId } = ctx;

  // Fetch active rules for this board, ordered by execution_order
  const { data: rules, error } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('board_id', boardId)
    .eq('is_active', true)
    .order('execution_order', { ascending: true });

  if (error || !rules) {
    console.error('[AutomationEngine] Failed to fetch rules:', error?.message);
    return;
  }

  // Filter rules that match the trigger event
  const matchingRules = rules.filter((rule: AutomationRule) =>
    matchesTrigger(rule, event)
  );

  // Execute each matching rule in order
  for (const rule of matchingRules) {
    try {
      await executeAction(ctx, rule);
      await logExecution(ctx, rule.id, event.data, { success: true }, 'success');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(
        `[AutomationEngine] Rule "${rule.name}" (${rule.id}) failed:`,
        errorMessage
      );
      await logExecution(
        ctx,
        rule.id,
        event.data,
        { success: false },
        'error',
        errorMessage
      );
    }
  }
}

/**
 * Check if a trigger event matches a rule's trigger configuration.
 */
export function matchesTrigger(
  rule: AutomationRule,
  event: TriggerEvent
): boolean {
  if (rule.trigger_type !== event.type) {
    return false;
  }

  const config = rule.trigger_config;

  switch (event.type) {
    case 'card_moved': {
      if (config.to_list_name && config.to_list_name !== event.data.to_list_name) {
        return false;
      }
      if (config.from_list_name && config.from_list_name !== event.data.from_list_name) {
        return false;
      }
      if (config.to_list_id && config.to_list_id !== event.data.to_list_id) {
        return false;
      }
      if (config.from_list_id && config.from_list_id !== event.data.from_list_id) {
        return false;
      }
      return true;
    }

    case 'card_created': {
      // Always matches; optionally filter by list name
      if (config.list_name && config.list_name !== event.data.to_list_name) {
        return false;
      }
      return true;
    }

    case 'card_updated': {
      return true;
    }

    case 'field_changed': {
      if (config.field_name && config.field_name !== event.data.field_name) {
        return false;
      }
      if (
        config.field_value !== undefined &&
        config.field_value !== event.data.field_value
      ) {
        return false;
      }
      return true;
    }

    case 'due_date_passed': {
      return true;
    }

    case 'checklist_completed': {
      return true;
    }

    case 'label_added': {
      if (config.label_name && config.label_name !== event.data.label_name) {
        return false;
      }
      return true;
    }

    case 'label_removed': {
      if (config.label_name && config.label_name !== event.data.label_name) {
        return false;
      }
      return true;
    }

    default:
      return false;
  }
}

/**
 * Execute the action specified by an automation rule.
 */
export async function executeAction(
  ctx: AutomationContext,
  rule: AutomationRule
): Promise<void> {
  const { supabase, cardId, boardId, userId } = ctx;
  const config = rule.action_config;

  switch (rule.action_type) {
    case 'set_field': {
      const fieldName = config.field_name as string;
      const fieldValue = config.field_value;

      if (!fieldName) {
        throw new Error('set_field action requires field_name in action_config');
      }

      // Look up the field definition by name and board
      const { data: fieldDef } = await supabase
        .from('custom_field_definitions')
        .select('id')
        .eq('board_id', boardId)
        .eq('name', fieldName)
        .single();

      if (!fieldDef) {
        throw new Error(`Custom field definition "${fieldName}" not found`);
      }

      // Upsert the field value
      const { data: existing } = await supabase
        .from('custom_field_values')
        .select('id')
        .eq('card_id', cardId)
        .eq('field_definition_id', fieldDef.id)
        .single();

      if (existing) {
        await supabase
          .from('custom_field_values')
          .update({ value: fieldValue, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await supabase.from('custom_field_values').insert({
          card_id: cardId,
          field_definition_id: fieldDef.id,
          value: fieldValue,
        });
      }
      break;
    }

    case 'increment_field': {
      const fieldName = config.field_name as string;
      const incrementBy = (config.increment_by as number) ?? 1;

      if (!fieldName) {
        throw new Error(
          'increment_field action requires field_name in action_config'
        );
      }

      // Look up the field definition
      const { data: fieldDef } = await supabase
        .from('custom_field_definitions')
        .select('id')
        .eq('board_id', boardId)
        .eq('name', fieldName)
        .single();

      if (!fieldDef) {
        throw new Error(`Custom field definition "${fieldName}" not found`);
      }

      // Read current value
      const { data: existing } = await supabase
        .from('custom_field_values')
        .select('id, value')
        .eq('card_id', cardId)
        .eq('field_definition_id', fieldDef.id)
        .single();

      const currentValue =
        existing && typeof existing.value === 'number' ? existing.value : 0;
      const newValue = currentValue + incrementBy;

      if (existing) {
        await supabase
          .from('custom_field_values')
          .update({ value: newValue, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await supabase.from('custom_field_values').insert({
          card_id: cardId,
          field_definition_id: fieldDef.id,
          value: newValue,
        });
      }
      break;
    }

    case 'set_priority': {
      const priority = config.priority as string;
      if (!priority) {
        throw new Error('set_priority action requires priority in action_config');
      }

      await supabase.from('cards').update({ priority }).eq('id', cardId);
      break;
    }

    case 'add_label': {
      const labelName = config.label_name as string;
      if (!labelName) {
        throw new Error('add_label action requires label_name in action_config');
      }

      const { data: label } = await supabase
        .from('labels')
        .select('id')
        .eq('board_id', boardId)
        .eq('name', labelName)
        .single();

      if (!label) {
        throw new Error(`Label "${labelName}" not found on board`);
      }

      // Check if already attached
      const { data: existingLink } = await supabase
        .from('card_labels')
        .select('id')
        .eq('card_id', cardId)
        .eq('label_id', label.id)
        .single();

      if (!existingLink) {
        await supabase.from('card_labels').insert({
          card_id: cardId,
          label_id: label.id,
        });
      }
      break;
    }

    case 'remove_label': {
      const labelName = config.label_name as string;
      if (!labelName) {
        throw new Error(
          'remove_label action requires label_name in action_config'
        );
      }

      const { data: label } = await supabase
        .from('labels')
        .select('id')
        .eq('board_id', boardId)
        .eq('name', labelName)
        .single();

      if (label) {
        await supabase
          .from('card_labels')
          .delete()
          .eq('card_id', cardId)
          .eq('label_id', label.id);
      }
      break;
    }

    case 'create_activity_log': {
      const eventType = (config.event_type as string) || 'automation_triggered';
      const metadata = (config.metadata as Record<string, unknown>) || {};

      await supabase.from('activity_log').insert({
        card_id: cardId,
        board_id: boardId,
        user_id: userId,
        event_type: eventType,
        metadata: {
          ...metadata,
          automation_rule_id: rule.id,
          automation_rule_name: rule.name,
        },
      });
      break;
    }

    case 'move_card': {
      const toListName = config.to_list_name as string;
      if (!toListName) {
        throw new Error(
          'move_card action requires to_list_name in action_config'
        );
      }

      const { data: targetList } = await supabase
        .from('lists')
        .select('id')
        .eq('board_id', boardId)
        .eq('name', toListName)
        .single();

      if (!targetList) {
        throw new Error(`List "${toListName}" not found on board`);
      }

      await supabase
        .from('card_placements')
        .update({ list_id: targetList.id })
        .eq('card_id', cardId)
        .eq('is_mirror', false);
      break;
    }

    case 'create_card': {
      const title = config.title as string;
      const listName = config.list_name as string;

      if (!title || !listName) {
        throw new Error(
          'create_card action requires title and list_name in action_config'
        );
      }

      const { data: targetList } = await supabase
        .from('lists')
        .select('id')
        .eq('board_id', boardId)
        .eq('name', listName)
        .single();

      if (!targetList) {
        throw new Error(`List "${listName}" not found on board`);
      }

      const { data: newCard } = await supabase
        .from('cards')
        .insert({
          title,
          description: (config.description as string) || '',
          priority: (config.priority as string) || 'none',
          created_by: userId,
        })
        .select()
        .single();

      if (newCard) {
        await supabase.from('card_placements').insert({
          card_id: newCard.id,
          list_id: targetList.id,
          position: 0,
          is_mirror: false,
        });
      }
      break;
    }

    case 'assign_user': {
      const assigneeId = config.user_id as string;
      if (!assigneeId) {
        throw new Error(
          'assign_user action requires user_id in action_config'
        );
      }

      const { data: existingAssignment } = await supabase
        .from('card_assignees')
        .select('id')
        .eq('card_id', cardId)
        .eq('user_id', assigneeId)
        .single();

      if (!existingAssignment) {
        await supabase.from('card_assignees').insert({
          card_id: cardId,
          user_id: assigneeId,
        });
      }
      break;
    }

    case 'send_notification': {
      // Placeholder -- log the notification for now
      console.log(
        `[AutomationEngine] send_notification: rule="${rule.name}", card=${cardId}, config=`,
        config
      );
      break;
    }

    default:
      throw new Error(`Unknown action type: ${rule.action_type}`);
  }
}

/**
 * Log an automation execution to the automation_log table.
 */
export async function logExecution(
  ctx: AutomationContext,
  ruleId: string,
  triggerData: Record<string, unknown>,
  result: Record<string, unknown>,
  status: string,
  errorMessage?: string
): Promise<void> {
  const { supabase, boardId, cardId } = ctx;

  try {
    await supabase.from('automation_log').insert({
      rule_id: ruleId,
      board_id: boardId,
      card_id: cardId,
      trigger_data: triggerData,
      action_result: result,
      status,
      error_message: errorMessage || null,
    });
  } catch (err) {
    console.error('[AutomationEngine] Failed to log execution:', err);
  }
}

/**
 * Returns sensible default automation rules for a given board type.
 * These are templates to be inserted when a board is created.
 */
export function getDefaultAutomationRules(
  boardType: BoardType
): {
  name: string;
  trigger_type: AutomationTriggerType;
  trigger_config: Record<string, unknown>;
  action_type: AutomationActionType;
  action_config: Record<string, unknown>;
}[] {
  switch (boardType) {
    case 'graphic_designer':
      return [
        {
          name: 'Increment revision count on Revisions',
          trigger_type: 'card_moved',
          trigger_config: { to_list_name: 'Revisions' },
          action_type: 'increment_field',
          action_config: { field_name: 'Revision Count', increment_by: 1 },
        },
        {
          name: 'Increment revision count on Client Revisions',
          trigger_type: 'card_moved',
          trigger_config: { to_list_name: 'Client Revisions' },
          action_type: 'increment_field',
          action_config: { field_name: 'Revision Count', increment_by: 1 },
        },
        {
          name: 'Log activity when approved',
          trigger_type: 'card_moved',
          trigger_config: { to_list_name: 'Approved' },
          action_type: 'create_activity_log',
          action_config: {
            event_type: 'card_approved',
            metadata: { message: 'Design approved by client' },
          },
        },
      ];

    case 'dev':
      return [
        {
          name: 'Increment revision count on Revisions',
          trigger_type: 'card_moved',
          trigger_config: { to_list_name: 'Revisions' },
          action_type: 'increment_field',
          action_config: { field_name: 'Revision Count', increment_by: 1 },
        },
        {
          name: 'Log activity when deployed',
          trigger_type: 'card_moved',
          trigger_config: { to_list_name: 'Deployed' },
          action_type: 'create_activity_log',
          action_config: {
            event_type: 'card_deployed',
            metadata: { message: 'Card deployed to production' },
          },
        },
      ];

    case 'video_editor':
      return [
        {
          name: 'Increment revision count on Revisions',
          trigger_type: 'card_moved',
          trigger_config: { to_list_name: 'Revisions' },
          action_type: 'increment_field',
          action_config: { field_name: 'Revision Count', increment_by: 1 },
        },
        {
          name: 'Log activity when approved',
          trigger_type: 'card_moved',
          trigger_config: { to_list_name: 'Approved' },
          action_type: 'create_activity_log',
          action_config: {
            event_type: 'card_approved',
            metadata: { message: 'Video approved by client' },
          },
        },
      ];

    case 'copy':
      return [
        {
          name: 'Log activity when approved',
          trigger_type: 'card_moved',
          trigger_config: { to_list_name: 'Approved' },
          action_type: 'create_activity_log',
          action_config: {
            event_type: 'card_approved',
            metadata: { message: 'Copy approved' },
          },
        },
        {
          name: 'Log activity when published',
          trigger_type: 'card_moved',
          trigger_config: { to_list_name: 'Published' },
          action_type: 'create_activity_log',
          action_config: {
            event_type: 'card_published',
            metadata: { message: 'Copy published' },
          },
        },
      ];

    case 'account_manager':
      return [
        {
          name: 'Log activity when client marked at risk',
          trigger_type: 'card_moved',
          trigger_config: { to_list_name: 'At Risk' },
          action_type: 'create_activity_log',
          action_config: {
            event_type: 'client_at_risk',
            metadata: { message: 'Client moved to At Risk status' },
          },
        },
      ];

    case 'executive_assistant':
      return [
        {
          name: 'Log activity when task completed',
          trigger_type: 'card_moved',
          trigger_config: { to_list_name: 'Done' },
          action_type: 'create_activity_log',
          action_config: {
            event_type: 'task_completed',
            metadata: { message: 'Task marked as done' },
          },
        },
      ];

    case 'training':
      return [
        {
          name: 'Log activity when training published',
          trigger_type: 'card_moved',
          trigger_config: { to_list_name: 'Published' },
          action_type: 'create_activity_log',
          action_config: {
            event_type: 'training_published',
            metadata: { message: 'Training material published' },
          },
        },
      ];

    case 'client_strategy_map':
      return [
        {
          name: 'Log activity when entering Execution',
          trigger_type: 'card_moved',
          trigger_config: { to_list_name: 'Execution' },
          action_type: 'create_activity_log',
          action_config: {
            event_type: 'strategy_executing',
            metadata: { message: 'Strategy moved to Execution phase' },
          },
        },
      ];

    default:
      return [];
  }
}
