import { describe, it, expect } from 'vitest';
import { fetchMyTasks, groupByBoard, groupByPriority, sortByDueDate } from '@/lib/my-tasks';
import type { MyTask } from '@/lib/my-tasks';

describe('My Tasks (v5.6.0)', () => {
  describe('exports', () => {
    it('fetchMyTasks is a function', () => {
      expect(typeof fetchMyTasks).toBe('function');
    });

    it('groupByBoard is a function', () => {
      expect(typeof groupByBoard).toBe('function');
    });

    it('groupByPriority is a function', () => {
      expect(typeof groupByPriority).toBe('function');
    });

    it('sortByDueDate is a function', () => {
      expect(typeof sortByDueDate).toBe('function');
    });
  });

  describe('groupByBoard', () => {
    it('groups tasks by board name', () => {
      const tasks: MyTask[] = [
        { cardId: '1', title: 'T1', description: null, priority: 'high', dueDate: null, boardId: 'b1', boardName: 'Design', listName: 'Todo', labels: [], isOverdue: false, isDueSoon: false },
        { cardId: '2', title: 'T2', description: null, priority: 'low', dueDate: null, boardId: 'b2', boardName: 'Dev', listName: 'Todo', labels: [], isOverdue: false, isDueSoon: false },
        { cardId: '3', title: 'T3', description: null, priority: 'medium', dueDate: null, boardId: 'b1', boardName: 'Design', listName: 'Done', labels: [], isOverdue: false, isDueSoon: false },
      ];
      const grouped = groupByBoard(tasks);
      expect(Object.keys(grouped)).toHaveLength(2);
      expect(grouped['Design']).toHaveLength(2);
      expect(grouped['Dev']).toHaveLength(1);
    });

    it('returns empty object for empty array', () => {
      expect(groupByBoard([])).toEqual({});
    });
  });

  describe('groupByPriority', () => {
    it('groups tasks by priority', () => {
      const tasks: MyTask[] = [
        { cardId: '1', title: 'T1', description: null, priority: 'urgent', dueDate: null, boardId: 'b1', boardName: 'B', listName: 'L', labels: [], isOverdue: false, isDueSoon: false },
        { cardId: '2', title: 'T2', description: null, priority: 'urgent', dueDate: null, boardId: 'b1', boardName: 'B', listName: 'L', labels: [], isOverdue: false, isDueSoon: false },
        { cardId: '3', title: 'T3', description: null, priority: 'low', dueDate: null, boardId: 'b1', boardName: 'B', listName: 'L', labels: [], isOverdue: false, isDueSoon: false },
      ];
      const grouped = groupByPriority(tasks);
      expect(grouped['urgent']).toHaveLength(2);
      expect(grouped['low']).toHaveLength(1);
      expect(grouped['high']).toHaveLength(0);
    });

    it('initializes all priority levels', () => {
      const grouped = groupByPriority([]);
      expect(grouped).toHaveProperty('urgent');
      expect(grouped).toHaveProperty('high');
      expect(grouped).toHaveProperty('medium');
      expect(grouped).toHaveProperty('low');
      expect(grouped).toHaveProperty('none');
    });
  });

  describe('sortByDueDate', () => {
    it('sorts tasks by due date ascending', () => {
      const tasks: MyTask[] = [
        { cardId: '1', title: 'T1', description: null, priority: 'high', dueDate: '2026-03-01', boardId: 'b1', boardName: 'B', listName: 'L', labels: [], isOverdue: false, isDueSoon: false },
        { cardId: '2', title: 'T2', description: null, priority: 'high', dueDate: '2026-01-01', boardId: 'b1', boardName: 'B', listName: 'L', labels: [], isOverdue: false, isDueSoon: false },
        { cardId: '3', title: 'T3', description: null, priority: 'high', dueDate: '2026-02-01', boardId: 'b1', boardName: 'B', listName: 'L', labels: [], isOverdue: false, isDueSoon: false },
      ];
      const sorted = sortByDueDate(tasks);
      expect(sorted[0].cardId).toBe('2');
      expect(sorted[1].cardId).toBe('3');
      expect(sorted[2].cardId).toBe('1');
    });

    it('puts null due dates at end', () => {
      const tasks: MyTask[] = [
        { cardId: '1', title: 'T1', description: null, priority: 'high', dueDate: null, boardId: 'b1', boardName: 'B', listName: 'L', labels: [], isOverdue: false, isDueSoon: false },
        { cardId: '2', title: 'T2', description: null, priority: 'high', dueDate: '2026-01-01', boardId: 'b1', boardName: 'B', listName: 'L', labels: [], isOverdue: false, isDueSoon: false },
      ];
      const sorted = sortByDueDate(tasks);
      expect(sorted[0].cardId).toBe('2');
      expect(sorted[1].cardId).toBe('1');
    });

    it('does not mutate original array', () => {
      const tasks: MyTask[] = [
        { cardId: '1', title: 'T1', description: null, priority: 'high', dueDate: '2026-03-01', boardId: 'b1', boardName: 'B', listName: 'L', labels: [], isOverdue: false, isDueSoon: false },
      ];
      const sorted = sortByDueDate(tasks);
      expect(sorted).not.toBe(tasks);
    });
  });
});
