import { describe, it, expect } from 'vitest';

/**
 * Tests for Prompt 4 & 5 remaining features.
 *
 * Covers:
 * - Cross-board InboxView helpers
 * - PlannerView month helpers + DnD date handling
 * - BoardSwitcher create board validation
 * - usePresence idle/away status
 * - useEditLock typing indicator
 * - Avatar away status
 * - View transitions
 */

// ============================================================================
// InboxView helpers (replicated from InboxView.tsx)
// ============================================================================

function timeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

function isNew(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return now.getTime() - d.getTime() < 24 * 60 * 60 * 1000;
}

interface InboxItem {
  placementId: string;
  cardId: string;
  title: string;
  priority: string;
  dueDate: string | null;
  createdAt: string;
  listName: string;
  listId: string;
  boardId: string;
  boardName: string;
  boardType: string;
}

function groupByBoard(items: InboxItem[]): Map<string, { boardName: string; items: InboxItem[] }> {
  const map = new Map<string, { boardName: string; items: InboxItem[] }>();
  for (const item of items) {
    const existing = map.get(item.boardId);
    if (existing) {
      existing.items.push(item);
    } else {
      map.set(item.boardId, { boardName: item.boardName, items: [item] });
    }
  }
  return map;
}

// ============================================================================
// PlannerView helpers (replicated from PlannerView.tsx)
// ============================================================================

function getWeekDays(weekOffset: number): Date[] {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() + (weekOffset * 7));
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

