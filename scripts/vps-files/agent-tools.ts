import { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';

// ============================================================================
// AGENT TOOL DEFINITIONS (Board-scoped, multi-turn)
// VPS port of agency-board/src/lib/ai/agent-tools.ts
// ============================================================================

export interface AgentToolMeta {
  category: string;
  needs_confirmation: boolean;
}

const AGENT_TOOL_DEFINITIONS: (Anthropic.Tool & { _meta: AgentToolMeta })[] = [
  {
    name: 'think',
    description:
      'Use this tool for internal reasoning. Think through a problem step-by-step before acting. Your thoughts are NOT shown to the user, only a brief indicator.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reasoning: { type: 'string', description: 'Your chain-of-thought reasoning' },
      },
      required: ['reasoning'],
    },
    _meta: { category: 'internal', needs_confirmation: false },
  },
  {
    name: 'list_cards',
    description:
      'List cards from a specific list or the entire board. Supports filtering by priority, assignee, label, or due date.',
    input_schema: {
      type: 'object' as const,
      properties: {
        list_name: { type: 'string', description: 'Filter to a specific list name (optional)' },
        priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low', 'none'], description: 'Filter by priority (optional)' },
        assignee_name: { type: 'string', description: 'Filter by assignee display name (optional)' },
        label_name: { type: 'string', description: 'Filter by label name (optional)' },
        has_due_date: { type: 'boolean', description: 'Filter to cards with/without due dates (optional)' },
        is_overdue: { type: 'boolean', description: 'Filter to overdue cards only (optional)' },
        limit: { type: 'number', description: 'Max cards to return (default 50)' },
      },
      required: [],
    },
    _meta: { category: 'read', needs_confirmation: false },
  },
  {
    name: 'get_card',
    description:
      'Get full details of a specific card including description, checklists, comments, labels, assignees, and custom fields.',
    input_schema: {
      type: 'object' as const,
      properties: {
        card_id: { type: 'string', description: 'The UUID of the card' },
      },
      required: ['card_id'],
    },
    _meta: { category: 'read', needs_confirmation: false },
  },
  {
    name: 'search_cards',
    description:
      'Full-text search across card titles and descriptions on the board.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query text' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: ['query'],
    },
    _meta: { category: 'read', needs_confirmation: false },
  },
  {
    name: 'get_board_summary',
    description:
      'Get a high-level overview of the board: list counts, priority breakdown, overdue cards, workload distribution by assignee.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
    _meta: { category: 'read', needs_confirmation: false },
  },
  {
    name: 'create_card',
    description:
      'Create a new card in a specific list. Returns the created card ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Card title' },
        list_name: { type: 'string', description: 'Target list name' },
        description: { type: 'string', description: 'Card description (optional)' },
        priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low', 'none'], description: 'Priority (optional, default none)' },
        due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format (optional)' },
      },
      required: ['title', 'list_name'],
    },
    _meta: { category: 'write', needs_confirmation: true },
  },
  {
    name: 'update_card',
    description:
      'Update fields on an existing card (title, description, priority, due_date).',
    input_schema: {
      type: 'object' as const,
      properties: {
        card_id: { type: 'string', description: 'The UUID of the card to update' },
        title: { type: 'string', description: 'New title (optional)' },
        description: { type: 'string', description: 'New description (optional)' },
        priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low', 'none'], description: 'New priority (optional)' },
        due_date: { type: 'string', description: 'New due date in YYYY-MM-DD (optional, null to clear)' },
      },
      required: ['card_id'],
    },
    _meta: { category: 'write', needs_confirmation: true },
  },
  {
    name: 'move_card',
    description:
      'Move a card to a different list on the board.',
    input_schema: {
      type: 'object' as const,
      properties: {
        card_id: { type: 'string', description: 'The UUID of the card to move' },
        target_list_name: { type: 'string', description: 'The name of the target list' },
      },
      required: ['card_id', 'target_list_name'],
    },
    _meta: { category: 'write', needs_confirmation: true },
  },
  {
    name: 'add_comment',
    description:
      'Add a comment to a card. Use for leaving notes, updates, or analysis results.',
    input_schema: {
      type: 'object' as const,
      properties: {
        card_id: { type: 'string', description: 'The UUID of the card' },
        content: { type: 'string', description: 'The comment text' },
      },
      required: ['card_id', 'content'],
    },
    _meta: { category: 'write', needs_confirmation: false },
  },
];

