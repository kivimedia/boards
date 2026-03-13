import { describe, it, expect } from 'vitest';
import { fetchMyTasks, groupByBoard, groupByPriority, sortByDueDate, groupByUrgency } from '@/lib/my-tasks';
import type { MyTask } from '@/lib/my-tasks';

const base: Pick<MyTask, 'description' | 'labels' | 'isOverdue' | 'isDueSoon' | 'commentCount' | 'checklistTotal' | 'checklistDone' | 'attachmentCount' | 'updatedAt'> = {
  description: null, labels: [], isOverdue: false, isDueSoon: false,
  commentCount: 0, checklistTotal: 0, checklistDone: 0, attachmentCount: 0, updatedAt: null,
};

function task(overrides: Partial<MyTask> & Pick<MyTask, 'cardId' | 'title' | 'priority'>): MyTask {
  return { boardId: 'b1', boardName: 'B', listName: 'L', dueDate: null, ...base, ...overrides };
}

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

    it('groupByUrgency is a function', () => {
      expect(typeof groupByUrgency).toBe('function');
    });
  });

  describe('groupByBoard', () => {
    it('groups tasks by board name', () => {
      const tasks: MyTask[] = [
        task({ cardId: '1', title: 'T1', priority: 'high', boardId: 'b1', boardName: 'Design', listName: 'Todo' }),
        task({ cardId: '2', title: 'T2', priority: 'low', boardId: 'b2', boardName: 'Dev', listName: 'Todo' }),
        task({ cardId: '3', title: 'T3', priority: 'medium', boardId: 'b1', boardName: 'Design', listName: 'Done' }),
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
        task({ cardId: '1', title: 'T1', priority: 'urgent' }),
        task({ cardId: '2', title: 'T2', priority: 'urgent' }),
        task({ cardId: '3', title: 'T3', priority: 'low' }),
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
        task({ cardId: '1', title: 'T1', priority: 'high', dueDate: '2026-03-01' }),
        task({ cardId: '2', title: 'T2', priority: 'high', dueDate: '2026-01-01' }),
        task({ cardId: '3', title: 'T3', priority: 'high', dueDate: '2026-02-01' }),
      ];
      const sorted = sortByDueDate(tasks);
      expect(sorted[0].cardId).toBe('2');
      expect(sorted[1].cardId).toBe('3');
      expect(sorted[2].cardId).toBe('1');
    });

    it('puts null due dates at end', () => {
      const tasks: MyTask[] = [
        task({ cardId: '1', title: 'T1', priority: 'high', dueDate: null }),
        task({ cardId: '2', title: 'T2', priority: 'high', dueDate: '2026-01-01' }),
      ];
      const sorted = sortByDueDate(tasks);
      expect(sorted[0].cardId).toBe('2');
      expect(sorted[1].cardId).toBe('1');
    });

    it('does not mutate original array', () => {
      const tasks: MyTask[] = [
        task({ cardId: '1', title: 'T1', priority: 'high', dueDate: '2026-03-01' }),
      ];
      const sorted = sortByDueDate(tasks);
      expect(sorted).not.toBe(tasks);
    });
  });
});
