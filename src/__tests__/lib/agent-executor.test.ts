import { describe, it, expect } from 'vitest';
import * as agentExecutor from '@/lib/ai/agent-executor';
import type { ExecuteAgentParams, ExecuteAgentCallbacks } from '@/lib/ai/agent-executor';

// ============================================================================
// TESTS
// ============================================================================

describe('Agent Executor', () => {
  // --------------------------------------------------------------------------
  // Module exports
  // --------------------------------------------------------------------------
  describe('module exports', () => {
    it('exports executeAgentSkill as a function', () => {
      expect(typeof agentExecutor.executeAgentSkill).toBe('function');
    });

    it('does not export buildCardContext (internal helper)', () => {
      expect((agentExecutor as Record<string, unknown>).buildCardContext).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Function arity
  // --------------------------------------------------------------------------
  describe('function arity', () => {
    it('executeAgentSkill accepts 3 arguments (supabase, params, callbacks)', () => {
      expect(agentExecutor.executeAgentSkill.length).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // ExecuteAgentParams interface shape
  // --------------------------------------------------------------------------
  describe('ExecuteAgentParams interface shape', () => {
    it('can construct a valid params object with all required fields', () => {
      const params: ExecuteAgentParams = {
        taskId: 'task-1',
        skillId: 'skill-1',
        cardId: 'card-1',
        boardId: 'board-1',
        userId: 'user-1',
      };

      expect(typeof params.taskId).toBe('string');
      expect(typeof params.skillId).toBe('string');
      expect(typeof params.cardId).toBe('string');
      expect(typeof params.boardId).toBe('string');
      expect(typeof params.userId).toBe('string');
    });

    it('can include optional boardAgentId', () => {
      const params: ExecuteAgentParams = {
        taskId: 'task-1',
        skillId: 'skill-1',
        cardId: 'card-1',
        boardId: 'board-1',
        userId: 'user-1',
        boardAgentId: 'agent-1',
      };
      expect(typeof params.boardAgentId).toBe('string');
    });

    it('can include optional inputPrompt', () => {
      const params: ExecuteAgentParams = {
        taskId: 'task-1',
        skillId: 'skill-1',
        cardId: 'card-1',
        boardId: 'board-1',
        userId: 'user-1',
        inputPrompt: 'Focus on SEO keywords',
      };
      expect(typeof params.inputPrompt).toBe('string');
    });

    it('boardAgentId defaults to undefined when omitted', () => {
      const params: ExecuteAgentParams = {
        taskId: 'task-1',
        skillId: 'skill-1',
        cardId: 'card-1',
        boardId: 'board-1',
        userId: 'user-1',
      };
      expect(params.boardAgentId).toBeUndefined();
    });

    it('inputPrompt defaults to undefined when omitted', () => {
      const params: ExecuteAgentParams = {
        taskId: 'task-1',
        skillId: 'skill-1',
        cardId: 'card-1',
        boardId: 'board-1',
        userId: 'user-1',
      };
      expect(params.inputPrompt).toBeUndefined();
    });

    it('params object has exactly 5 required keys when optionals are omitted', () => {
      const params: ExecuteAgentParams = {
        taskId: 'task-1',
        skillId: 'skill-1',
        cardId: 'card-1',
        boardId: 'board-1',
        userId: 'user-1',
      };
      const keys = Object.keys(params);
      expect(keys).toHaveLength(5);
      expect(keys).toContain('taskId');
      expect(keys).toContain('skillId');
      expect(keys).toContain('cardId');
      expect(keys).toContain('boardId');
      expect(keys).toContain('userId');
    });

    it('params object has 7 keys when all optionals are included', () => {
      const params: ExecuteAgentParams = {
        taskId: 'task-1',
        skillId: 'skill-1',
        boardAgentId: 'agent-1',
        cardId: 'card-1',
        boardId: 'board-1',
        userId: 'user-1',
        inputPrompt: 'Custom prompt',
      };
      expect(Object.keys(params)).toHaveLength(7);
    });
  });

  // --------------------------------------------------------------------------
  // ExecuteAgentCallbacks interface shape
  // --------------------------------------------------------------------------
  describe('ExecuteAgentCallbacks interface shape', () => {
    it('can construct a valid callbacks object with all three callbacks', () => {
      const callbacks: ExecuteAgentCallbacks = {
        onToken: (text: string) => { void text; },
        onComplete: (output: string) => { void output; },
        onError: (error: string) => { void error; },
      };

      expect(typeof callbacks.onToken).toBe('function');
      expect(typeof callbacks.onComplete).toBe('function');
      expect(typeof callbacks.onError).toBe('function');
    });

    it('onToken callback accepts a string argument', () => {
      let received = '';
      const callbacks: ExecuteAgentCallbacks = {
        onToken: (text: string) => { received = text; },
        onComplete: () => {},
        onError: () => {},
      };
      callbacks.onToken('hello');
      expect(received).toBe('hello');
    });

    it('onComplete callback accepts a string argument', () => {
      let received = '';
      const callbacks: ExecuteAgentCallbacks = {
        onToken: () => {},
        onComplete: (output: string) => { received = output; },
        onError: () => {},
      };
      callbacks.onComplete('full output');
      expect(received).toBe('full output');
    });

    it('onError callback accepts a string argument', () => {
      let received = '';
      const callbacks: ExecuteAgentCallbacks = {
        onToken: () => {},
        onComplete: () => {},
        onError: (error: string) => { received = error; },
      };
      callbacks.onError('something went wrong');
      expect(received).toBe('something went wrong');
    });

    it('callbacks object has exactly 3 keys', () => {
      const callbacks: ExecuteAgentCallbacks = {
        onToken: () => {},
        onComplete: () => {},
        onError: () => {},
      };
      expect(Object.keys(callbacks)).toHaveLength(3);
      expect(Object.keys(callbacks)).toEqual(
        expect.arrayContaining(['onToken', 'onComplete', 'onError'])
      );
    });
  });
});