// ============================================================================
// TOOL FILTERING
// ============================================================================

export interface AgentSkillMinimal {
  supported_tools?: string[];
}

export interface BoardAgentMinimal {
  custom_tools?: string[];
  requires_confirmation?: boolean;
}

/**
 * Get filtered tool definitions based on skill capabilities.
 */
export function getAgentToolDefinitions(
  skill: AgentSkillMinimal,
  boardAgent?: BoardAgentMinimal | null
): Anthropic.Tool[] {
  const supportedTools = skill.supported_tools ?? [];
  if (supportedTools.length === 0) return [];

  let tools = AGENT_TOOL_DEFINITIONS.filter(
    (t) => supportedTools.includes(t.name)
  );

  if (boardAgent?.custom_tools && boardAgent.custom_tools.length > 0) {
    tools = tools.filter((t) => boardAgent.custom_tools!.includes(t.name));
  }

  // 'think' is always available if any tools are enabled
  const hasThink = tools.some((t) => t.name === 'think');
  if (!hasThink && tools.length > 0) {
    const thinkTool = AGENT_TOOL_DEFINITIONS.find((t) => t.name === 'think');
    if (thinkTool) tools.unshift(thinkTool);
  }

  // Strip _meta before returning
  return tools.map(({ _meta, ...tool }) => tool as Anthropic.Tool);
}

/**
 * Check if a tool needs user confirmation.
 */
export function needsAgentConfirmation(
  toolName: string,
  boardAgent?: BoardAgentMinimal | null
): boolean {
  if (boardAgent && !boardAgent.requires_confirmation) return false;
  const toolDef = AGENT_TOOL_DEFINITIONS.find((t) => t.name === toolName);
  if (!toolDef) return false;
  return toolDef._meta.needs_confirmation;
}

/**
 * Build confirmation message for a tool call.
 */
export function buildAgentConfirmationMessage(
  toolName: string,
  toolInput: Record<string, unknown>
): string {
  switch (toolName) {
    case 'create_card':
      return `Create card "${toolInput.title}" in list "${toolInput.list_name}"?`;
    case 'update_card':
      return `Update card ${toolInput.card_id}? Changes: ${Object.keys(toolInput).filter(k => k !== 'card_id').join(', ')}`;
    case 'move_card':
      return `Move card to "${toolInput.target_list_name}"?`;
    default:
      return `Execute ${toolName}?`;
  }
}

// ============================================================================
// TOOL RESULT TYPE
// ============================================================================

export interface AgentToolResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

// ============================================================================
// TOOL EXECUTORS
// ============================================================================

/**
 * Execute a board-scoped agent tool (VPS version - uses passed supabase client).
 */
