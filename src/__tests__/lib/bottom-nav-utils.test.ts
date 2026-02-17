import { describe, it, expect } from 'vitest';

/**
 * Bottom Navigation utility function tests (P8.5).
 *
 * These components define pure utility functions inline (not exported):
 *   - InboxView.tsx: getPriorityColor, timeAgo
 *   - PlannerView.tsx: getPriorityColorBorder, getWeekDays, isSameDay
 *   - BoardSwitcher.tsx: getBoardIcon, formatBoardType
 *
 * Since these are not exported, we replicate the logic here and verify
 * it matches the expected behavior (gantt-utils.test.ts pattern).
 */

// ========================================
// Replicated from InboxView.tsx
// ========================================
function getPriorityColor(priority: string) {
  switch (priority) {
    case 'urgent': return 'bg-red-500';
    case 'high': return 'bg-orange-500';
    case 'medium': return 'bg-yellow-500';
    case 'low': return 'bg-blue-400';
    default: return 'bg-slate-300 dark:bg-slate-600';
  }
}

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

// ========================================
// Replicated from InboxView.tsx (new filter helpers)
// ========================================
function isNew(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return now.getTime() - d.getTime() < 24 * 60 * 60 * 1000;
}

function isOverdue(dueDate: string): boolean {
  const d = new Date(dueDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return d < now;
}

function isDueToday(dueDate: string): boolean {
  const d = new Date(dueDate);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isDueThisWeek(dueDate: string): boolean {
  const d = new Date(dueDate);
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + (7 - now.getDay()));
  weekEnd.setHours(23, 59, 59, 999);
  return d >= now && d <= weekEnd;
}

// ========================================
// Replicated from PlannerView.tsx
// ========================================
function getPriorityColorBorder(priority: string) {
  switch (priority) {
    case 'urgent': return 'border-l-red-500 bg-red-50/50 dark:bg-red-900/10';
    case 'high': return 'border-l-orange-500 bg-orange-50/50 dark:bg-orange-900/10';
    case 'medium': return 'border-l-yellow-500 bg-yellow-50/50 dark:bg-yellow-900/10';
    case 'low': return 'border-l-blue-400 bg-blue-50/50 dark:bg-blue-900/10';
    default: return 'border-l-slate-300 dark:border-l-slate-600';
  }
}

function getPriorityDot(priority: string) {
  switch (priority) {
    case 'urgent': return 'bg-red-500';
    case 'high': return 'bg-orange-500';
    case 'medium': return 'bg-yellow-500';
    case 'low': return 'bg-blue-400';
    default: return 'bg-slate-300 dark:bg-slate-600';
  }
}

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

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// ========================================
// Replicated from BoardSwitcher.tsx
// ========================================
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

// ========================================
// Tests
// ========================================

describe('Bottom Nav Utilities (P8.5)', () => {
  // ---- InboxView: getPriorityColor ----
  describe('InboxView - getPriorityColor', () => {
    it('urgent -> bg-red-500', () => {
      expect(getPriorityColor('urgent')).toBe('bg-red-500');
    });

    it('high -> bg-orange-500', () => {
      expect(getPriorityColor('high')).toBe('bg-orange-500');
    });

    it('medium -> bg-yellow-500', () => {
      expect(getPriorityColor('medium')).toBe('bg-yellow-500');
    });

    it('low -> bg-blue-400', () => {
      expect(getPriorityColor('low')).toBe('bg-blue-400');
    });

    it('none/unknown -> slate default', () => {
      expect(getPriorityColor('none')).toBe('bg-slate-300 dark:bg-slate-600');
      expect(getPriorityColor('unknown')).toBe('bg-slate-300 dark:bg-slate-600');
      expect(getPriorityColor('')).toBe('bg-slate-300 dark:bg-slate-600');
    });
  });

  // ---- InboxView: timeAgo ----
  describe('InboxView - timeAgo', () => {
    it('returns "just now" for date within last minute', () => {
      const thirtySecsAgo = new Date(Date.now() - 30 * 1000).toISOString();
      expect(timeAgo(thirtySecsAgo)).toBe('just now');
    });

    it('returns minutes for 1-59 minute difference', () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      expect(timeAgo(fiveMinAgo)).toBe('5m ago');
    });

    it('returns hours for 1-23 hour difference', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      expect(timeAgo(threeHoursAgo)).toBe('3h ago');
    });

    it('returns days for 1-6 day difference', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      expect(timeAgo(twoDaysAgo)).toBe('2d ago');
    });

    it('returns locale date string for 7+ day difference', () => {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const result = timeAgo(twoWeeksAgo.toISOString());
      // Should be a locale date, not "Xd ago"
      expect(result).not.toContain('d ago');
      expect(result).not.toContain('just now');
    });

    it('handles ISO date strings', () => {
      const now = new Date().toISOString();
      expect(timeAgo(now)).toBe('just now');
    });
  });

  // ---- InboxView: isNew ----
  describe('InboxView - isNew', () => {
    it('returns true for item created 1 hour ago', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      expect(isNew(oneHourAgo)).toBe(true);
    });

    it('returns true for item created 23 hours ago', () => {
      const almostDay = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
      expect(isNew(almostDay)).toBe(true);
    });

    it('returns false for item created 25 hours ago', () => {
      const overDay = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      expect(isNew(overDay)).toBe(false);
    });

    it('returns true for item created just now', () => {
      expect(isNew(new Date().toISOString())).toBe(true);
    });
  });

  // ---- InboxView: isOverdue ----
  describe('InboxView - isOverdue', () => {
    it('returns true for yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(isOverdue(yesterday.toISOString())).toBe(true);
    });

    it('returns false for tomorrow', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(isOverdue(tomorrow.toISOString())).toBe(false);
    });
  });

  // ---- InboxView: isDueToday ----
  describe('InboxView - isDueToday', () => {
    it('returns true for today', () => {
      expect(isDueToday(new Date().toISOString())).toBe(true);
    });

    it('returns false for tomorrow', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(isDueToday(tomorrow.toISOString())).toBe(false);
    });
  });

  // ---- InboxView: isDueThisWeek ----
  describe('InboxView - isDueThisWeek', () => {
    it('returns true for a date within this week', () => {
      const now = new Date();
      const daysLeft = 6 - now.getDay(); // days until Saturday
      if (daysLeft > 0) {
        const withinWeek = new Date(now);
        withinWeek.setDate(now.getDate() + 1);
        expect(isDueThisWeek(withinWeek.toISOString())).toBe(true);
      }
    });

    it('returns false for a date 2 weeks from now', () => {
      const twoWeeks = new Date();
      twoWeeks.setDate(twoWeeks.getDate() + 14);
      expect(isDueThisWeek(twoWeeks.toISOString())).toBe(false);
    });
  });

  // ---- PlannerView: getPriorityColorBorder (now with bg colors) ----
  describe('PlannerView - getPriorityColorBorder', () => {
    it('urgent -> includes border-l-red-500 and bg tint', () => {
      const result = getPriorityColorBorder('urgent');
      expect(result).toContain('border-l-red-500');
      expect(result).toContain('bg-red-50/50');
    });

    it('high -> includes border-l-orange-500 and bg tint', () => {
      const result = getPriorityColorBorder('high');
      expect(result).toContain('border-l-orange-500');
      expect(result).toContain('bg-orange-50/50');
    });

    it('medium -> includes border-l-yellow-500 and bg tint', () => {
      const result = getPriorityColorBorder('medium');
      expect(result).toContain('border-l-yellow-500');
      expect(result).toContain('bg-yellow-50/50');
    });

    it('low -> includes border-l-blue-400 and bg tint', () => {
      const result = getPriorityColorBorder('low');
      expect(result).toContain('border-l-blue-400');
      expect(result).toContain('bg-blue-50/50');
    });

    it('default -> border-l-slate (no bg tint)', () => {
      expect(getPriorityColorBorder('none')).toBe('border-l-slate-300 dark:border-l-slate-600');
    });
  });

  // ---- PlannerView: getPriorityDot ----
  describe('PlannerView - getPriorityDot', () => {
    it('urgent -> bg-red-500', () => {
      expect(getPriorityDot('urgent')).toBe('bg-red-500');
    });

    it('high -> bg-orange-500', () => {
      expect(getPriorityDot('high')).toBe('bg-orange-500');
    });

    it('medium -> bg-yellow-500', () => {
      expect(getPriorityDot('medium')).toBe('bg-yellow-500');
    });

    it('low -> bg-blue-400', () => {
      expect(getPriorityDot('low')).toBe('bg-blue-400');
    });

    it('default -> slate', () => {
      expect(getPriorityDot('none')).toBe('bg-slate-300 dark:bg-slate-600');
    });
  });

  // ---- PlannerView: getWeekDays ----
  describe('PlannerView - getWeekDays', () => {
    it('returns 7 Date objects', () => {
      const days = getWeekDays(0);
      expect(days).toHaveLength(7);
      days.forEach((d) => expect(d).toBeInstanceOf(Date));
    });

    it('first day is Sunday (day 0)', () => {
      const days = getWeekDays(0);
      expect(days[0].getDay()).toBe(0);
    });

    it('last day is Saturday (day 6)', () => {
      const days = getWeekDays(0);
      expect(days[6].getDay()).toBe(6);
    });

    it('dates are consecutive (1 day apart)', () => {
      const days = getWeekDays(0);
      for (let i = 1; i < 7; i++) {
        const diff = days[i].getTime() - days[i - 1].getTime();
        // Allow for DST: between 23 and 25 hours
        expect(diff).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
        expect(diff).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
      }
    });

    it('weekOffset +1 returns dates 7 days later', () => {
      const thisWeek = getWeekDays(0);
      const nextWeek = getWeekDays(1);
      const diffMs = nextWeek[0].getTime() - thisWeek[0].getTime();
      const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
      expect(diffDays).toBe(7);
    });

    it('weekOffset -1 returns dates 7 days earlier', () => {
      const thisWeek = getWeekDays(0);
      const lastWeek = getWeekDays(-1);
      const diffMs = thisWeek[0].getTime() - lastWeek[0].getTime();
      const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
      expect(diffDays).toBe(7);
    });

    it('all days in the same week have consistent weekdays', () => {
      const days = getWeekDays(0);
      const expectedDays = [0, 1, 2, 3, 4, 5, 6]; // Sun-Sat
      days.forEach((d, i) => expect(d.getDay()).toBe(expectedDays[i]));
    });
  });

  // ---- PlannerView: isSameDay ----
  describe('PlannerView - isSameDay', () => {
    it('returns true for same date', () => {
      const a = new Date(2025, 5, 15, 10, 30);
      const b = new Date(2025, 5, 15, 23, 59);
      expect(isSameDay(a, b)).toBe(true);
    });

    it('returns false for different days', () => {
      const a = new Date(2025, 5, 15);
      const b = new Date(2025, 5, 16);
      expect(isSameDay(a, b)).toBe(false);
    });

    it('returns false for different months same day number', () => {
      const a = new Date(2025, 5, 15);
      const b = new Date(2025, 6, 15);
      expect(isSameDay(a, b)).toBe(false);
    });

    it('returns false for different years same month and day', () => {
      const a = new Date(2025, 5, 15);
      const b = new Date(2026, 5, 15);
      expect(isSameDay(a, b)).toBe(false);
    });
  });

  // ---- BoardSwitcher: getBoardIcon ----
  describe('BoardSwitcher - getBoardIcon', () => {
    const cases: [string, string][] = [
      ['dev', 'D'],
      ['training', 'T'],
      ['account_manager', 'A'],
      ['graphic_designer', 'G'],
      ['executive_assistant', 'E'],
      ['video_editor', 'V'],
      ['copy', 'C'],
      ['client_strategy_map', 'S'],
    ];

    for (const [type, expected] of cases) {
      it(`"${type}" -> "${expected}"`, () => {
        expect(getBoardIcon(type)).toBe(expected);
      });
    }

    it('unknown type -> "B" (default)', () => {
      expect(getBoardIcon('unknown')).toBe('B');
      expect(getBoardIcon('')).toBe('B');
    });
  });

  // ---- BoardSwitcher: formatBoardType ----
  describe('BoardSwitcher - formatBoardType', () => {
    it('"dev" -> "Dev"', () => {
      expect(formatBoardType('dev')).toBe('Dev');
    });

    it('"account_manager" -> "Account Manager"', () => {
      expect(formatBoardType('account_manager')).toBe('Account Manager');
    });

    it('"graphic_designer" -> "Graphic Designer"', () => {
      expect(formatBoardType('graphic_designer')).toBe('Graphic Designer');
    });

    it('"client_strategy_map" -> "Client Strategy Map"', () => {
      expect(formatBoardType('client_strategy_map')).toBe('Client Strategy Map');
    });

    it('"video_editor" -> "Video Editor"', () => {
      expect(formatBoardType('video_editor')).toBe('Video Editor');
    });

    it('"executive_assistant" -> "Executive Assistant"', () => {
      expect(formatBoardType('executive_assistant')).toBe('Executive Assistant');
    });
  });
});
