import { SupabaseClient } from '@supabase/supabase-js';
import type { AutomationRule, AutomationExecutionLog, RecurringCard } from './types';

// ============================================================================
// AUTOMATION RULE CRUD (ENHANCED)
// ============================================================================

export async function getAutomationRules(
  supabase: SupabaseClient,
  boardId: string
): Promise<AutomationRule[]> {
  const { data } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('board_id', boardId)
    .order('execution_order', { ascending: true });

  return (data as AutomationRule[]) ?? [];
}

export async function createAutomationRule(
  supabase: SupabaseClient,
  rule: {
    boardId: string;
    name: string;
    description?: string;
    triggerType: string;
    triggerConfig: Record<string, unknown>;
    actionType: string;
    actionConfig: Record<string, unknown>;
    conditions?: Record<string, unknown>[];
    createdBy: string;
  }
): Promise<AutomationRule | null> {
  // Get next execution order
  const { data: existing } = await supabase
    .from('automation_rules')
    .select('execution_order')
    .eq('board_id', rule.boardId)
    .order('execution_order', { ascending: false })
    .limit(1);

  const nextOrder = existing && existing.length > 0 ? existing[0].execution_order + 1 : 1;

  const { data, error } = await supabase
    .from('automation_rules')
    .insert({
      board_id: rule.boardId,
      name: rule.name,
      description: rule.description ?? null,
      trigger_type: rule.triggerType,
      trigger_config: rule.triggerConfig,
      action_type: rule.actionType,
      action_config: rule.actionConfig,
      conditions: rule.conditions ?? [],
      execution_order: nextOrder,
      is_active: true,
      created_by: rule.createdBy,
    })
    .select()
    .single();

  if (error) return null;
  return data as AutomationRule;
}

export async function updateAutomationRule(
  supabase: SupabaseClient,
  ruleId: string,
  updates: Partial<Pick<AutomationRule, 'name' | 'is_active' | 'trigger_type' | 'trigger_config' | 'action_type' | 'action_config' | 'execution_order'>> & { description?: string; conditions?: Record<string, unknown>[] }
): Promise<AutomationRule | null> {
  const { data, error } = await supabase
    .from('automation_rules')
    .update(updates)
    .eq('id', ruleId)
    .select()
    .single();

  if (error) return null;
  return data as AutomationRule;
}

export async function deleteAutomationRule(
  supabase: SupabaseClient,
  ruleId: string
): Promise<void> {
  await supabase.from('automation_rules').delete().eq('id', ruleId);
}

export async function reorderAutomationRules(
  supabase: SupabaseClient,
  boardId: string,
  ruleOrder: string[]
): Promise<void> {
  for (let i = 0; i < ruleOrder.length; i++) {
    await supabase
      .from('automation_rules')
      .update({ execution_order: i + 1 })
      .eq('id', ruleOrder[i])
      .eq('board_id', boardId);
  }
}

// ============================================================================
// EXECUTION LOG
// ============================================================================

export async function logExecution(
  supabase: SupabaseClient,
  log: {
    ruleId: string;
    boardId?: string;
    cardId?: string;
    triggerData: Record<string, unknown>;
    actionData: Record<string, unknown>;
    status: 'success' | 'failed' | 'skipped';
    errorMessage?: string;
    executionTimeMs?: number;
  }
): Promise<void> {
  await supabase.from('automation_execution_log').insert({
    rule_id: log.ruleId,
    board_id: log.boardId ?? null,
    card_id: log.cardId ?? null,
    trigger_data: log.triggerData,
    action_data: log.actionData,
    status: log.status,
    error_message: log.errorMessage ?? null,
    execution_time_ms: log.executionTimeMs ?? null,
  });

  // Update rule trigger count and last triggered
  if (log.status === 'success') {
    // Update rule stats
    await supabase
      .from('automation_rules')
      .update({ last_triggered_at: new Date().toISOString() })
      .eq('id', log.ruleId);
  }
}

