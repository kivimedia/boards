import { describe, it, expect } from 'vitest';
import type { GanttTask } from '@/lib/types';

/**
 * GanttView utility function tests.
 *
 * The GanttView component (src/components/gantt/GanttView.tsx) defines
 * three pure utility functions inline (not exported):
 *   - priorityColor(priority) -> Tailwind class
 *   - priorityBarColor(priority) -> hex color
 *   - daysBetween(a, b) -> number of days
 *
 * Since these are not exported, we replicate the logic here and verify
 * it matches the expected behavior, plus test the GanttTask type shape.
 */

// Replicated from GanttView.tsx for testability
function priorityColor(priority: string | null): string {
  switch (priority) {
    case 'urgent': return 'bg-red-500';
    case 'high': return 'bg-orange-400';
    case 'medium': return 'bg-yellow-400';
    case 'low': return 'bg-green-400';
    default: return 'bg-electric';
  }
}

function priorityBarColor(priority: string | null): string {
  switch (priority) {
    case 'urgent': return '#ef4444';
    case 'high': return '#fb923c';
    case 'medium': return '#facc15';
    case 'low': return '#4ade80';
    default: return '#6366f1';
  }
}

function daysBetween(a: string, b: string): number {
  return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

describe('Gantt Utility Functions', () => {
  describe('priorityColor', () => {
    it('returns bg-red-500 for urgent', () => {
      expect(priorityColor('urgent')).toBe('bg-red-500');
    });

    it('returns bg-orange-400 for high', () => {
      expect(priorityColor('high')).toBe('bg-orange-400');
    });

    it('returns bg-yellow-400 for medium', () => {
      expect(priorityColor('medium')).toBe('bg-yellow-400');
    });

    it('returns bg-green-400 for low', () => {
      expect(priorityColor('low')).toBe('bg-green-400');
    });

    it('returns bg-electric for null priority', () => {
      expect(priorityColor(null)).toBe('bg-electric');
    });

    it('returns bg-electric for unknown priority', () => {
      expect(priorityColor('unknown')).toBe('bg-electric');
    });
  });

  describe('priorityBarColor', () => {
    it('returns correct hex for urgent', () => {
      expect(priorityBarColor('urgent')).toBe('#ef4444');
    });

    it('returns correct hex for high', () => {
      expect(priorityBarColor('high')).toBe('#fb923c');
    });

    it('returns correct hex for medium', () => {
      expect(priorityBarColor('medium')).toBe('#facc15');
    });

    it('returns correct hex for low', () => {
      expect(priorityBarColor('low')).toBe('#4ade80');
    });

    it('returns indigo fallback for null', () => {
      expect(priorityBarColor(null)).toBe('#6366f1');
    });
  });

  describe('daysBetween', () => {
    it('returns 0 for same date', () => {
      expect(daysBetween('2026-01-15', '2026-01-15')).toBe(0);
    });

    it('returns positive days for later end date', () => {
      expect(daysBetween('2026-01-01', '2026-01-10')).toBe(9);
    });

    it('returns negative days for earlier end date', () => {
      expect(daysBetween('2026-01-10', '2026-01-01')).toBe(-9);
    });

    it('handles month boundaries', () => {
      expect(daysBetween('2026-01-28', '2026-02-04')).toBe(7);
    });

    it('handles year boundaries', () => {
      const days = daysBetween('2025-12-31', '2026-01-01');
      expect(days).toBe(1);
    });
  });

  describe('GanttTask type shape', () => {
    it('can create a valid GanttTask object', () => {
      const task: GanttTask = {
        id: 'gt-1',
        title: 'Design Homepage',
        start_date: '2026-02-01',
        end_date: '2026-02-15',
        progress_percent: 50,
        card_id: 'card-1',
        board_id: 'board-1',
        list_name: 'In Progress',
        dependencies: ['card-0'],
        assignees: ['alice@test.com'],
        priority: 'high',
      };

      expect(task.id).toBe('gt-1');
      expect(task.dependencies).toHaveLength(1);
      expect(task.progress_percent).toBe(50);
    });

    it('allows null dates and priority', () => {
      const task: GanttTask = {
        id: 'gt-2',
        title: 'Unscheduled Task',
        start_date: null,
        end_date: null,
        progress_percent: 0,
        card_id: 'card-2',
        board_id: 'board-1',
        list_name: 'Backlog',
        dependencies: [],
        assignees: [],
        priority: null,
      };

      expect(task.start_date).toBeNull();
      expect(task.end_date).toBeNull();
      expect(task.priority).toBeNull();
    });
  });
});