export async function executeAgentTool(
  supabase: SupabaseClient,
  userId: string,
  boardId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  boardContext?: BoardContext | null
): Promise<AgentToolResult> {
  try {
    switch (toolName) {
      case 'think':
        return { success: true, message: 'Reasoning recorded.', data: { reasoning: String(toolInput.reasoning ?? '') } };
      case 'list_cards':
        return await executeListCards(supabase, boardId, toolInput, boardContext);
      case 'get_card':
        return await executeGetCard(supabase, toolInput);
      case 'search_cards':
        return await executeSearchCards(supabase, boardId, toolInput);
      case 'get_board_summary':
        return await executeGetBoardSummary(boardContext, boardId, supabase);
      case 'create_card':
        return await executeCreateCard(supabase, userId, boardId, toolInput);
      case 'update_card':
        return await executeUpdateCard(supabase, toolInput);
      case 'move_card':
        return await executeMoveCard(supabase, boardId, toolInput);
      case 'add_comment':
        return await executeAddComment(supabase, userId, toolInput);
      default:
        return { success: false, message: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    return {
      success: false,
      message: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ============================================================================
// BOARD CONTEXT (inlined from board-context.ts for VPS standalone use)
// ============================================================================

export interface BoardContextCard {
  id: string;
  title: string;
  description: string;
  list_id: string;
  list_name: string;
  priority: string;
  due_date: string | null;
  assignee_names: string[];
  labels: string[];
  comments: { author: string; text: string; created_at: string }[];
  checklists: { title: string; items: { text: string; checked: boolean }[] }[];
  is_archived: boolean;
}

export interface BoardContext {
  board: { id: string; title: string; background_color: string | null };
  lists: { id: string; title: string; position: number; card_count: number }[];
  cards: BoardContextCard[];
  members: { id: string; name: string; email: string; role: string }[];
  labels: { id: string; name: string; color: string }[];
}

export async function gatherBoardContext(
  supabase: SupabaseClient,
  boardId: string
): Promise<BoardContext | null> {
  const [{ data: board }, { data: lists }, { data: labels }] = await Promise.all([
    supabase.from('boards').select('id, name, type, background_color').eq('id', boardId).single(),
    supabase.from('lists').select('id, name, position').eq('board_id', boardId).order('position'),
    supabase.from('labels').select('id, name, color').eq('board_id', boardId),
  ]);

  if (!board) return null;

  const listIds = (lists || []).map((l: any) => l.id);
  const listNameMap = new Map((lists || []).map((l: any) => [l.id, l.name]));

  let placements: any[] = [];
  if (listIds.length > 0) {
    const { data } = await supabase
      .from('card_placements')
      .select('list_id, position, card:cards(id, title, description, priority, due_date, created_at, updated_at)')
      .in('list_id', listIds)
      .order('position')
      .limit(500);
    placements = data || [];
  }

  const cardIds = placements.map((c: any) => c.card?.id).filter(Boolean);

  // Parallel fetch card details
  const assigneeMap: Record<string, string[]> = {};
  const cardLabelMap: Record<string, string[]> = {};
  const commentMap: Record<string, { author: string; text: string; created_at: string }[]> = {};
  const checklistMap: Record<string, { title: string; items: { text: string; checked: boolean }[] }[]> = {};

  if (cardIds.length > 0) {
    const [{ data: assignees }, { data: cardLabels }, { data: comments }, { data: checklists }] = await Promise.all([
      supabase.from('card_assignees').select('card_id, user:profiles(display_name)').in('card_id', cardIds.slice(0, 200)),
      supabase.from('card_labels').select('card_id, label:labels(name)').in('card_id', cardIds.slice(0, 200)),
      supabase.from('comments').select('card_id, content, created_at, user:profiles(display_name)').in('card_id', cardIds.slice(0, 200)).order('created_at', { ascending: false }).limit(600),
      supabase.from('checklists').select('id, card_id, title').in('card_id', cardIds.slice(0, 200)),
    ]);

    if (assignees) {
      for (const a of assignees) {
        const name = (a as any).user?.display_name;
        if (name) {
          if (!assigneeMap[a.card_id]) assigneeMap[a.card_id] = [];
          assigneeMap[a.card_id].push(name);
        }
      }
    }

    if (cardLabels) {
      for (const cl of cardLabels) {
        const labelName = (cl as any).label?.name;
        if (labelName) {
          if (!cardLabelMap[cl.card_id]) cardLabelMap[cl.card_id] = [];
          cardLabelMap[cl.card_id].push(labelName);
        }
      }
    }

    if (comments) {
      for (const c of comments) {
        const cid = c.card_id;
        if (!commentMap[cid]) commentMap[cid] = [];
        if (commentMap[cid].length < 3) {
          commentMap[cid].push({
            author: (c as any).user?.display_name || 'Unknown',
            text: typeof c.content === 'string' ? c.content.slice(0, 500) : '',
            created_at: c.created_at,
          });
        }
      }
    }

    if (checklists && checklists.length > 0) {
      const clIds = checklists.map((cl: any) => cl.id);
      const { data: items } = await supabase
        .from('checklist_items')
        .select('checklist_id, content, is_checked')
        .in('checklist_id', clIds)
        .order('position');

      const itemsByChecklist: Record<string, { text: string; checked: boolean }[]> = {};
      if (items) {
        for (const item of items) {
          if (!itemsByChecklist[item.checklist_id]) itemsByChecklist[item.checklist_id] = [];
          itemsByChecklist[item.checklist_id].push({ text: item.content, checked: item.is_checked });
        }
      }

      for (const cl of checklists) {
        const cid = cl.card_id;
        if (!checklistMap[cid]) checklistMap[cid] = [];
        checklistMap[cid].push({ title: cl.title, items: itemsByChecklist[cl.id] || [] });
      }
    }
  }

  const { data: members } = await supabase
    .from('board_members')
    .select('user_id, role, profile:profiles(display_name, email)')
    .eq('board_id', boardId);

  const listCardCounts: Record<string, number> = {};
  for (const p of placements) {
    listCardCounts[p.list_id] = (listCardCounts[p.list_id] || 0) + 1;
  }

  const contextCards: BoardContextCard[] = placements
    .filter((p: any) => p.card)
    .map((p: any) => ({
      id: p.card.id,
      title: p.card.title,
      description: typeof p.card.description === 'string' ? p.card.description.slice(0, 800) : '',
      list_id: p.list_id,
      list_name: listNameMap.get(p.list_id) || 'Unknown',
      priority: p.card.priority || 'none',
      due_date: p.card.due_date,
      assignee_names: assigneeMap[p.card.id] || [],
      labels: cardLabelMap[p.card.id] || [],
      comments: commentMap[p.card.id] || [],
      checklists: checklistMap[p.card.id] || [],
      is_archived: false,
    }));

  return {
    board: { id: board.id, title: board.name, background_color: board.background_color || null },
    lists: (lists || []).map((l: any) => ({
      id: l.id, title: l.name, position: l.position, card_count: listCardCounts[l.id] || 0,
    })),
    cards: contextCards,
    members: (members || []).map((m: any) => ({
      id: m.user_id, name: m.profile?.display_name || 'Unknown', email: m.profile?.email || '', role: m.role,
    })),
    labels: (labels || []).map((l: any) => ({ id: l.id, name: l.name, color: l.color })),
  };
}

export function boardContextToText(ctx: BoardContext): string {
  let text = `Board: ${ctx.board.title}\n`;
  text += `Lists: ${ctx.lists.map((l) => `${l.title} (${l.card_count} cards)`).join(', ')}\n`;
  text += `Labels: ${ctx.labels.map((l) => `${l.name} (${l.color})`).join(', ')}\n`;
  text += `Team members: ${ctx.members.map((m) => `${m.name} (${m.role})`).join(', ')}\n\n`;

  text += `=== All Cards (${ctx.cards.length}) ===\n\n`;
  for (const c of ctx.cards) {
    const assigneeStr = c.assignee_names.length > 0 ? ` | Assigned: ${c.assignee_names.join(', ')}` : '';
    const dueStr = c.due_date ? ` | Due: ${c.due_date}` : '';
    const priorityStr = c.priority !== 'none' ? ` | Priority: ${c.priority}` : '';
    const labelStr = c.labels.length > 0 ? ` | Labels: ${c.labels.join(', ')}` : '';
    text += `## [${c.list_name}] ${c.title}${priorityStr}${dueStr}${assigneeStr}${labelStr}\n`;

    if (c.description) text += `Description: ${c.description}\n`;

    if (c.checklists.length > 0) {
      for (const cl of c.checklists) {
        text += `Checklist "${cl.title}": ${cl.items.map((i) => `${i.checked ? '[x]' : '[ ]'} ${i.text}`).join(', ')}\n`;
      }
    }

    if (c.comments.length > 0) {
      text += `Comments:\n`;
      for (const cm of c.comments) {
        text += `  - ${cm.author} (${cm.created_at.slice(0, 10)}): ${cm.text}\n`;
      }
    }

    text += '\n';
  }

  return text;
}

// ============================================================================
// INDIVIDUAL TOOL IMPLEMENTATIONS
// ============================================================================

async function executeListCards(
  supabase: SupabaseClient,
  boardId: string,
  input: Record<string, unknown>,
  boardContext?: BoardContext | null
): Promise<AgentToolResult> {
  const ctx = boardContext ?? (await gatherBoardContext(supabase, boardId));
  if (!ctx) return { success: false, message: 'Board not found' };

  let cards = [...ctx.cards];
  const listName = input.list_name as string | undefined;
  const priority = input.priority as string | undefined;
  const assigneeName = input.assignee_name as string | undefined;
  const labelName = input.label_name as string | undefined;
  const hasDueDate = input.has_due_date as boolean | undefined;
  const isOverdue = input.is_overdue as boolean | undefined;
  const limit = Math.min((input.limit as number) || 50, 100);

  if (listName) cards = cards.filter((c) => c.list_name.toLowerCase() === listName.toLowerCase());
  if (priority) cards = cards.filter((c) => c.priority === priority);
  if (assigneeName) cards = cards.filter((c) => c.assignee_names.some((a) => a.toLowerCase().includes(assigneeName.toLowerCase())));
  if (labelName) cards = cards.filter((c) => c.labels.some((l) => l.toLowerCase().includes(labelName.toLowerCase())));
  if (hasDueDate !== undefined) cards = cards.filter((c) => hasDueDate ? c.due_date !== null : c.due_date === null);
  if (isOverdue) {
    const now = new Date().toISOString().split('T')[0];
    cards = cards.filter((c) => c.due_date && c.due_date < now);
  }

  const sliced = cards.slice(0, limit);
  const lines = sliced.map((c) => {
    const parts = [`[${c.list_name}] ${c.title} (id: ${c.id})`];
    if (c.priority !== 'none') parts.push(`priority: ${c.priority}`);
    if (c.due_date) parts.push(`due: ${c.due_date}`);
    if (c.assignee_names.length) parts.push(`assigned: ${c.assignee_names.join(', ')}`);
    if (c.labels.length) parts.push(`labels: ${c.labels.join(', ')}`);
    return parts.join(' | ');
  });

  return {
    success: true,
    message: `Found ${cards.length} cards${cards.length > limit ? ` (showing first ${limit})` : ''}:\n${lines.join('\n')}`,
    data: { total: cards.length, shown: sliced.length },
  };
}

async function executeGetCard(
  supabase: SupabaseClient,
  input: Record<string, unknown>
): Promise<AgentToolResult> {
  const cardId = input.card_id as string;
  if (!cardId) return { success: false, message: 'card_id is required' };

  const { data: card } = await supabase
    .from('cards')
    .select('id, title, description, priority, due_date, created_at, updated_at')
    .eq('id', cardId)
    .single();
  if (!card) return { success: false, message: 'Card not found' };

  const [{ data: labels }, { data: comments }, { data: checklists }, { data: assignees }] = await Promise.all([
    supabase.from('card_labels').select('label:labels(name)').eq('card_id', cardId),
    supabase.from('comments').select('content, created_at, profile:profiles(display_name)').eq('card_id', cardId).order('created_at', { ascending: false }).limit(10),
    supabase.from('checklists').select('title, items:checklist_items(title, is_completed)').eq('card_id', cardId),
    supabase.from('card_assignees').select('user:profiles(display_name)').eq('card_id', cardId),
  ]);

  const parts: string[] = [];
  parts.push(`# ${card.title} (${card.id})`);
  if (card.description) parts.push(`Description: ${card.description}`);
  if (card.priority !== 'none') parts.push(`Priority: ${card.priority}`);
  if (card.due_date) parts.push(`Due: ${card.due_date}`);
  const assigneeNames = (assignees ?? []).map((a: any) => a.user?.display_name).filter(Boolean);
  if (assigneeNames.length) parts.push(`Assigned to: ${assigneeNames.join(', ')}`);
  const labelNames = (labels ?? []).map((l: any) => l.label?.name).filter(Boolean);
  if (labelNames.length) parts.push(`Labels: ${labelNames.join(', ')}`);
  if (checklists?.length) {
    for (const cl of checklists as any[]) {
      const items = cl.items ?? [];
      const done = items.filter((i: any) => i.is_completed).length;
      parts.push(`Checklist "${cl.title}": ${done}/${items.length} done`);
    }
  }
  if (comments?.length) {
    parts.push(`Recent comments (${comments.length}):`);
    for (const c of (comments as any[]).slice(0, 5)) {
      parts.push(`  - ${c.profile?.display_name ?? 'Unknown'}: ${c.content.slice(0, 200)}`);
    }
  }

  return { success: true, message: parts.join('\n'), data: { card_id: cardId } };
}

async function executeSearchCards(
  supabase: SupabaseClient,
  boardId: string,
  input: Record<string, unknown>
): Promise<AgentToolResult> {
  const query = input.query as string;
  if (!query) return { success: false, message: 'query is required' };
  const limit = Math.min((input.limit as number) || 20, 50);

  const { data: lists } = await supabase.from('lists').select('id, name').eq('board_id', boardId);
  if (!lists?.length) return { success: true, message: 'No lists on this board.' };

  const listIds = lists.map((l: any) => l.id);
  const listNameMap = new Map(lists.map((l: any) => [l.id, l.name]));

  const { data: placements } = await supabase
    .from('card_placements')
    .select('list_id, card:cards(id, title, description, priority)')
    .in('list_id', listIds)
    .limit(500);

  if (!placements?.length) return { success: true, message: 'No cards found.' };

  const lowerQ = query.toLowerCase();
  const matches = (placements as any[])
    .filter((p) => p.card && (
      p.card.title?.toLowerCase().includes(lowerQ) ||
      p.card.description?.toLowerCase().includes(lowerQ)
    ))
    .slice(0, limit);

  if (matches.length === 0) return { success: true, message: `No cards matching "${query}" found.` };

  const lines = matches.map((m: any) => {
    const listName = listNameMap.get(m.list_id) || 'Unknown';
    return `[${listName}] ${m.card.title} (id: ${m.card.id})`;
  });

  return {
    success: true,
    message: `Found ${matches.length} matching cards:\n${lines.join('\n')}`,
    data: { count: matches.length },
  };
}

async function executeGetBoardSummary(
  boardContext: BoardContext | null | undefined,
  boardId: string,
  supabase: SupabaseClient
): Promise<AgentToolResult> {
  const ctx = boardContext ?? (await gatherBoardContext(supabase, boardId));
  if (!ctx) return { success: false, message: 'Board not found' };

  const summary = boardContextToText(ctx);

  const priorityCounts: Record<string, number> = {};
  let overdueCount = 0;
  const now = new Date().toISOString().split('T')[0];
  const workloadMap: Record<string, number> = {};

  for (const card of ctx.cards) {
    priorityCounts[card.priority] = (priorityCounts[card.priority] || 0) + 1;
    if (card.due_date && card.due_date < now) overdueCount++;
    for (const assignee of card.assignee_names) {
      workloadMap[assignee] = (workloadMap[assignee] || 0) + 1;
    }
  }

  const parts: string[] = [summary];
  parts.push(`\nPriority breakdown: ${JSON.stringify(priorityCounts)}`);
  parts.push(`Overdue cards: ${overdueCount}`);
  parts.push(`Total cards: ${ctx.cards.length}`);
  if (Object.keys(workloadMap).length > 0) {
    parts.push(`Workload: ${Object.entries(workloadMap).map(([name, count]) => `${name}: ${count}`).join(', ')}`);
  }

  return { success: true, message: parts.join('\n'), data: { total_cards: ctx.cards.length, overdue: overdueCount } };
}

async function executeCreateCard(
  supabase: SupabaseClient,
  userId: string,
  boardId: string,
  input: Record<string, unknown>
): Promise<AgentToolResult> {
  const title = input.title as string;
  const listName = input.list_name as string;
  if (!title || !listName) return { success: false, message: 'title and list_name are required' };

  const { data: list } = await supabase
    .from('lists')
    .select('id, name')
    .eq('board_id', boardId)
    .ilike('name', listName)
    .limit(1)
    .single();

  if (!list) {
    const { data: allLists } = await supabase.from('lists').select('name').eq('board_id', boardId);
    const names = (allLists || []).map((l: any) => l.name);
    return { success: false, message: `List "${listName}" not found. Available: ${names.join(', ')}` };
  }

  const cardId = crypto.randomUUID();
  const { error: cardError } = await supabase.from('cards').insert({
    id: cardId,
    title,
    description: (input.description as string) || '',
    priority: (input.priority as string) || 'none',
    due_date: (input.due_date as string) || null,
    created_by: userId,
  });

  if (cardError) return { success: false, message: `Failed to create card: ${cardError.message}` };

  const { data: maxPos } = await supabase
    .from('card_placements')
    .select('position')
    .eq('list_id', list.id)
    .order('position', { ascending: false })
    .limit(1);

  const nextPos = maxPos?.length ? (maxPos[0] as any).position + 1 : 0;

  const { error: placementError } = await supabase.from('card_placements').insert({
    card_id: cardId,
    list_id: list.id,
    position: nextPos,
    is_mirror: false,
  });

  if (placementError) return { success: false, message: `Card created but placement failed: ${placementError.message}` };

  return {
    success: true,
    message: `Card "${title}" created in "${list.name}" (id: ${cardId})`,
    data: { card_id: cardId, list_id: list.id },
  };
}

async function executeUpdateCard(
  supabase: SupabaseClient,
  input: Record<string, unknown>
): Promise<AgentToolResult> {
  const cardId = input.card_id as string;
  if (!cardId) return { success: false, message: 'card_id is required' };

  const updates: Record<string, unknown> = {};
  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.due_date !== undefined) updates.due_date = input.due_date;

  if (Object.keys(updates).length === 0) {
    return { success: false, message: 'No fields to update.' };
  }

  const { error } = await supabase.from('cards').update(updates).eq('id', cardId);
  if (error) return { success: false, message: `Failed to update card: ${error.message}` };

  return {
    success: true,
    message: `Card updated. Changed: ${Object.keys(updates).join(', ')}`,
    data: { card_id: cardId, updated_fields: Object.keys(updates) },
  };
}

async function executeMoveCard(
  supabase: SupabaseClient,
  boardId: string,
  input: Record<string, unknown>
): Promise<AgentToolResult> {
  const cardId = input.card_id as string;
  const targetListName = input.target_list_name as string;
  if (!cardId || !targetListName) return { success: false, message: 'card_id and target_list_name are required' };

  const { data: placement } = await supabase
    .from('card_placements')
    .select('id, list_id')
    .eq('card_id', cardId)
    .limit(1)
    .single();
  if (!placement) return { success: false, message: 'Card placement not found' };

  const { data: targetList } = await supabase
    .from('lists')
    .select('id, name')
    .eq('board_id', boardId)
    .ilike('name', targetListName)
    .limit(1)
    .single();

  if (!targetList) {
    const { data: allLists } = await supabase.from('lists').select('name').eq('board_id', boardId);
    const names = (allLists || []).map((l: any) => l.name);
    return { success: false, message: `List "${targetListName}" not found. Available: ${names.join(', ')}` };
  }

  const { error } = await supabase
    .from('card_placements')
    .update({ list_id: targetList.id })
    .eq('id', placement.id);

  if (error) return { success: false, message: `Failed to move card: ${error.message}` };

  return {
    success: true,
    message: `Card moved to "${targetList.name}"`,
    data: { card_id: cardId, new_list: targetList.name, new_list_id: targetList.id },
  };
}

async function executeAddComment(
  supabase: SupabaseClient,
  userId: string,
  input: Record<string, unknown>
): Promise<AgentToolResult> {
  const cardId = input.card_id as string;
  const content = input.content as string;
  if (!cardId || !content) return { success: false, message: 'card_id and content are required' };

  const { error } = await supabase.from('comments').insert({
    id: crypto.randomUUID(),
    card_id: cardId,
    user_id: userId,
    content: `[Agent] ${content}`,
    is_external: false,
  });

  if (error) return { success: false, message: `Failed to add comment: ${error.message}` };

  return { success: true, message: 'Comment added to card.' };
}
