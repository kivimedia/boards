import { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';

// ============================================================================
// CHAT TOOL DEFINITIONS (Anthropic tool_use format)
// ============================================================================

export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'move_card',
    description:
      'Move a card to a different list on its board. Use when the user says "move this to X" or "change the status to X".',
    input_schema: {
      type: 'object' as const,
      properties: {
        card_id: { type: 'string', description: 'The UUID of the card to move' },
        target_list_name: {
          type: 'string',
          description: 'The name of the target list to move the card to',
        },
      },
      required: ['card_id', 'target_list_name'],
    },
  },
  {
    name: 'add_label',
    description:
      'Add a label to a card. Use when the user says "label this as X" or "add the X label".',
    input_schema: {
      type: 'object' as const,
      properties: {
        card_id: { type: 'string', description: 'The UUID of the card' },
        label_name: { type: 'string', description: 'The name of the label to add' },
      },
      required: ['card_id', 'label_name'],
    },
  },
  {
    name: 'post_comment',
    description:
      'Post a comment on a card. Use when the user asks to add a note, comment, or update to the ticket.',
    input_schema: {
      type: 'object' as const,
      properties: {
        card_id: { type: 'string', description: 'The UUID of the card' },
        content: { type: 'string', description: 'The comment text to post' },
      },
      required: ['card_id', 'content'],
    },
  },
  {
    name: 'assign_user',
    description:
      'Assign a user to a card. Use when the user says "assign X to this" or "add X as assignee".',
    input_schema: {
      type: 'object' as const,
      properties: {
        card_id: { type: 'string', description: 'The UUID of the card' },
        user_name: {
          type: 'string',
          description: 'The display name of the user to assign',
        },
      },
      required: ['card_id', 'user_name'],
    },
  },
  {
    name: 'update_priority',
    description:
      'Update the priority of a card. Use when the user says "set priority to X" or "make this urgent".',
    input_schema: {
      type: 'object' as const,
      properties: {
        card_id: { type: 'string', description: 'The UUID of the card' },
        priority: {
          type: 'string',
          enum: ['urgent', 'high', 'medium', 'low', 'none'],
          description: 'The new priority level',
        },
      },
      required: ['card_id', 'priority'],
    },
  },
  {
    name: 'create_checklist',
    description:
      'Create a new checklist on a card with optional items. Use when the user wants to add a checklist or task list.',
    input_schema: {
      type: 'object' as const,
      properties: {
        card_id: { type: 'string', description: 'The UUID of the card' },
        title: { type: 'string', description: 'The checklist title' },
        items: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of checklist item texts',
        },
      },
      required: ['card_id', 'title'],
    },
  },
];

// Tools that modify data and should require user confirmation
const CONFIRMATION_TOOLS = new Set([
  'move_card',
  'add_label',
  'assign_user',
  'update_priority',
]);

// ============================================================================
// TOOL EXECUTION RESULT
// ============================================================================

export interface ToolExecutionResult {
  success: boolean;
  message: string;
  requiresConfirmation: boolean;
  confirmationMessage?: string;
  data?: Record<string, unknown>;
}

// ============================================================================
// TOOL INPUT TYPES
// ============================================================================

interface MoveCardInput {
  card_id: string;
  target_list_name: string;
}

interface AddLabelInput {
  card_id: string;
  label_name: string;
}

interface PostCommentInput {
  card_id: string;
  content: string;
}

interface AssignUserInput {
  card_id: string;
  user_name: string;
}

interface UpdatePriorityInput {
  card_id: string;
  priority: string;
}

interface CreateChecklistInput {
  card_id: string;
  title: string;
  items?: string[];
}

// ============================================================================
// CHECK IF CONFIRMATION REQUIRED
// ============================================================================

export function needsConfirmation(toolName: string): boolean {
  return CONFIRMATION_TOOLS.has(toolName);
}

/**
 * Build a human-readable confirmation message for a tool execution.
 */
export function buildConfirmationMessage(
  toolName: string,
  toolInput: Record<string, unknown>
): string {
  switch (toolName) {
    case 'move_card':
      return `Move this card to "${(toolInput as unknown as MoveCardInput).target_list_name}"?`;
    case 'add_label':
      return `Add label "${(toolInput as unknown as AddLabelInput).label_name}" to this card?`;
    case 'assign_user':
      return `Assign "${(toolInput as unknown as AssignUserInput).user_name}" to this card?`;
    case 'update_priority':
      return `Change priority to "${(toolInput as unknown as UpdatePriorityInput).priority}"?`;
    default:
      return `Execute ${toolName}?`;
  }
}

// ============================================================================
// TOOL EXECUTOR
// ============================================================================

/**
 * Execute a chat tool with the user's Supabase client (RLS-protected).
 */
