import { SupabaseClient } from '@supabase/supabase-js';

export interface MyTask {
  cardId: string;
  title: string;
  description: string | null;
  priority: string;
  dueDate: string | null;
  boardId: string;
  boardName: string;
  listName: string;
  labels: string[];
  isOverdue: boolean;
  isDueSoon: boolean;
}

export interface MyTasksResult {
  tasks: MyTask[];
  total: number;
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 50;

export async function fetchMyTasks(
  supabase: SupabaseClient,
  userId: string,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE
): Promise<MyTasksResult> {
  // 1. Count total assigned cards (fast indexed count)
  const { count: total } = await supabase
    .from('card_assignees')
    .select('card_id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (!total || total === 0) {
    return { tasks: [], total: 0, page, pageSize };
  }

  // 2. Get paginated card IDs (ordered by assignment for consistency)
  const offset = (page - 1) * pageSize;
  const { data: assignments } = await supabase
    .from('card_assignees')
    .select('card_id')
    .eq('user_id', userId)
    .range(offset, offset + pageSize - 1);

  if (!assignments || assignments.length === 0) {
    return { tasks: [], total, page, pageSize };
  }

  const cardIds = assignments.map((a) => a.card_id);

  // 3. Fetch card details, placements, and labels in parallel (not sequentially)
  const [cardsRes, placementsRes, labelsRes] = await Promise.all([
    supabase
      .from('cards')
      .select('id, title, description, priority, due_date')
      .in('id', cardIds),
    supabase
      .from('card_placements')
      .select('card_id, list:lists(id, name, board_id, board:boards(id, name))')
      .in('card_id', cardIds)
      .eq('is_mirror', false),
    supabase
      .from('card_labels')
      .select('card_id, label:labels(name)')
      .in('card_id', cardIds),
  ]);

  const cards = cardsRes.data || [];
  const placements = placementsRes.data || [];
  const cardLabels = labelsRes.data || [];

  // 4. Build lookup Maps (O(1) instead of O(n) per card)
  const placementMap = new Map<string, any>();
  for (const p of placements) {
    placementMap.set(p.card_id, p);
  }

  const labelMap = new Map<string, string[]>();
  for (const cl of cardLabels as any[]) {
    const name = cl.label?.name;
    if (!name) continue;
    const existing = labelMap.get(cl.card_id) || [];
    existing.push(name);
    labelMap.set(cl.card_id, existing);
  }

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const tasks: MyTask[] = cards.map((card) => {
    const placement = placementMap.get(card.id);
    const list = placement?.list as any;
    const board = list?.board as any;
    const labels = labelMap.get(card.id) || [];
    const dueDate = card.due_date ? new Date(card.due_date) : null;

    return {
      cardId: card.id,
      title: card.title,
      description: card.description,
      priority: card.priority || 'none',
      dueDate: card.due_date,
      boardId: board?.id || '',
      boardName: board?.name || 'Unknown Board',
      listName: list?.name || 'Unknown List',
      labels,
      isOverdue: dueDate ? dueDate < now : false,
      isDueSoon: dueDate ? dueDate >= now && dueDate <= tomorrow : false,
    };
  });

  return { tasks, total, page, pageSize };
}

export function groupByBoard(tasks: MyTask[]): Record<string, MyTask[]> {
  const grouped: Record<string, MyTask[]> = {};
  for (const task of tasks) {
    const key = task.boardName;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(task);
  }
  return grouped;
}

export function groupByPriority(tasks: MyTask[]): Record<string, MyTask[]> {
  const order = ['urgent', 'high', 'medium', 'low', 'none'];
  const grouped: Record<string, MyTask[]> = {};
  for (const p of order) grouped[p] = [];
  for (const task of tasks) {
    const key = task.priority || 'none';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(task);
  }
  return grouped;
}

export function sortByDueDate(tasks: MyTask[]): MyTask[] {
  return [...tasks].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });
}