export async function getExecutionLogs(
  supabase: SupabaseClient,
  filters: { ruleId?: string; boardId?: string; status?: string; limit?: number }
): Promise<AutomationExecutionLog[]> {
  let query = supabase
    .from('automation_execution_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 50);

  if (filters.ruleId) query = query.eq('rule_id', filters.ruleId);
  if (filters.boardId) query = query.eq('board_id', filters.boardId);
  if (filters.status) query = query.eq('status', filters.status);

  const { data } = await query;
  return (data as AutomationExecutionLog[]) ?? [];
}

// ============================================================================
// RECURRING CARDS
// ============================================================================

export async function createRecurringCard(
  supabase: SupabaseClient,
  config: {
    boardId: string;
    listId: string;
    title: string;
    description?: string;
    recurrencePattern: string;
    recurrenceDay?: number;
    recurrenceTime?: string;
    labels?: string[];
    assigneeIds?: string[];
    priority?: string;
    customFields?: Record<string, unknown>;
    createdBy: string;
  }
): Promise<RecurringCard | null> {
  const nextCreateAt = calculateNextCreateAt(
    config.recurrencePattern,
    config.recurrenceDay,
    config.recurrenceTime
  );

  const { data, error } = await supabase
    .from('recurring_cards')
    .insert({
      board_id: config.boardId,
      list_id: config.listId,
      title: config.title,
      description: config.description ?? null,
      recurrence_pattern: config.recurrencePattern,
      recurrence_day: config.recurrenceDay ?? null,
      recurrence_time: config.recurrenceTime ?? '09:00',
      labels: config.labels ?? [],
      assignee_ids: config.assigneeIds ?? [],
      priority: config.priority ?? null,
      custom_fields: config.customFields ?? {},
      is_active: true,
      next_create_at: nextCreateAt,
      created_by: config.createdBy,
    })
    .select()
    .single();

  if (error) return null;
  return data as RecurringCard;
}

export async function getRecurringCards(
  supabase: SupabaseClient,
  boardId: string
): Promise<RecurringCard[]> {
  const { data } = await supabase
    .from('recurring_cards')
    .select('*')
    .eq('board_id', boardId)
    .order('created_at', { ascending: false });

  return (data as RecurringCard[]) ?? [];
}

export async function updateRecurringCard(
  supabase: SupabaseClient,
  recurringId: string,
  updates: Partial<Pick<RecurringCard, 'title' | 'description' | 'recurrence_pattern' | 'recurrence_day' | 'is_active' | 'labels' | 'assignee_ids' | 'priority'>>
): Promise<RecurringCard | null> {
  const dbUpdates: Record<string, unknown> = { ...updates };

  // Recalculate next_create_at if recurrence changed
  if (updates.recurrence_pattern || updates.recurrence_day !== undefined) {
    const { data: existing } = await supabase
      .from('recurring_cards')
      .select('recurrence_pattern, recurrence_day, recurrence_time')
      .eq('id', recurringId)
      .single();

    if (existing) {
      dbUpdates.next_create_at = calculateNextCreateAt(
        (updates.recurrence_pattern ?? existing.recurrence_pattern) as string,
        updates.recurrence_day ?? existing.recurrence_day,
        existing.recurrence_time
      );
    }
  }

  const { data, error } = await supabase
    .from('recurring_cards')
    .update(dbUpdates)
    .eq('id', recurringId)
    .select()
    .single();

  if (error) return null;
  return data as RecurringCard;
}

export async function deleteRecurringCard(
  supabase: SupabaseClient,
  recurringId: string
): Promise<void> {
  await supabase.from('recurring_cards').delete().eq('id', recurringId);
}

// ============================================================================
// NEXT CREATE CALCULATION
// ============================================================================

export function calculateNextCreateAt(
  pattern: string,
  day?: number | null,
  time?: string | null
): string {
  const now = new Date();
  const [hours, minutes] = (time ?? '09:00').split(':').map(Number);
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);

  switch (pattern) {
    case 'daily':
      if (next <= now) next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + ((7 + (day ?? 1) - next.getDay()) % 7 || 7));
      break;
    case 'biweekly':
      next.setDate(next.getDate() + ((7 + (day ?? 1) - next.getDay()) % 7 || 7));
      if (next.getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000) {
        next.setDate(next.getDate() + 7);
      }
      break;
    case 'monthly':
      next.setDate(day ?? 1);
      if (next <= now) next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setDate(day ?? 1);
      if (next <= now) next.setMonth(next.getMonth() + 3);
      break;
    default:
      next.setDate(next.getDate() + 1);
  }

  return next.toISOString();
}

// ============================================================================
// TRIGGER/ACTION OPTIONS (for the visual builder UI)
// ============================================================================

export const TRIGGER_OPTIONS = [
  { value: 'card_moved', label: 'Card moved to column', config: ['from_list', 'to_list'] },
  { value: 'card_created', label: 'Card created', config: ['list_id'] },
  { value: 'card_updated', label: 'Card updated', config: ['field'] },
  { value: 'due_date_passed', label: 'Due date passed', config: ['offset_hours'] },
  { value: 'checklist_completed', label: 'All checklists completed', config: [] },
  { value: 'field_changed', label: 'Custom field changed', config: ['field_id', 'value'] },
  { value: 'label_added', label: 'Label added', config: ['label_id'] },
  { value: 'label_removed', label: 'Label removed', config: ['label_id'] },
] as const;

export const ACTION_OPTIONS = [
  { value: 'move_card', label: 'Move card to column', config: ['target_list'] },
  { value: 'set_field', label: 'Set field value', config: ['field', 'value'] },
  { value: 'increment_field', label: 'Increment field', config: ['field', 'amount'] },
  { value: 'add_label', label: 'Add label', config: ['label_id'] },
  { value: 'remove_label', label: 'Remove label', config: ['label_id'] },
  { value: 'create_card', label: 'Create new card', config: ['board_id', 'list_id', 'title'] },
  { value: 'send_notification', label: 'Send notification', config: ['user_id', 'message'] },
  { value: 'assign_user', label: 'Assign user', config: ['user_id'] },
  { value: 'set_priority', label: 'Set priority', config: ['priority'] },
  { value: 'create_activity_log', label: 'Log activity', config: ['message'] },
] as const;
