import { describe, it, expect } from 'vitest';
import { fetchTeamWorkload, groupCardsByAssignee } from '@/lib/team-view';
import type { TeamMemberWorkload } from '@/lib/team-view';

describe('Team View (v5.6.0)', () => {
  describe('exports', () => {
    it('fetchTeamWorkload is a function', () => {
      expect(typeof fetchTeamWorkload).toBe('function');
    });

    it('groupCardsByAssignee is a function', () => {
      expect(typeof groupCardsByAssignee).toBe('function');
    });
  });

  describe('groupCardsByAssignee', () => {
    it('creates a map keyed by userId', () => {
      const workloads: TeamMemberWorkload[] = [
        { userId: 'u1', displayName: 'Alice', avatarUrl: null, role: 'admin', totalCards: 5, overdueCards: 1, dueSoonCards: 2, completedThisWeek: 3, cards: [] },
        { userId: 'u2', displayName: 'Bob', avatarUrl: null, role: 'member', totalCards: 3, overdueCards: 0, dueSoonCards: 1, completedThisWeek: 1, cards: [] },
      ];
      const map = groupCardsByAssignee(workloads);
      expect(map['u1'].displayName).toBe('Alice');
      expect(map['u2'].displayName).toBe('Bob');
    });

    it('returns empty object for empty array', () => {
      expect(groupCardsByAssignee([])).toEqual({});
    });

    it('preserves all workload fields', () => {
      const workload: TeamMemberWorkload = {
        userId: 'u1', displayName: 'Test', avatarUrl: 'http://example.com', role: 'admin',
        totalCards: 10, overdueCards: 2, dueSoonCards: 3, completedThisWeek: 5, cards: [],
      };
      const map = groupCardsByAssignee([workload]);
      expect(map['u1'].totalCards).toBe(10);
      expect(map['u1'].overdueCards).toBe(2);
      expect(map['u1'].avatarUrl).toBe('http://example.com');
    });
  });

  describe('TeamMemberWorkload type', () => {
    it('type has all required fields', () => {
      const w: TeamMemberWorkload = {
        userId: 'u1', displayName: 'Test', avatarUrl: null, role: 'member',
        totalCards: 0, overdueCards: 0, dueSoonCards: 0, completedThisWeek: 0, cards: [],
      };
      expect(w.userId).toBe('u1');
      expect(w.cards).toEqual([]);
    });

    it('cards array can contain card objects', () => {
      const w: TeamMemberWorkload = {
        userId: 'u1', displayName: 'Test', avatarUrl: null, role: 'member',
        totalCards: 1, overdueCards: 0, dueSoonCards: 0, completedThisWeek: 0,
        cards: [{ id: 'c1', title: 'Card 1', priority: 'high', dueDate: '2026-03-01', boardName: 'B', listName: 'L' }],
      };
      expect(w.cards[0].title).toBe('Card 1');
    });
  });
});
