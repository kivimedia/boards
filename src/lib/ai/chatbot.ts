import { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { createAnthropicClient, touchApiKey } from './providers';
import { resolveModelWithFallback } from './model-resolver';
import { logUsage } from './cost-tracker';
import { canMakeAICall } from './budget-checker';
import { getSystemPrompt } from './prompt-templates';
import type {
  ChatScope,
  ChatMessage,
  ChatSession,
  ChatContext,
  ChatContextCard,
  ChatBoardSummary,
  ChatClientSummary,
  AIActivity,
} from '../types';

// ============================================================================
// CONTEXT GATHERING
// ============================================================================

/**
 * Build context for a ticket-scope chat from a card and its details.
 */
export async function buildTicketContext(
  supabase: SupabaseClient,
  cardId: string,
  userId: string
): Promise<ChatContext> {
  // Fetch card with all details
  const { data: card } = await supabase
    .from('cards')
    .select('id, title, description, priority, client_id')
    .eq('id', cardId)
    .single();

  if (!card) throw new Error('Card not found');

  // Fetch current placement (list name)
  const { data: placement } = await supabase
    .from('card_placements')
    .select('list_id, lists(title)')
    .eq('card_id', cardId)
    .limit(1)
    .single();

  // Fetch labels
  const { data: labels } = await supabase
    .from('card_labels')
    .select('label_id, labels(name)')
    .eq('card_id', cardId);

  // Fetch assignees
  const { data: assignees } = await supabase
    .from('card_assignees')
    .select('user_id, profiles(display_name)')
    .eq('card_id', cardId);

  // Fetch recent comments (last 10)
  const { data: comments } = await supabase
    .from('comments')
    .select('content, created_at')
    .eq('card_id', cardId)
    .order('created_at', { ascending: false })
    .limit(10);

  // Fetch checklists
  const { data: checklists } = await supabase
    .from('checklists')
    .select('title, checklist_items(content, is_completed)')
    .eq('card_id', cardId);

  // Fetch custom fields
  const { data: customFields } = await supabase
    .from('custom_field_values')
    .select('value, custom_field_definitions(name)')
    .eq('card_id', cardId);

  // Fetch brief
  const { data: brief } = await supabase
    .from('card_briefs')
    .select('data, completeness_score, is_complete')
    .eq('card_id', cardId)
    .single();

  // Fetch user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, user_role')
    .eq('id', userId)
    .single();

  // Build checklist summary
  let checklistSummary = '';
  if (checklists && checklists.length > 0) {
    checklistSummary = (checklists as unknown as { title: string; checklist_items: { content: string; is_completed: boolean }[] }[])
      .map((cl) => {
        const items = cl.checklist_items || [];
        const done = items.filter((i) => i.is_completed).length;
        return `${cl.title}: ${done}/${items.length} complete`;
      })
      .join('; ');
  }

  // Build custom fields map
  const cfMap: Record<string, unknown> = {};
  if (customFields) {
    for (const cf of customFields as unknown as { value: unknown; custom_field_definitions: { name: string } | null }[]) {
      if (cf.custom_field_definitions) cfMap[cf.custom_field_definitions.name] = cf.value;
    }
  }

  const listName = placement?.lists
    ? (placement.lists as unknown as { title: string }).title
    : 'Unknown';

  const labelNames = (labels || []).map((l: unknown) => {
    const row = l as { labels: { name: string } | { name: string }[] | null };
    if (Array.isArray(row.labels)) return row.labels[0]?.name ?? '';
    return row.labels?.name ?? '';
  });

  const assigneeNames = (assignees || []).map((a: unknown) => {
    const row = a as { profiles: { display_name: string } | { display_name: string }[] | null };
    if (Array.isArray(row.profiles)) return row.profiles[0]?.display_name ?? '';
    return row.profiles?.display_name ?? '';
  });

  const contextCard: ChatContextCard = {
    id: card.id,
    title: card.title,
    description: card.description,
    priority: card.priority,
    list_name: listName,
    labels: labelNames,
    assignees: assigneeNames,
    checklist_summary: checklistSummary || undefined,
    custom_fields: Object.keys(cfMap).length > 0 ? cfMap : undefined,
    brief_data: brief?.data as Record<string, unknown> | undefined,
    recent_comments: comments?.map((c: { content: string }) => c.content) || [],
  };

  // Build map board context if card has a client
  let mapBoardCtx: string | undefined;
  if (card.client_id) {
    mapBoardCtx = await buildMapBoardContext(supabase, card.client_id);
  }

  return {
    scope: 'ticket',
    card: contextCard,
    user: {
      name: profile?.display_name ?? 'Unknown',
      role: profile?.user_role ?? 'member',
    },
    map_board_context: mapBoardCtx || undefined,
  };
}

/**
 * Build context for a board-scope chat.
 */
export async function buildBoardContext(
  supabase: SupabaseClient,
  boardId: string,
  userId: string
): Promise<ChatContext> {
  // Fetch board info
  const { data: board } = await supabase
    .from('boards')
    .select('id, name, board_type')
    .eq('id', boardId)
    .single();

  if (!board) throw new Error('Board not found');

  // Fetch all cards on the board with their placement info (limit 100 for context window)
  const { data: placements } = await supabase
    .from('card_placements')
    .select(`
      card_id,
      lists!inner(id, title, board_id),
      cards!inner(id, title, description, priority)
    `)
    .eq('lists.board_id', boardId)
    .limit(100);

  // Fetch user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, user_role')
    .eq('id', userId)
    .single();

  const cards: ChatContextCard[] = (placements || []).map((p: unknown) => {
    const row = p as {
      cards: { id: string; title: string; description: string | null; priority: string | null } | { id: string; title: string; description: string | null; priority: string | null }[];
      lists: { title: string } | { title: string }[];
    };
    const card = Array.isArray(row.cards) ? row.cards[0] : row.cards;
    const list = Array.isArray(row.lists) ? row.lists[0] : row.lists;
    return {
      id: card.id,
      title: card.title,
      description: card.description,
      priority: card.priority,
      list_name: list.title,
      labels: [] as string[],
      assignees: [] as string[],
    };
  });

  return {
    scope: 'board',
    board: {
      id: board.id,
      name: board.name,
      board_type: board.board_type,
      cards,
    },
    user: {
      name: profile?.display_name ?? 'Unknown',
      role: profile?.user_role ?? 'member',
    },
  };
}

/**
 * Build context for all-boards scope — enriched with board summaries,
 * client list, and recent activity.
 */
export async function buildGlobalContext(
  supabase: SupabaseClient,
  userId: string
): Promise<ChatContext> {
  // Fetch user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, user_role')
    .eq('id', userId)
    .single();

  // Fetch all boards
  const { data: boards } = await supabase
    .from('boards')
    .select('id, name, board_type');

  // Fetch all lists for card count computation
  const boardIds = (boards || []).map((b: { id: string }) => b.id);
  const { data: lists } = boardIds.length > 0
    ? await supabase.from('lists').select('id, board_id, name').in('board_id', boardIds)
    : { data: [] };

  const listIds = (lists || []).map((l: { id: string }) => l.id);
  const { data: placements } = listIds.length > 0
    ? await supabase.from('card_placements').select('list_id').in('list_id', listIds)
    : { data: [] };

  // Count cards per list
  const cardCountByList: Record<string, number> = {};
  for (const p of (placements || []) as { list_id: string }[]) {
    cardCountByList[p.list_id] = (cardCountByList[p.list_id] || 0) + 1;
  }

  // Build board summaries
  const boardsSummary: ChatBoardSummary[] = (boards || []).map((b: { id: string; name: string; board_type: string }) => {
    const boardLists = (lists || []).filter((l: { board_id: string }) => l.board_id === b.id) as { id: string; name: string }[];
    return {
      id: b.id,
      name: b.name,
      board_type: b.board_type,
      list_summary: boardLists.map((l) => ({
        name: l.name,
        card_count: cardCountByList[l.id] || 0,
      })),
    };
  });

  // Fetch clients with card counts
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name');

  const { data: clientCards } = await supabase
    .from('cards')
    .select('client_id')
    .not('client_id', 'is', null);

  const cardCountByClient: Record<string, number> = {};
  for (const c of (clientCards || []) as { client_id: string }[]) {
    if (c.client_id) cardCountByClient[c.client_id] = (cardCountByClient[c.client_id] || 0) + 1;
  }

  const clientsSummary: ChatClientSummary[] = (clients || []).map((c: { id: string; name: string }) => ({
    name: c.name,
    card_count: cardCountByClient[c.id] || 0,
  }));

  // Fetch recent activity
  const { data: activity } = await supabase
    .from('activity_log')
    .select('event_type, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(30);

  const recentActivity = (activity || []).map((a: { event_type: string; metadata: Record<string, unknown>; created_at: string }) => ({
    event: a.event_type,
    detail: JSON.stringify(a.metadata).slice(0, 120),
    when: a.created_at,
  }));

  return {
    scope: 'all_boards',
    user: {
      name: profile?.display_name ?? 'Unknown',
      role: profile?.user_role ?? 'member',
    },
    boards_summary: boardsSummary,
    clients_summary: clientsSummary,
    recent_activity: recentActivity,
  };
}

// ============================================================================
// MAP BOARD CONTEXT
// ============================================================================

/**
 * Build Map Board context for a client — includes doors/keys, training,
 * sections, and credential platform names (NEVER encrypted values).
 */
export async function buildMapBoardContext(
  supabase: SupabaseClient,
  clientId: string
): Promise<string> {
  const parts: string[] = [];

  // Doors & Keys (roadmap)
  const { data: doors } = await supabase
    .from('doors')
    .select('door_number, title, description, status')
    .eq('client_id', clientId)
    .order('door_number');

  if (doors && doors.length > 0) {
    parts.push('### Roadmap (Doors)');
    for (const door of doors as { door_number: number; title: string; description: string | null; status: string }[]) {
      const { data: keys } = await supabase
        .from('door_keys')
        .select('key_number, title, is_completed')
        .eq('door_id', door.door_number.toString())
        .order('key_number');

      // Actually need door id — fetch differently
      parts.push(`D${door.door_number}: ${door.title} [${door.status}]`);
      if (door.description) parts.push(`  ${door.description.slice(0, 200)}`);
    }
  }

  // Refetch doors with IDs for keys
  const { data: doorsWithIds } = await supabase
    .from('doors')
    .select('id, door_number, title, status')
    .eq('client_id', clientId)
    .order('door_number');

  if (doorsWithIds && doorsWithIds.length > 0) {
    const doorIds = doorsWithIds.map((d: { id: string }) => d.id);
    const { data: allKeys } = await supabase
      .from('door_keys')
      .select('door_id, key_number, title, is_completed')
      .in('door_id', doorIds)
      .order('key_number');

    if (allKeys && allKeys.length > 0) {
      parts.push('\n### Door Keys');
      for (const key of allKeys as { door_id: string; key_number: number; title: string; is_completed: boolean }[]) {
        const door = doorsWithIds.find((d: { id: string }) => d.id === key.door_id);
        const doorNum = door ? (door as { door_number: number }).door_number : '?';
        parts.push(`  D${doorNum}/K${key.key_number}: ${key.title} [${key.is_completed ? 'DONE' : 'pending'}]`);
      }
    }
  }

  // Training assignments
  const { data: training } = await supabase
    .from('training_assignments')
    .select('title, status, assigned_to, due_date')
    .eq('client_id', clientId)
    .limit(20);

  if (training && training.length > 0) {
    parts.push('\n### Training Assignments');
    for (const t of training as { title: string; status: string; due_date: string | null }[]) {
      parts.push(`- ${t.title} [${t.status}]${t.due_date ? ` due ${t.due_date}` : ''}`);
    }
  }

  // Map sections (visual brief, outreach, etc.)
  const { data: sections } = await supabase
    .from('map_sections')
    .select('section_type, title, content')
    .eq('client_id', clientId)
    .order('position');

  if (sections && sections.length > 0) {
    parts.push('\n### Map Sections');
    for (const s of sections as { section_type: string; title: string; content: Record<string, unknown> | null }[]) {
      const contentStr = s.content ? JSON.stringify(s.content).slice(0, 300) : 'empty';
      parts.push(`- ${s.title} (${s.section_type}): ${contentStr}`);
    }
  }

  // Credential platforms — NEVER include actual credentials
  const { data: credentials } = await supabase
    .from('credential_entries')
    .select('platform, category')
    .eq('client_id', clientId);

  if (credentials && credentials.length > 0) {
    parts.push('\n### Credential Platforms (access via credential vault)');
    for (const c of credentials as { platform: string; category: string | null }[]) {
      parts.push(`- ${c.platform}${c.category ? ` (${c.category})` : ''}`);
    }
  }

  return parts.join('\n');
}

// ============================================================================
// WIKI SEARCH
// ============================================================================

/**
 * Search published wiki pages by keyword for chat context enrichment.
 */
export async function searchWikiForContext(
  supabase: SupabaseClient,
  query: string,
  limit = 3
): Promise<string> {
  // Extract keywords from the query
  const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (keywords.length === 0) return '';

  // Fetch published wiki pages
  const { data: pages } = await supabase
    .from('wiki_pages')
    .select('title, content, tags, department')
    .eq('is_published', true)
    .limit(100);

  if (!pages || pages.length === 0) return '';

  // Simple keyword matching — score pages by keyword hit count
  const scored = (pages as { title: string; content: string; tags: string[] | null; department: string | null }[])
    .map((page) => {
      const text = `${page.title} ${page.content} ${(page.tags || []).join(' ')}`.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (text.includes(kw)) score++;
      }
      return { page, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (scored.length === 0) return '';

  const parts: string[] = ['## Relevant Wiki Pages'];
  for (const { page } of scored) {
    const snippet = page.content.slice(0, 500) + (page.content.length > 500 ? '...' : '');
    parts.push(`\n### ${page.title}${page.department ? ` (${page.department})` : ''}`);
    parts.push(snippet);
  }

  return parts.join('\n');
}

// ============================================================================
// CLIENT PREFIX DETECTION
// ============================================================================

/**
 * Detect "For [Client]: ..." or "About [Client]: ..." prefix in a chat message.
 * Returns the client name and the actual query if detected.
 */
export function detectClientPrefix(message: string): { clientName: string; query: string } | null {
  const match = message.match(/^(?:for|about)\s+([^:]+):\s*(.+)$/i);
  if (!match) return null;
  return { clientName: match[1].trim(), query: match[2].trim() };
}

// ============================================================================
// CONTEXT FORMATTING
// ============================================================================

/**
 * Format context into a string for inclusion in the system prompt.
 */
export function formatContextForPrompt(context: ChatContext): string {
  const parts: string[] = [];

  parts.push(`User: ${context.user.name} (${context.user.role})`);

  if (context.card) {
    const c = context.card;
    parts.push(`\n## Current Ticket`);
    parts.push(`Title: ${c.title}`);
    parts.push(`Status: ${c.list_name}`);
    if (c.description) parts.push(`Description: ${c.description}`);
    if (c.priority) parts.push(`Priority: ${c.priority}`);
    if (c.labels.length > 0) parts.push(`Labels: ${c.labels.join(', ')}`);
    if (c.assignees.length > 0) parts.push(`Assignees: ${c.assignees.join(', ')}`);
    if (c.checklist_summary) parts.push(`Checklists: ${c.checklist_summary}`);
    if (c.custom_fields) {
      parts.push(`Custom Fields: ${JSON.stringify(c.custom_fields)}`);
    }
    if (c.brief_data) {
      parts.push(`Brief: ${JSON.stringify(c.brief_data)}`);
    }
    if (c.recent_comments && c.recent_comments.length > 0) {
      parts.push(`\nRecent Comments:\n${c.recent_comments.map((cm) => `- ${cm}`).join('\n')}`);
    }
  }

  if (context.board) {
    const b = context.board;
    parts.push(`\n## Board: ${b.name} (${b.board_type})`);
    parts.push(`Total cards: ${b.cards.length}`);

    // Group cards by list
    const byList: Record<string, ChatContextCard[]> = {};
    for (const card of b.cards) {
      if (!byList[card.list_name]) byList[card.list_name] = [];
      byList[card.list_name].push(card);
    }

    for (const [listName, cards] of Object.entries(byList)) {
      parts.push(`\n### ${listName} (${cards.length} cards)`);
      for (const card of cards.slice(0, 20)) {
        const priority = card.priority ? ` [${card.priority}]` : '';
        parts.push(`- ${card.title}${priority}`);
      }
      if (cards.length > 20) {
        parts.push(`  ... and ${cards.length - 20} more`);
      }
    }
  }

  // Board summaries (global scope)
  if (context.boards_summary && context.boards_summary.length > 0) {
    parts.push(`\n## All Boards`);
    for (const board of context.boards_summary) {
      const totalCards = board.list_summary.reduce((sum, l) => sum + l.card_count, 0);
      parts.push(`\n### ${board.name} (${board.board_type}) — ${totalCards} cards`);
      for (const list of board.list_summary) {
        if (list.card_count > 0) {
          parts.push(`  - ${list.name}: ${list.card_count} cards`);
        }
      }
    }
  }

  // Client summaries (global scope)
  if (context.clients_summary && context.clients_summary.length > 0) {
    parts.push(`\n## Clients`);
    for (const client of context.clients_summary) {
      parts.push(`- ${client.name}: ${client.card_count} active cards`);
    }
  }

  // Recent activity (global scope)
  if (context.recent_activity && context.recent_activity.length > 0) {
    parts.push(`\n## Recent Activity (last 30 events)`);
    for (const entry of context.recent_activity.slice(0, 15)) {
      const when = new Date(entry.when).toLocaleString();
      parts.push(`- [${when}] ${entry.event}: ${entry.detail}`);
    }
    if (context.recent_activity.length > 15) {
      parts.push(`  ... and ${context.recent_activity.length - 15} more events`);
    }
  }

  // Map Board context (ticket scope with client, or enriched)
  if (context.map_board_context) {
    parts.push(`\n## Client Map Board`);
    parts.push(context.map_board_context);
  }

  // Wiki context (when relevant pages are found)
  if (context.wiki_context) {
    parts.push(`\n${context.wiki_context}`);
  }

  return parts.join('\n');
}

// ============================================================================
// ACTIVITY RESOLVER
// ============================================================================

function scopeToActivity(scope: ChatScope): AIActivity {
  switch (scope) {
    case 'ticket':
      return 'chatbot_ticket';
    case 'board':
      return 'chatbot_board';
    case 'all_boards':
      return 'chatbot_global';
  }
}

// ============================================================================
// CHAT SEND (NON-STREAMING)
// ============================================================================

export interface ChatSendInput {
  sessionId?: string;
  userId: string;
  boardId?: string;
  cardId?: string;
  scope: ChatScope;
  message: string;
  previousMessages?: ChatMessage[];
}

export interface ChatSendOutput {
  reply: string;
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  modelUsed: string;
}

/**
 * Send a chat message and get a response.
 * Creates or continues a chat session.
 */
export async function sendChatMessage(
  supabase: SupabaseClient,
  input: ChatSendInput
): Promise<ChatSendOutput> {
  const startTime = Date.now();
  const activity = scopeToActivity(input.scope);

  // 1. Budget check
  const budgetCheck = await canMakeAICall(supabase, {
    provider: 'anthropic',
    activity,
    userId: input.userId,
    boardId: input.boardId,
  });

  if (!budgetCheck.allowed) {
    throw new Error(`Budget exceeded: ${budgetCheck.reason}`);
  }

  // 2. Resolve model
  const modelConfig = await resolveModelWithFallback(supabase, activity);

  // 3. Create client
  const client = await createAnthropicClient(supabase);
  if (!client) {
    throw new Error('Anthropic API key not configured. Add one in Settings > AI Configuration.');
  }

  // 4. Build context
  let context: ChatContext;
  if (input.scope === 'ticket' && input.cardId) {
    context = await buildTicketContext(supabase, input.cardId, input.userId);
  } else if (input.scope === 'board' && input.boardId) {
    context = await buildBoardContext(supabase, input.boardId, input.userId);
  } else {
    context = await buildGlobalContext(supabase, input.userId);
  }

  // 4b. Enrich with wiki search results
  try {
    const wikiContext = await searchWikiForContext(supabase, input.message);
    if (wikiContext) {
      context.wiki_context = wikiContext;
    }
  } catch {
    // Wiki search is best-effort — don't fail the chat
  }

  // 5. Build messages array
  const systemPrompt = getSystemPrompt(activity);
  const contextString = formatContextForPrompt(context);
  const fullSystemPrompt = `${systemPrompt}\n\n## Context\n${contextString}`;

  const messages: Anthropic.MessageParam[] = [];

  // Add previous messages from session
  if (input.previousMessages && input.previousMessages.length > 0) {
    for (const msg of input.previousMessages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
  }

  // Add current message
  messages.push({ role: 'user', content: input.message });

  // 6. Send to Claude
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: modelConfig.model_id,
      max_tokens: modelConfig.max_tokens,
      temperature: modelConfig.temperature,
      system: fullSystemPrompt,
      messages,
    });
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    await logUsage(supabase, {
      userId: input.userId,
      boardId: input.boardId,
      cardId: input.cardId,
      activity,
      provider: 'anthropic',
      modelId: modelConfig.model_id,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs,
      status: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw new Error(`Chat failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const latencyMs = Date.now() - startTime;
  await touchApiKey(supabase, 'anthropic');

  const reply = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  // 7. Log usage
  await logUsage(supabase, {
    userId: input.userId,
    boardId: input.boardId,
    cardId: input.cardId,
    activity,
    provider: 'anthropic',
    modelId: modelConfig.model_id,
    inputTokens,
    outputTokens,
    latencyMs,
    status: 'success',
  });

  // 8. Create or update session
  const now = new Date().toISOString();
  const userMsg: ChatMessage = {
    role: 'user',
    content: input.message,
    timestamp: now,
    tokens: inputTokens,
  };
  const assistantMsg: ChatMessage = {
    role: 'assistant',
    content: reply,
    timestamp: now,
    tokens: outputTokens,
  };

  let sessionId = input.sessionId;

  if (sessionId) {
    // Update existing session
    const { data: existing } = await supabase
      .from('chat_sessions')
      .select('messages, message_count, total_tokens')
      .eq('id', sessionId)
      .single();

    if (existing) {
      const updatedMessages = [...(existing.messages as ChatMessage[]), userMsg, assistantMsg];
      await supabase
        .from('chat_sessions')
        .update({
          messages: updatedMessages,
          message_count: existing.message_count + 2,
          total_tokens: existing.total_tokens + inputTokens + outputTokens,
          model_used: modelConfig.model_id,
        })
        .eq('id', sessionId);
    }
  } else {
    // Create new session
    const title = input.message.slice(0, 100) + (input.message.length > 100 ? '...' : '');
    const { data: newSession } = await supabase
      .from('chat_sessions')
      .insert({
        user_id: input.userId,
        scope: input.scope,
        card_id: input.cardId ?? null,
        board_id: input.boardId ?? null,
        title,
        messages: [userMsg, assistantMsg],
        message_count: 2,
        total_tokens: inputTokens + outputTokens,
        model_used: modelConfig.model_id,
      })
      .select('id')
      .single();

    sessionId = newSession?.id ?? crypto.randomUUID();
  }

  return {
    reply,
    sessionId: sessionId!,
    inputTokens,
    outputTokens,
    modelUsed: modelConfig.model_id,
  };
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Get chat sessions for a user, optionally filtered by scope/card/board.
 */
export async function getChatSessions(
  supabase: SupabaseClient,
  userId: string,
  filters?: { scope?: ChatScope; cardId?: string; boardId?: string }
): Promise<ChatSession[]> {
  let query = supabase
    .from('chat_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .order('updated_at', { ascending: false });

  if (filters?.scope) query = query.eq('scope', filters.scope);
  if (filters?.cardId) query = query.eq('card_id', filters.cardId);
  if (filters?.boardId) query = query.eq('board_id', filters.boardId);

  const { data } = await query.limit(50);
  return (data as ChatSession[]) ?? [];
}

/**
 * Get a single chat session by ID.
 */
export async function getChatSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<ChatSession | null> {
  const { data } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  return data as ChatSession | null;
}

/**
 * Archive a chat session.
 */
export async function archiveChatSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<void> {
  await supabase
    .from('chat_sessions')
    .update({ is_archived: true })
    .eq('id', sessionId);
}

/**
 * Delete a chat session.
 */
export async function deleteChatSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<void> {
  await supabase
    .from('chat_sessions')
    .delete()
    .eq('id', sessionId);
}