export async function executeTool(
  supabase: SupabaseClient,
  userId: string,
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<ToolExecutionResult> {
  try {
    switch (toolName) {
      case 'move_card':
        return await executeMoveCard(supabase, toolInput as unknown as MoveCardInput);
      case 'add_label':
        return await executeAddLabel(supabase, toolInput as unknown as AddLabelInput);
      case 'post_comment':
        return await executePostComment(supabase, userId, toolInput as unknown as PostCommentInput);
      case 'assign_user':
        return await executeAssignUser(supabase, toolInput as unknown as AssignUserInput);
      case 'update_priority':
        return await executeUpdatePriority(supabase, toolInput as unknown as UpdatePriorityInput);
      case 'create_checklist':
        return await executeCreateChecklist(supabase, toolInput as unknown as CreateChecklistInput);
      default:
        return {
          success: false,
          message: `Unknown tool: ${toolName}`,
          requiresConfirmation: false,
        };
    }
  } catch (err) {
    return {
      success: false,
      message: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
      requiresConfirmation: false,
    };
  }
}

// ============================================================================
// INDIVIDUAL TOOL EXECUTORS
// ============================================================================

async function executeMoveCard(
  supabase: SupabaseClient,
  input: MoveCardInput
): Promise<ToolExecutionResult> {
  // Find the card's current board via its placement
  const { data: placement } = await supabase
    .from('card_placements')
    .select('list_id, lists(board_id)')
    .eq('card_id', input.card_id)
    .limit(1)
    .single();

  if (!placement) {
    return { success: false, message: 'Card placement not found', requiresConfirmation: false };
  }

  const boardId = (placement.lists as unknown as { board_id: string }).board_id;

  // Find the target list by name on the same board
  const { data: targetList } = await supabase
    .from('lists')
    .select('id, name')
    .eq('board_id', boardId)
    .ilike('name', input.target_list_name)
    .limit(1)
    .single();

  if (!targetList) {
    // Try fuzzy match
    const { data: allLists } = await supabase
      .from('lists')
      .select('id, name')
      .eq('board_id', boardId)
      .order('position');

    const listNames = (allLists || []).map((l: { name: string }) => l.name);
    return {
      success: false,
      message: `List "${input.target_list_name}" not found on this board. Available lists: ${listNames.join(', ')}`,
      requiresConfirmation: false,
    };
  }

  // Update the placement
  const { error } = await supabase
    .from('card_placements')
    .update({ list_id: targetList.id })
    .eq('card_id', input.card_id)
    .eq('list_id', placement.list_id);

  if (error) {
    return { success: false, message: `Failed to move card: ${error.message}`, requiresConfirmation: false };
  }

  return {
    success: true,
    message: `Card moved to "${targetList.name}"`,
    requiresConfirmation: false,
    data: { new_list: targetList.name, new_list_id: targetList.id },
  };
}

async function executeAddLabel(
  supabase: SupabaseClient,
  input: AddLabelInput
): Promise<ToolExecutionResult> {
  // Find the card's board
  const { data: placement } = await supabase
    .from('card_placements')
    .select('lists(board_id)')
    .eq('card_id', input.card_id)
    .limit(1)
    .single();

  if (!placement) {
    return { success: false, message: 'Card placement not found', requiresConfirmation: false };
  }

  const boardId = (placement.lists as unknown as { board_id: string }).board_id;

  // Find the label by name on the board
  const { data: label } = await supabase
    .from('labels')
    .select('id, name')
    .eq('board_id', boardId)
    .ilike('name', input.label_name)
    .limit(1)
    .single();

  if (!label) {
    const { data: allLabels } = await supabase
      .from('labels')
      .select('name')
      .eq('board_id', boardId);
    const labelNames = (allLabels || []).map((l: { name: string }) => l.name);
    return {
      success: false,
      message: `Label "${input.label_name}" not found. Available labels: ${labelNames.join(', ')}`,
      requiresConfirmation: false,
    };
  }

  // Check if already applied
  const { data: existing } = await supabase
    .from('card_labels')
    .select('card_id')
    .eq('card_id', input.card_id)
    .eq('label_id', label.id)
    .limit(1)
    .single();

  if (existing) {
    return {
      success: true,
      message: `Label "${label.name}" is already on this card`,
      requiresConfirmation: false,
    };
  }

  const { error } = await supabase
    .from('card_labels')
    .insert({ card_id: input.card_id, label_id: label.id });

  if (error) {
    return { success: false, message: `Failed to add label: ${error.message}`, requiresConfirmation: false };
  }

  return {
    success: true,
    message: `Label "${label.name}" added to card`,
    requiresConfirmation: false,
    data: { label_name: label.name, label_id: label.id },
  };
}

async function executePostComment(
  supabase: SupabaseClient,
  userId: string,
  input: PostCommentInput
): Promise<ToolExecutionResult> {
  const { error } = await supabase
    .from('comments')
    .insert({
      id: crypto.randomUUID(),
      card_id: input.card_id,
      user_id: userId,
      content: input.content,
      is_external: false,
    });

  if (error) {
    return { success: false, message: `Failed to post comment: ${error.message}`, requiresConfirmation: false };
  }

  return {
    success: true,
    message: 'Comment posted successfully',
    requiresConfirmation: false,
  };
}

async function executeAssignUser(
  supabase: SupabaseClient,
  input: AssignUserInput
): Promise<ToolExecutionResult> {
  // Find user by display name
  const { data: user } = await supabase
    .from('profiles')
    .select('id, display_name')
    .ilike('display_name', input.user_name)
    .limit(1)
    .single();

  if (!user) {
    const { data: allUsers } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('account_status', 'active')
      .limit(50);
    const names = (allUsers || []).map((u: { display_name: string }) => u.display_name);
    return {
      success: false,
      message: `User "${input.user_name}" not found. Available users: ${names.join(', ')}`,
      requiresConfirmation: false,
    };
  }

  // Check if already assigned
  const { data: existing } = await supabase
    .from('card_assignees')
    .select('card_id')
    .eq('card_id', input.card_id)
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (existing) {
    return {
      success: true,
      message: `${user.display_name} is already assigned to this card`,
      requiresConfirmation: false,
    };
  }

  const { error } = await supabase
    .from('card_assignees')
    .insert({ card_id: input.card_id, user_id: user.id });

  if (error) {
    return { success: false, message: `Failed to assign user: ${error.message}`, requiresConfirmation: false };
  }

  return {
    success: true,
    message: `${user.display_name} assigned to card`,
    requiresConfirmation: false,
    data: { user_name: user.display_name, user_id: user.id },
  };
}

async function executeUpdatePriority(
  supabase: SupabaseClient,
  input: UpdatePriorityInput
): Promise<ToolExecutionResult> {
  const validPriorities = ['urgent', 'high', 'medium', 'low', 'none'];
  if (!validPriorities.includes(input.priority)) {
    return {
      success: false,
      message: `Invalid priority "${input.priority}". Valid options: ${validPriorities.join(', ')}`,
      requiresConfirmation: false,
    };
  }

  const { error } = await supabase
    .from('cards')
    .update({ priority: input.priority })
    .eq('id', input.card_id);

  if (error) {
    return { success: false, message: `Failed to update priority: ${error.message}`, requiresConfirmation: false };
  }

  return {
    success: true,
    message: `Priority updated to "${input.priority}"`,
    requiresConfirmation: false,
    data: { priority: input.priority },
  };
}

async function executeCreateChecklist(
  supabase: SupabaseClient,
  input: CreateChecklistInput
): Promise<ToolExecutionResult> {
  // Get the max position for existing checklists
  const { data: existing } = await supabase
    .from('checklists')
    .select('position')
    .eq('card_id', input.card_id)
    .order('position', { ascending: false })
    .limit(1);

  const nextPosition = existing && existing.length > 0 ? (existing[0] as { position: number }).position + 1 : 0;

  const checklistId = crypto.randomUUID();
  const { error: clError } = await supabase
    .from('checklists')
    .insert({
      id: checklistId,
      card_id: input.card_id,
      title: input.title,
      position: nextPosition,
    });

  if (clError) {
    return { success: false, message: `Failed to create checklist: ${clError.message}`, requiresConfirmation: false };
  }

  // Insert items if provided
  if (input.items && input.items.length > 0) {
    const items = input.items.map((content, idx) => ({
      id: crypto.randomUUID(),
      checklist_id: checklistId,
      content,
      is_completed: false,
      position: idx,
    }));

    const { error: itemsError } = await supabase
      .from('checklist_items')
      .insert(items);

    if (itemsError) {
      return {
        success: true,
        message: `Checklist "${input.title}" created but failed to add items: ${itemsError.message}`,
        requiresConfirmation: false,
      };
    }
  }

  const itemCount = input.items?.length ?? 0;
  return {
    success: true,
    message: `Checklist "${input.title}" created with ${itemCount} item${itemCount !== 1 ? 's' : ''}`,
    requiresConfirmation: false,
    data: { checklist_id: checklistId, item_count: itemCount },
  };
}

// ============================================================================
// TOOL RESULT FORMATTING
// ============================================================================

/**
 * Format a tool execution result for display in chat.
 */
export function formatToolResult(result: ToolExecutionResult): string {
  if (result.success) {
    return `✅ ${result.message}`;
  }
  return `❌ ${result.message}`;
}