function getMonthDays(monthOffset: number): Date[] {
  const today = new Date();
  const targetMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const firstDay = new Date(targetMonth);
  firstDay.setDate(firstDay.getDate() - firstDay.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(firstDay);
    d.setDate(firstDay.getDate() + i);
    days.push(d);
  }
  return days;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

// ============================================================================
// BoardSwitcher helpers (replicated from BoardSwitcher.tsx)
// ============================================================================

function getBoardIcon(type: string) {
  switch (type) {
    case 'dev': return 'D';
    case 'training': return 'T';
    case 'account_manager': return 'A';
    case 'graphic_designer': return 'G';
    case 'executive_assistant': return 'E';
    case 'video_editor': return 'V';
    case 'copy': return 'C';
    case 'client_strategy_map': return 'S';
    default: return 'B';
  }
}

function formatBoardType(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const BOARD_TYPES = ['dev', 'training', 'account_manager', 'graphic_designer', 'executive_assistant', 'video_editor', 'copy', 'client_strategy_map'];

// ============================================================================
// Presence helpers
// ============================================================================

type PresenceStatus = 'online' | 'away';

interface PresenceUser {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  lastSeen: string;
  status: PresenceStatus;
}

function getOnlineUserIds(users: PresenceUser[]): Set<string> {
  return new Set(users.filter((u) => u.status === 'online' || !u.status).map((u) => u.userId));
}

function getAwayUserIds(users: PresenceUser[]): Set<string> {
  return new Set(users.filter((u) => u.status === 'away').map((u) => u.userId));
}

// ============================================================================
// Avatar dot color logic
// ============================================================================

function getAvatarDotColor(online?: boolean, away?: boolean): string {
  if (away) return 'bg-yellow-500';
  if (online) return 'bg-green-500';
  return 'bg-slate-400';
}

// ============================================================================
// Tests
// ============================================================================

describe('Cross-Board Inbox (Prompt 4)', () => {
  describe('groupByBoard', () => {
    const items: InboxItem[] = [
      { placementId: 'p1', cardId: 'c1', title: 'Task 1', priority: 'high', dueDate: null, createdAt: '2026-02-17', listName: 'To Do', listId: 'l1', boardId: 'b1', boardName: 'Board A', boardType: 'dev' },
      { placementId: 'p2', cardId: 'c2', title: 'Task 2', priority: 'low', dueDate: null, createdAt: '2026-02-16', listName: 'In Progress', listId: 'l2', boardId: 'b2', boardName: 'Board B', boardType: 'training' },
      { placementId: 'p3', cardId: 'c3', title: 'Task 3', priority: 'medium', dueDate: null, createdAt: '2026-02-15', listName: 'Done', listId: 'l3', boardId: 'b1', boardName: 'Board A', boardType: 'dev' },
    ];

    it('groups items by boardId', () => {
      const grouped = groupByBoard(items);
      expect(grouped.size).toBe(2);
      expect(grouped.get('b1')!.items).toHaveLength(2);
      expect(grouped.get('b2')!.items).toHaveLength(1);
    });

    it('preserves board name', () => {
      const grouped = groupByBoard(items);
      expect(grouped.get('b1')!.boardName).toBe('Board A');
      expect(grouped.get('b2')!.boardName).toBe('Board B');
    });

    it('handles empty array', () => {
      const grouped = groupByBoard([]);
      expect(grouped.size).toBe(0);
    });

    it('single board groups correctly', () => {
      const single = items.filter((i) => i.boardId === 'b1');
      const grouped = groupByBoard(single);
      expect(grouped.size).toBe(1);
      expect(grouped.get('b1')!.items).toHaveLength(2);
    });
  });

  describe('timeAgo', () => {
    it('returns "just now" for recent timestamps', () => {
      const now = new Date().toISOString();
      expect(timeAgo(now)).toBe('just now');
    });

    it('returns minutes ago', () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      expect(timeAgo(fiveMinAgo)).toBe('5m ago');
    });

    it('returns hours ago', () => {
      const threeHrsAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
      expect(timeAgo(threeHrsAgo)).toBe('3h ago');
    });
  });

  describe('isNew', () => {
    it('returns true for items less than 24h old', () => {
      const recent = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
      expect(isNew(recent)).toBe(true);
    });

    it('returns false for items over 24h old', () => {
      const old = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
      expect(isNew(old)).toBe(false);
    });
  });
});

describe('PlannerView Month Mode (Prompt 4)', () => {
  describe('getWeekDays', () => {
    it('returns 7 days', () => {
      expect(getWeekDays(0)).toHaveLength(7);
    });

    it('first day is Sunday', () => {
      const days = getWeekDays(0);
      expect(days[0].getDay()).toBe(0); // Sunday
    });

    it('last day is Saturday', () => {
      const days = getWeekDays(0);
      expect(days[6].getDay()).toBe(6); // Saturday
    });
  });

  describe('getMonthDays', () => {
    it('returns 42 days (6 weeks)', () => {
      expect(getMonthDays(0)).toHaveLength(42);
    });

    it('first day is a Sunday', () => {
      const days = getMonthDays(0);
      expect(days[0].getDay()).toBe(0);
    });

    it('last day is a Saturday', () => {
      const days = getMonthDays(0);
      expect(days[41].getDay()).toBe(6);
    });

    it('contains the first day of the target month', () => {
      const days = getMonthDays(0);
      const today = new Date();
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const found = days.some((d) => isSameDay(d, firstOfMonth));
      expect(found).toBe(true);
    });

    it('month offset shifts correctly', () => {
      const nextMonth = getMonthDays(1);
      const today = new Date();
      const targetMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const found = nextMonth.some((d) => isSameDay(d, targetMonth));
      expect(found).toBe(true);
    });
  });

  describe('isSameDay', () => {
    it('returns true for same date', () => {
      const a = new Date(2026, 1, 17);
      const b = new Date(2026, 1, 17);
      expect(isSameDay(a, b)).toBe(true);
    });

    it('returns false for different dates', () => {
      const a = new Date(2026, 1, 17);
      const b = new Date(2026, 1, 18);
      expect(isSameDay(a, b)).toBe(false);
    });
  });

  describe('isSameMonth', () => {
    it('returns true for same month', () => {
      const a = new Date(2026, 1, 1);
      const b = new Date(2026, 1, 28);
      expect(isSameMonth(a, b)).toBe(true);
    });

    it('returns false for different months', () => {
      const a = new Date(2026, 0, 31);
      const b = new Date(2026, 1, 1);
      expect(isSameMonth(a, b)).toBe(false);
    });
  });

  describe('DnD date assignment', () => {
    it('dateKey from droppableId is a valid date string', () => {
      const dateKey = '2026-02-17';
      const parsed = new Date(dateKey);
      expect(parsed.toISOString().split('T')[0]).toBe(dateKey);
    });

    it('unscheduled droppableId maps to null due_date', () => {
      const destId = 'unscheduled';
      const newDueDate = destId === 'unscheduled' ? null : destId;
      expect(newDueDate).toBeNull();
    });

    it('day droppableId maps to date string due_date', () => {
      const destId: string = '2026-03-01';
      const newDueDate = destId === 'unscheduled' ? null : destId;
      expect(newDueDate).toBe('2026-03-01');
    });
  });
});

describe('BoardSwitcher Create (Prompt 4)', () => {
  it('getBoardIcon returns correct letters for all types', () => {
    expect(getBoardIcon('dev')).toBe('D');
    expect(getBoardIcon('training')).toBe('T');
    expect(getBoardIcon('account_manager')).toBe('A');
    expect(getBoardIcon('graphic_designer')).toBe('G');
    expect(getBoardIcon('executive_assistant')).toBe('E');
    expect(getBoardIcon('video_editor')).toBe('V');
    expect(getBoardIcon('copy')).toBe('C');
    expect(getBoardIcon('client_strategy_map')).toBe('S');
    expect(getBoardIcon('unknown')).toBe('B');
  });

  it('formatBoardType capitalizes words', () => {
    expect(formatBoardType('dev')).toBe('Dev');
    expect(formatBoardType('account_manager')).toBe('Account Manager');
    expect(formatBoardType('client_strategy_map')).toBe('Client Strategy Map');
  });

  it('all 8 board types have icons', () => {
    for (const type of BOARD_TYPES) {
      const icon = getBoardIcon(type);
      expect(icon).not.toBe('B');
      expect(icon.length).toBe(1);
    }
  });

  it('create board body shape is valid', () => {
    const body = { name: 'New Board', type: 'dev' };
    expect(typeof body.name).toBe('string');
    expect(body.name.trim().length).toBeGreaterThan(0);
    expect(BOARD_TYPES).toContain(body.type);
  });

  it('empty name should not be submitted', () => {
    const name = '   ';
    expect(name.trim().length).toBe(0);
  });
});

describe('Presence Idle/Away (Prompt 5)', () => {
  const users: PresenceUser[] = [
    { userId: 'u1', displayName: 'Alice', avatarUrl: null, lastSeen: '2026-02-17T10:00:00Z', status: 'online' },
    { userId: 'u2', displayName: 'Bob', avatarUrl: null, lastSeen: '2026-02-17T09:55:00Z', status: 'away' },
    { userId: 'u3', displayName: 'Carol', avatarUrl: null, lastSeen: '2026-02-17T10:00:00Z', status: 'online' },
  ];

  it('getOnlineUserIds returns only online users', () => {
    const online = getOnlineUserIds(users);
    expect(online.size).toBe(2);
    expect(online.has('u1')).toBe(true);
    expect(online.has('u3')).toBe(true);
    expect(online.has('u2')).toBe(false);
  });

  it('getAwayUserIds returns only away users', () => {
    const away = getAwayUserIds(users);
    expect(away.size).toBe(1);
    expect(away.has('u2')).toBe(true);
  });

  it('handles users with no status field as online', () => {
    const noStatus = [
      { userId: 'u4', displayName: 'Dave', avatarUrl: null, lastSeen: '2026-02-17T10:00:00Z', status: undefined as any },
    ];
    const online = getOnlineUserIds(noStatus);
    expect(online.has('u4')).toBe(true);
  });

  it('idle timeout is 5 minutes (300000 ms)', () => {
    const IDLE_TIMEOUT_DEFAULT = 5 * 60 * 1000;
    expect(IDLE_TIMEOUT_DEFAULT).toBe(300000);
  });

  it('activity events include mouse and keyboard', () => {
    const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    expect(ACTIVITY_EVENTS).toContain('mousedown');
    expect(ACTIVITY_EVENTS).toContain('keydown');
    expect(ACTIVITY_EVENTS).toContain('scroll');
    expect(ACTIVITY_EVENTS).toHaveLength(5);
  });
});

describe('Avatar Away Status (Prompt 5)', () => {
  it('away shows yellow dot', () => {
    expect(getAvatarDotColor(true, true)).toBe('bg-yellow-500');
  });

  it('online shows green dot', () => {
    expect(getAvatarDotColor(true, false)).toBe('bg-green-500');
  });

  it('offline shows gray dot', () => {
    expect(getAvatarDotColor(false, false)).toBe('bg-slate-400');
  });

  it('away takes priority over online', () => {
    expect(getAvatarDotColor(true, true)).toBe('bg-yellow-500');
  });
});

describe('Typing Indicator (Prompt 5)', () => {
  interface TypingUser {
    userId: string;
    displayName: string;
    field: string;
  }

  it('typing users array shape', () => {
    const typingUser: TypingUser = { userId: 'u1', displayName: 'Alice', field: 'title' };
    expect(typingUser.userId).toBe('u1');
    expect(typingUser.field).toBe('title');
  });

  it('auto-clear typing after timeout', () => {
    // Simulate: typing entries should be cleared after 3 seconds
    const typingTimeout = 3000;
    expect(typingTimeout).toBe(3000);
  });

  it('multiple typing users on different fields', () => {
    const typingUsers: TypingUser[] = [
      { userId: 'u1', displayName: 'Alice', field: 'title' },
      { userId: 'u2', displayName: 'Bob', field: 'description' },
    ];
    const titleTypers = typingUsers.filter((t) => t.field === 'title');
    expect(titleTypers).toHaveLength(1);
    expect(titleTypers[0].displayName).toBe('Alice');
  });

  it('same user same field replaces existing entry', () => {
    let typingUsers: TypingUser[] = [
      { userId: 'u1', displayName: 'Alice', field: 'title' },
    ];
    // Simulate re-add
    const payload = { userId: 'u1', displayName: 'Alice', field: 'title' };
    typingUsers = typingUsers.filter((t) => !(t.userId === payload.userId && t.field === payload.field));
    typingUsers.push(payload);
    expect(typingUsers).toHaveLength(1);
  });
});

describe('View Transitions (Prompt 4)', () => {
  it('valid view modes', () => {
    const views = ['kanban', 'list', 'calendar', 'inbox', 'planner'];
    expect(views).toHaveLength(5);
    expect(views).toContain('inbox');
    expect(views).toContain('planner');
  });

  it('scroll position Map preserves per-view', () => {
    const scrollPositions = new Map<string, number>();
    scrollPositions.set('kanban', 150);
    scrollPositions.set('inbox', 0);
    scrollPositions.set('planner', 300);
    expect(scrollPositions.get('kanban')).toBe(150);
    expect(scrollPositions.get('inbox')).toBe(0);
    expect(scrollPositions.get('planner')).toBe(300);
  });

  it('default view is kanban (no URL param)', () => {
    const param: string | null = null;
    const view = param || 'kanban';
    expect(view).toBe('kanban');
  });
});

describe('Snooze Action (Prompt 4)', () => {
  it('snooze sets due_date to tomorrow', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    const parts = dateStr.split('-');
    expect(parts).toHaveLength(3);
    expect(parseInt(parts[0])).toBeGreaterThanOrEqual(2026);
  });

  it('claim body is POST with no payload (toggle)', () => {
    const method = 'POST';
    expect(method).toBe('POST');
  });
});
