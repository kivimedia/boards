import { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Shared board context for AI assistant and command mode
// ============================================================================

export interface BoardContextCard {
  id: string;
  title: string;
  list_id: string;
  list_name: string;
  priority: string;
  due_date: string | null;
  assignee_names: string[];
  labels: string[];
  is_archived: boolean;
}

export interface BoardContextMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface BoardContextLabel {
  id: string;
  name: string;
  color: string;
}

export interface BoardContextList {
  id: string;
  title: string;
  position: number;
  card_count: number;
}

export interface BoardContext {
  board: { id: string; title: string; background_color: string | null };
  lists: BoardContextList[];
  cards: BoardContextCard[];
  members: BoardContextMember[];
  labels: BoardContextLabel[];
}

/**
 * Gathers full board context (lists, cards, members, labels) for AI consumption.
 * Used by both the board assistant and command mode endpoints.
 */
export async function gatherBoardContext(
  supabase: SupabaseClient,
  boardId: string
): Promise<BoardContext | null> {
  // Parallel fetch: board, lists, labels
  const [{ data: board }, { data: lists }, { data: labels }] = await Promise.all([
    supabase.from('boards').select('id, name, type, background_color').eq('id', boardId).single(),
    supabase.from('lists').select('id, name, position').eq('board_id', boardId).order('position'),
    supabase.from('labels').select('id, name, color').eq('board_id', boardId),
  ]);

  if (!board) return null;

  const listIds = (lists || []).map((l: any) => l.id);
  const listNameMap = new Map((lists || []).map((l: any) => [l.id, l.name]));

  // Fetch card placements with card data
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

  // Fetch card assignees
  const cardIds = placements.map((c: any) => c.card?.id).filter(Boolean);
  const assigneeMap: Record<string, string[]> = {};
  if (cardIds.length > 0) {
    const { data: assignees } = await supabase
      .from('card_assignees')
      .select('card_id, user:profiles(display_name)')
      .in('card_id', cardIds.slice(0, 200));

    if (assignees) {
      for (const a of assignees) {
        const name = (a as any).user?.display_name;
        if (name) {
          if (!assigneeMap[a.card_id]) assigneeMap[a.card_id] = [];
          assigneeMap[a.card_id].push(name);
        }
      }
    }
  }

  // Fetch card labels
  const cardLabelMap: Record<string, string[]> = {};
  if (cardIds.length > 0) {
    const { data: cardLabels } = await supabase
      .from('card_labels')
      .select('card_id, label:labels(name)')
      .in('card_id', cardIds.slice(0, 200));

    if (cardLabels) {
      for (const cl of cardLabels) {
        const labelName = (cl as any).label?.name;
        if (labelName) {
          if (!cardLabelMap[cl.card_id]) cardLabelMap[cl.card_id] = [];
          cardLabelMap[cl.card_id].push(labelName);
        }
      }
    }
  }

  // Fetch board members with profiles
  const { data: members } = await supabase
    .from('board_members')
    .select('user_id, role, profile:profiles(display_name, email)')
    .eq('board_id', boardId);

  // Build list card counts
  const listCardCounts: Record<string, number> = {};
  for (const p of placements) {
    listCardCounts[p.list_id] = (listCardCounts[p.list_id] || 0) + 1;
  }

  // Build cards array
  const contextCards: BoardContextCard[] = placements
    .filter((p: any) => p.card)
    .map((p: any) => ({
      id: p.card.id,
      title: p.card.title,
      list_id: p.list_id,
      list_name: listNameMap.get(p.list_id) || 'Unknown',
      priority: p.card.priority || 'none',
      due_date: p.card.due_date,
      assignee_names: assigneeMap[p.card.id] || [],
      labels: cardLabelMap[p.card.id] || [],
      is_archived: false,
    }));

  return {
    board: {
      id: board.id,
      title: board.name,
      background_color: board.background_color || null,
    },
    lists: (lists || []).map((l: any) => ({
      id: l.id,
      title: l.name,
      position: l.position,
      card_count: listCardCounts[l.id] || 0,
    })),
    cards: contextCards,
    members: (members || []).map((m: any) => ({
      id: m.user_id,
      name: m.profile?.display_name || 'Unknown',
      email: m.profile?.email || '',
      role: m.role,
    })),
    labels: (labels || []).map((l: any) => ({
      id: l.id,
      name: l.name,
      color: l.color,
    })),
  };
}

/**
 * Converts BoardContext into a text summary for AI system prompts.
 */
export function boardContextToText(ctx: BoardContext): string {
  let text = `Board: ${ctx.board.title}\n`;
  text += `Lists: ${ctx.lists.map((l) => l.title).join(', ')}\n`;
  text += `Labels: ${ctx.labels.map((l) => `${l.name} (${l.color})`).join(', ')}\n`;
  text += `Team members: ${ctx.members.map((m) => `${m.name} (${m.role})`).join(', ')}\n\n`;

  text += `Cards (${ctx.cards.length} shown):\n`;
  for (const c of ctx.cards) {
    const assigneeStr = c.assignee_names.length > 0 ? ` | Assigned: ${c.assignee_names.join(', ')}` : '';
    const dueStr = c.due_date ? ` | Due: ${c.due_date}` : '';
    const priorityStr = c.priority !== 'none' ? ` | Priority: ${c.priority}` : '';
    text += `- [${c.list_name}] ${c.title}${priorityStr}${dueStr}${assigneeStr}\n`;
  }

  return text;
}
