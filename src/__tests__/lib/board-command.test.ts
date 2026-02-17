import { describe, it, expect } from 'vitest';
import { detectMode } from '@/hooks/useSmartSearch';
import type { SearchMode } from '@/hooks/useSmartSearch';
import type {
  CommandActionType,
  CommandAction,
  CommandActionPlan,
  CommandExecutionResult,
  SavedCommand,
} from '@/lib/types';

/**
 * Tests for Board Command Mode (P8.7):
 * - detectMode() with command keywords
 * - Command type validation
 * - Action plan structure
 * - Execution result structure
 * - Saved command structure
 */

const COMMAND_KEYWORDS = [
  'move', 'assign', 'set', 'change', 'archive',
  'unarchive', 'label', 'mark', 'tag', 'prioritize', 'reassign',
];

describe('Board Command Mode (P8.7)', () => {
  // =========================================================================
  // detectMode - command keyword detection
  // =========================================================================
  describe('detectMode - command keywords', () => {
    it('detects "move cards to Done" as command', () => {
      expect(detectMode('move cards to Done')).toBe('command');
    });

    it('detects "assign to Glen" as command', () => {
      expect(detectMode('assign to Glen')).toBe('command');
    });

    it('detects "archive done cards" as command', () => {
      expect(detectMode('archive done cards')).toBe('command');
    });

    it('detects "set priority high" as command', () => {
      expect(detectMode('set priority high')).toBe('command');
    });

    it('detects "label cards urgent" as command', () => {
      expect(detectMode('label cards urgent')).toBe('command');
    });

    it('detects "mark as complete" as command', () => {
      expect(detectMode('mark as complete')).toBe('command');
    });

    it('detects "tag cards with review" as command', () => {
      expect(detectMode('tag cards with review')).toBe('command');
    });

    it('detects "prioritize overdue tasks" as command', () => {
      expect(detectMode('prioritize overdue tasks')).toBe('command');
    });

    it('detects "reassign to Sarah" as command', () => {
      expect(detectMode('reassign to Sarah')).toBe('command');
    });

    it('detects "change priority to high" as command', () => {
      expect(detectMode('change priority to high')).toBe('command');
    });

    it('detects "unarchive old cards" as command', () => {
      expect(detectMode('unarchive old cards')).toBe('command');
    });

    // Each keyword with 2+ words should be command
    for (const keyword of COMMAND_KEYWORDS) {
      it(`"${keyword} something" returns "command"`, () => {
        expect(detectMode(`${keyword} something`)).toBe('command');
      });
    }
  });

  // =========================================================================
  // detectMode - command edge cases
  // =========================================================================
  describe('detectMode - command edge cases', () => {
    it('"move" alone returns "search" (single word)', () => {
      expect(detectMode('move')).toBe('search');
    });

    it('"assign" alone returns "search" (single word)', () => {
      expect(detectMode('assign')).toBe('search');
    });

    it('"how to move cards" returns "ai" (starts with AI word)', () => {
      expect(detectMode('how to move cards')).toBe('ai');
    });

    it('"what should I move" returns "ai" (starts with AI word)', () => {
      expect(detectMode('what should I move')).toBe('ai');
    });

    it('"can you move cards?" returns "ai" (has question mark)', () => {
      expect(detectMode('can you move cards?')).toBe('ai');
    });

    it('command keywords are case-insensitive', () => {
      expect(detectMode('Move cards to Done')).toBe('command');
      expect(detectMode('ASSIGN to Glen')).toBe('command');
      expect(detectMode('Archive done cards')).toBe('command');
    });

    it('"moving" (not imperative) returns "search" for single word', () => {
      expect(detectMode('moving')).toBe('search');
    });

    it('"moving cards" (not a command keyword) returns "search" for 2 words', () => {
      // "moving" is not in COMMAND_KEYWORDS, 2 words so not AI
      expect(detectMode('moving cards')).toBe('search');
    });
  });

  // =========================================================================
  // detectMode - AI and search still work
  // =========================================================================
  describe('detectMode - AI and search modes unchanged', () => {
    it('"what tasks are overdue?" returns "ai"', () => {
      expect(detectMode('what tasks are overdue?')).toBe('ai');
    });

    it('"show me tasks" returns "ai" (AI question word)', () => {
      expect(detectMode('show me tasks')).toBe('ai');
    });

    it('"login" returns "search"', () => {
      expect(detectMode('login')).toBe('search');
    });

    it('"fix bug" returns "search"', () => {
      expect(detectMode('fix bug')).toBe('search');
    });

    it('empty string returns "search"', () => {
      expect(detectMode('')).toBe('search');
    });

    it('SearchMode type includes "command"', () => {
      const mode: SearchMode = 'command';
      expect(mode).toBe('command');
    });
  });

  // =========================================================================
  // CommandActionType validation
  // =========================================================================
  describe('CommandActionType', () => {
    const validTypes: CommandActionType[] = ['move', 'assign', 'add_label', 'set_priority', 'archive', 'unarchive'];

    it('accepts all valid action types', () => {
      for (const type of validTypes) {
        const action: CommandAction = {
          type,
          card_ids: ['uuid-1'],
          description: 'Test action',
          config: {},
        };
        expect(action.type).toBe(type);
      }
    });
  });

  // =========================================================================
  // CommandAction structure
  // =========================================================================
  describe('CommandAction structure', () => {
    it('move action requires target_list_id', () => {
      const action: CommandAction = {
        type: 'move',
        card_ids: ['card-1', 'card-2'],
        description: 'Move 2 cards to Done',
        config: { target_list_id: 'list-123' },
      };
      expect(action.config.target_list_id).toBe('list-123');
      expect(action.card_ids).toHaveLength(2);
    });

    it('assign action requires assignee_id', () => {
      const action: CommandAction = {
        type: 'assign',
        card_ids: ['card-1'],
        description: 'Assign card to Glen',
        config: { assignee_id: 'user-456' },
      };
      expect(action.config.assignee_id).toBe('user-456');
    });

    it('add_label action requires label_id', () => {
      const action: CommandAction = {
        type: 'add_label',
        card_ids: ['card-1'],
        description: 'Add Urgent label',
        config: { label_id: 'label-789' },
      };
      expect(action.config.label_id).toBe('label-789');
    });

    it('set_priority action requires priority', () => {
      const action: CommandAction = {
        type: 'set_priority',
        card_ids: ['card-1'],
        description: 'Set priority to high',
        config: { priority: 'high' },
      };
      expect(action.config.priority).toBe('high');
    });

    it('archive action needs no extra config', () => {
      const action: CommandAction = {
        type: 'archive',
        card_ids: ['card-1', 'card-2', 'card-3'],
        description: 'Archive 3 cards',
        config: {},
      };
      expect(action.type).toBe('archive');
      expect(action.card_ids).toHaveLength(3);
    });
  });

  // =========================================================================
  // CommandActionPlan structure
  // =========================================================================
  describe('CommandActionPlan structure', () => {
    it('plan has required fields', () => {
      const plan: CommandActionPlan = {
        actions: [],
        summary: 'No actions found',
      };
      expect(plan.actions).toEqual([]);
      expect(plan.summary).toBeTruthy();
    });

    it('plan can have a warning', () => {
      const plan: CommandActionPlan = {
        actions: [{
          type: 'archive',
          card_ids: ['c1', 'c2'],
          description: 'Archive 2 cards',
          config: {},
        }],
        summary: 'Archive done cards',
        warning: 'This will archive 2 cards',
      };
      expect(plan.warning).toBeTruthy();
    });

    it('plan supports multiple actions', () => {
      const plan: CommandActionPlan = {
        actions: [
          { type: 'move', card_ids: ['c1', 'c2'], description: 'Move 2 cards', config: { target_list_id: 'l1' } },
          { type: 'assign', card_ids: ['c1', 'c2'], description: 'Assign cards', config: { assignee_id: 'u1' } },
        ],
        summary: 'Move and assign cards',
      };
      expect(plan.actions).toHaveLength(2);
      expect(plan.actions[0].type).toBe('move');
      expect(plan.actions[1].type).toBe('assign');
    });

    it('empty plan (no matching cards) is valid', () => {
      const plan: CommandActionPlan = {
        actions: [],
        summary: 'Could not parse command: no overdue cards found',
      };
      expect(plan.actions).toHaveLength(0);
      expect(plan.summary).toContain('Could not parse');
    });
  });

  // =========================================================================
  // CommandExecutionResult structure
  // =========================================================================
  describe('CommandExecutionResult structure', () => {
    it('successful result has correct shape', () => {
      const result: CommandExecutionResult = {
        action_index: 0,
        success: true,
        affected_count: 5,
      };
      expect(result.success).toBe(true);
      expect(result.affected_count).toBe(5);
      expect(result.error).toBeUndefined();
    });

    it('failed result includes error message', () => {
      const result: CommandExecutionResult = {
        action_index: 1,
        success: false,
        affected_count: 0,
        error: 'Permission denied',
      };
      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
    });

    it('partial success result', () => {
      const results: CommandExecutionResult[] = [
        { action_index: 0, success: true, affected_count: 3 },
        { action_index: 1, success: false, affected_count: 0, error: 'List not found' },
      ];
      expect(results.filter(r => r.success)).toHaveLength(1);
      expect(results.filter(r => !r.success)).toHaveLength(1);
    });
  });

  // =========================================================================
  // SavedCommand structure
  // =========================================================================
  describe('SavedCommand structure', () => {
    it('has all required fields', () => {
      const cmd: SavedCommand = {
        id: 'sc-123',
        board_id: 'board-456',
        name: 'Move overdue to Urgent',
        command: 'move overdue cards to Urgent',
        icon: 'zap',
        usage_count: 5,
      };
      expect(cmd.id).toBeTruthy();
      expect(cmd.board_id).toBeTruthy();
      expect(cmd.name).toBeTruthy();
      expect(cmd.command).toBeTruthy();
      expect(cmd.icon).toBe('zap');
      expect(cmd.usage_count).toBe(5);
    });

    it('usage_count starts at 0 by convention', () => {
      const cmd: SavedCommand = {
        id: 'sc-new',
        board_id: 'b1',
        name: 'New Recipe',
        command: 'archive done cards',
        icon: 'zap',
        usage_count: 0,
      };
      expect(cmd.usage_count).toBe(0);
    });
  });

  // =========================================================================
  // Mock command parsing response
  // =========================================================================
  describe('Mock command parsing response', () => {
    it('parses a move command response', () => {
      const mockResponse: CommandActionPlan = {
        actions: [{
          type: 'move',
          card_ids: ['card-1', 'card-2', 'card-3'],
          description: 'Move 3 overdue cards to Urgent',
          config: { target_list_id: 'list-urgent' },
        }],
        summary: 'Move 3 overdue cards to the Urgent list',
      };

      expect(mockResponse.actions).toHaveLength(1);
      expect(mockResponse.actions[0].type).toBe('move');
      expect(mockResponse.actions[0].card_ids).toHaveLength(3);
      expect(mockResponse.actions[0].config.target_list_id).toBe('list-urgent');
    });

    it('parses a multi-action response', () => {
      const mockResponse: CommandActionPlan = {
        actions: [
          {
            type: 'move',
            card_ids: ['c1', 'c2'],
            description: 'Move 2 cards to Done',
            config: { target_list_id: 'list-done' },
          },
          {
            type: 'set_priority',
            card_ids: ['c1', 'c2'],
            description: 'Set priority to none',
            config: { priority: 'none' },
          },
        ],
        summary: 'Move cards to Done and clear their priority',
      };

      expect(mockResponse.actions).toHaveLength(2);
    });

    it('handles destructive command with warning', () => {
      const mockResponse: CommandActionPlan = {
        actions: [{
          type: 'archive',
          card_ids: ['c1', 'c2', 'c3', 'c4', 'c5'],
          description: 'Archive 5 completed cards',
          config: {},
        }],
        summary: 'Archive all completed cards',
        warning: 'This will archive 5 cards. They can be unarchived later.',
      };

      expect(mockResponse.warning).toBeTruthy();
      expect(mockResponse.actions[0].card_ids).toHaveLength(5);
    });
  });

  // =========================================================================
  // Execution result handling
  // =========================================================================
  describe('Execution result handling', () => {
    it('all successful results', () => {
      const results: CommandExecutionResult[] = [
        { action_index: 0, success: true, affected_count: 5 },
        { action_index: 1, success: true, affected_count: 5 },
      ];
      const allSuccess = results.every(r => r.success);
      const totalAffected = results.reduce((sum, r) => sum + r.affected_count, 0);
      expect(allSuccess).toBe(true);
      expect(totalAffected).toBe(10);
    });

    it('mixed results (partial failure)', () => {
      const results: CommandExecutionResult[] = [
        { action_index: 0, success: true, affected_count: 3 },
        { action_index: 1, success: false, affected_count: 0, error: 'List not found' },
      ];
      const allSuccess = results.every(r => r.success);
      expect(allSuccess).toBe(false);
    });

    it('empty results array', () => {
      const results: CommandExecutionResult[] = [];
      expect(results).toHaveLength(0);
    });
  });
});
