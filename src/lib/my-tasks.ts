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
  commentCount: number;
  checklistTotal: number;
  checklistDone: number;
  attachmentCount: number;
  updatedAt: string | null;
}

export interface MyTasksResult {
  tasks: MyTask[];
  total: number;
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 200;

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

  // 2. Get paginated card IDs
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

  // 3. Fetch all data in parallel
  const [cardsRes, placementsRes, labelsRes, commentsRes, checklistsRes, checklistItemsRes, attachmentsRes] = await Promise.all([
    supabase
      .from('cards')
      .select('id, title, description, priority, due_date, updated_at')
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
    supabase
      .from('comments')
      .select('card_id')
      .in('card_id', cardIds),
    supabase
      .from('checklists')
      .select('id, card_id')
      .in('card_id', cardIds),
    supabase
      .from('checklist_items')
      .select('checklist_id, is_completed')
      .in('checklist_id', []),  // placeholder, filled below
    supabase
      .from('attachments')
      .select('card_id')
      .in('card_id', cardIds),
  ]);

  const cards = cardsRes.data || [];
  const placements = placementsRes.data || [];
  const cardLabels = labelsRes.data || [];
  const comments = commentsRes.data || [];
  const checklists = checklistsRes.data || [];
  const attachments = attachmentsRes.data || [];

  // Fetch checklist items if we have checklists
  let checklistItems: any[] = [];
  if (checklists.length > 0) {
    const checklistIds = checklists.map((c) => c.id);
    const { data } = await supabase
      .from('checklist_items')
      .select('checklist_id, is_completed')
      .in('checklist_id', checklistIds);
    checklistItems = data || [];
  }

  // 4. Build lookup Maps
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

  // Comment count per card
  const commentCountMap = new Map<string, number>();
  for (const c of comments) {
    commentCountMap.set(c.card_id, (commentCountMap.get(c.card_id) || 0) + 1);
  }

  // Attachment count per card
  const attachmentCountMap = new Map<string, number>();
  for (const a of attachments) {
    attachmentCountMap.set(a.card_id, (attachmentCountMap.get(a.card_id) || 0) + 1);
  }

  // Checklist items per card (via checklist -> card mapping)
  const checklistCardMap = new Map<string, string>(); // checklist_id -> card_id
  for (const cl of checklists) {
    checklistCardMap.set(cl.id, cl.card_id);
  }

  const checklistTotalMap = new Map<string, number>();
  const checklistDoneMap = new Map<string, number>();
  for (const item of checklistItems) {
    const cardId = checklistCardMap.get(item.checklist_id);
    if (!cardId) continue;
    checklistTotalMap.set(cardId, (checklistTotalMap.get(cardId) || 0) + 1);
    if (item.is_completed) {
      checklistDoneMap.set(cardId, (checklistDoneMap.get(cardId) || 0) + 1);
    }
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
      commentCount: commentCountMap.get(card.id) || 0,
      checklistTotal: checklistTotalMap.get(card.id) || 0,
      checklistDone: checklistDoneMap.get(card.id) || 0,
      attachmentCount: attachmentCountMap.get(card.id) || 0,
      updatedAt: card.updated_at || null,
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

export function groupByUrgency(tasks: MyTask[]): { label: string; accent: string; tasks: MyTask[] }[] {
  const now = new Date();
  const endOfWeek = new Date(now);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const overdue: MyTask[] = [];
  const dueSoon: MyTask[] = [];
  const thisWeek: MyTask[] = [];
  const later: MyTask[] = [];
  const noDate: MyTask[] = [];

  for (const task of tasks) {
    if (task.isOverdue) {
      overdue.push(task);
    } else if (task.isDueSoon) {
      dueSoon.push(task);
    } else if (task.dueDate) {
      const due = new Date(task.dueDate);
      if (due <= endOfWeek) {
        thisWeek.push(task);
      } else {
        later.push(task);
      }
    } else {
      noDate.push(task);
    }
  }

  // Sort each group by due date
  const byDue = (a: MyTask, b: MyTask) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  };

  overdue.sort(byDue);
  dueSoon.sort(byDue);
  thisWeek.sort(byDue);
  later.sort(byDue);

  return [
    { label: 'Overdue', accent: 'text-danger', tasks: overdue },
    { label: 'Due Today / Tomorrow', accent: 'text-warning', tasks: dueSoon },
    { label: 'This Week', accent: 'text-electric', tasks: thisWeek },
    { label: 'Later', accent: 'text-navy/60 dark:text-white/60', tasks: later },
    { label: 'No Due Date', accent: 'text-navy/40 dark:text-white/40', tasks: noDate },
  ];
}

export function sortByDueDate(tasks: MyTask[]): MyTask[] {
  return [...tasks].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });
}
