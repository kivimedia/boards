import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse, successResponse } from '@/lib/api-helpers';
import { gatherBoardContext, boardContextToText } from '@/lib/board-context';
import { createAnthropicClient } from '@/lib/ai/providers';
import type { CommandActionPlan, CommandAction, CommandActionType } from '@/lib/types';

export const maxDuration = 30;

const VALID_ACTION_TYPES: CommandActionType[] = ['move', 'assign', 'add_label', 'set_priority', 'archive', 'unarchive'];
const MAX_CARDS_PER_ACTION = 50;

/**
 * POST /api/board-command
 * Parses a natural language command into a structured action plan using Claude.
 * Body: { command: string, board_id: string }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: { command: string; board_id: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { command, board_id } = body;
  if (!command || !board_id) {
    return errorResponse('command and board_id are required');
  }

  if (command.length > 500) {
    return errorResponse('Command too long (max 500 characters)');
  }

  // Check board membership
  const { data: membership } = await supabase
    .from('board_members')
    .select('role')
    .eq('board_id', board_id)
    .eq('user_id', userId)
    .single();

  if (!membership) {
    return errorResponse('You do not have access to this board', 403);
  }

  // Need at least member role to execute commands
  const editRoles = ['admin', 'department_lead', 'member'];
  if (!editRoles.includes(membership.role)) {
    return errorResponse('You need at least member role to use board commands', 403);
  }

  try {
    const boardCtx = await gatherBoardContext(supabase, board_id);
    if (!boardCtx) {
      return errorResponse('Board not found', 404);
    }

    const context = boardContextToText(boardCtx);

    // Build structured data for Claude to reference IDs
    const listsJson = JSON.stringify(boardCtx.lists.map(l => ({ id: l.id, name: l.title })));
    const membersJson = JSON.stringify(boardCtx.members.map(m => ({ id: m.id, name: m.name })));
    const labelsJson = JSON.stringify(boardCtx.labels.map(l => ({ id: l.id, name: l.name, color: l.color })));
    const cardsJson = JSON.stringify(boardCtx.cards.map(c => ({
      id: c.id,
      title: c.title,
      list_id: c.list_id,
      list_name: c.list_name,
      priority: c.priority,
      due_date: c.due_date,
      assignees: c.assignee_names,
    })));

    const client = await createAnthropicClient(supabase);
    if (!client) {
      return errorResponse('AI not configured. Add your Anthropic API key in Settings > AI.', 500);
    }

    const systemPrompt = `You are a board command parser. Parse natural language commands into structured action plans for a project management board.

Available action types:
- "move": Move cards to a different list. Requires config.target_list_id
- "assign": Assign a user to cards. Requires config.assignee_id
- "add_label": Add a label to cards. Requires config.label_id
- "set_priority": Set priority on cards. Requires config.priority (one of: urgent, high, medium, low, none)
- "archive": Archive cards (remove from board)
- "unarchive": Unarchive cards (not commonly used)

Board structure:
Lists: ${listsJson}
Members: ${membersJson}
Labels: ${labelsJson}

Cards (with IDs for reference):
${cardsJson}

Today's date: ${new Date().toISOString().split('T')[0]}

RULES:
1. Parse the command into 1-10 concrete actions
2. Each action must reference REAL card IDs from the data above
3. Resolve references like "overdue cards" to specific card IDs (due_date < today and due_date is not null)
4. Resolve "unassigned cards" to cards with empty assignees array
5. Resolve list names fuzzy-match to actual list IDs
6. Resolve member names fuzzy-match to actual member IDs
7. Max ${MAX_CARDS_PER_ACTION} cards per action
8. If the command mentions "delete" or "remove cards", include a warning
9. If the command is unclear or cannot be matched to board data, return an error message

Respond with ONLY valid JSON:
{
  "actions": [
    {
      "type": "move|assign|add_label|set_priority|archive|unarchive",
      "card_ids": ["uuid1", "uuid2"],
      "description": "Human-readable description of this action",
      "config": { ... }
    }
  ],
  "summary": "Brief summary of the entire plan",
  "warning": "Optional warning for destructive operations"
}

If the command cannot be parsed or no matching cards exist, respond with:
{
  "actions": [],
  "summary": "Could not parse command: <reason>"
}`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Command: ${command}`,
        },
        {
          role: 'assistant',
          content: '{',
        },
      ],
    });

    const rawText = '{' + ((response.content[0] as any).text || '');

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return errorResponse('Failed to parse AI response');
    }

    // Validate the action plan
    const plan = validateActionPlan(parsed, boardCtx);

    return successResponse({ plan });
  } catch (err: any) {
    console.error('[board-command] Error:', err);
    return errorResponse(err.message || 'Command parsing failed', 500);
  }
}

/**
 * Validates and sanitizes the AI-generated action plan against actual board data.
 */
function validateActionPlan(
  raw: any,
  ctx: { cards: { id: string }[]; lists: { id: string }[]; members: { id: string }[]; labels: { id: string }[] }
): CommandActionPlan {
  const validCardIds = new Set(ctx.cards.map(c => c.id));
  const validListIds = new Set(ctx.lists.map(l => l.id));
  const validMemberIds = new Set(ctx.members.map(m => m.id));
  const validLabelIds = new Set(ctx.labels.map(l => l.id));

  const actions: CommandAction[] = [];

  if (Array.isArray(raw.actions)) {
    for (const action of raw.actions.slice(0, 10)) {
      if (!action || typeof action !== 'object') continue;
      if (!VALID_ACTION_TYPES.includes(action.type)) continue;
      if (!Array.isArray(action.card_ids) || action.card_ids.length === 0) continue;

      // Filter to only valid card IDs
      const filteredCardIds = action.card_ids
        .filter((id: string) => typeof id === 'string' && validCardIds.has(id))
        .slice(0, MAX_CARDS_PER_ACTION);

      if (filteredCardIds.length === 0) continue;

      const config: CommandAction['config'] = {};

      // Validate config based on action type
      if (action.type === 'move') {
        if (!action.config?.target_list_id || !validListIds.has(action.config.target_list_id)) continue;
        config.target_list_id = action.config.target_list_id;
      } else if (action.type === 'assign') {
        if (!action.config?.assignee_id || !validMemberIds.has(action.config.assignee_id)) continue;
        config.assignee_id = action.config.assignee_id;
      } else if (action.type === 'add_label') {
        if (!action.config?.label_id || !validLabelIds.has(action.config.label_id)) continue;
        config.label_id = action.config.label_id;
      } else if (action.type === 'set_priority') {
        const validPriorities = ['urgent', 'high', 'medium', 'low', 'none'];
        if (!action.config?.priority || !validPriorities.includes(action.config.priority)) continue;
        config.priority = action.config.priority;
      }
      // archive/unarchive don't need extra config

      actions.push({
        type: action.type,
        card_ids: filteredCardIds,
        description: typeof action.description === 'string' ? action.description.slice(0, 200) : `${action.type} ${filteredCardIds.length} cards`,
        config,
      });
    }
  }

  return {
    actions,
    summary: typeof raw.summary === 'string' ? raw.summary.slice(0, 300) : 'Command parsed',
    ...(typeof raw.warning === 'string' && raw.warning.trim() ? { warning: raw.warning.slice(0, 200) } : {}),
  };
}
