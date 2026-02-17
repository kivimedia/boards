import { describe, it, expect } from 'vitest';
import type {
  ChatScope,
  ChatMessage,
  ChatMessageRole,
  ChatSession,
  ChatContext,
  ChatContextCard,
  BoardType,
} from '@/lib/types';

describe('AI Chat Types (P2.3)', () => {
  // ===========================================================================
  // ChatScope
  // ===========================================================================

  describe('ChatScope', () => {
    it('covers "ticket" scope', () => {
      const scope: ChatScope = 'ticket';
      expect(scope).toBe('ticket');
    });

    it('covers "board" scope', () => {
      const scope: ChatScope = 'board';
      expect(scope).toBe('board');
    });

    it('covers "all_boards" scope', () => {
      const scope: ChatScope = 'all_boards';
      expect(scope).toBe('all_boards');
    });

    it('all 3 values are distinct', () => {
      const scopes: ChatScope[] = ['ticket', 'board', 'all_boards'];
      const unique = new Set(scopes);
      expect(unique.size).toBe(3);
    });
  });

  // ===========================================================================
  // ChatMessage
  // ===========================================================================

  describe('ChatMessage', () => {
    it('has required fields: role, content, timestamp', () => {
      const msg: ChatMessage = {
        role: 'user',
        content: 'Hello, can you help me?',
        timestamp: '2025-06-15T10:30:00Z',
      };

      expect(msg.role).toBe('user');
      expect(msg.content).toBe('Hello, can you help me?');
      expect(msg.timestamp).toBe('2025-06-15T10:30:00Z');
    });

    it('supports optional tokens field', () => {
      const msg: ChatMessage = {
        role: 'assistant',
        content: 'Sure, I can help!',
        timestamp: '2025-06-15T10:30:01Z',
        tokens: 42,
      };

      expect(msg.tokens).toBe(42);
    });

    it('allows all valid ChatMessageRole values', () => {
      const roles: ChatMessageRole[] = ['user', 'assistant', 'system'];
      const messages: ChatMessage[] = roles.map((role) => ({
        role,
        content: `Message from ${role}`,
        timestamp: '2025-01-01T00:00:00Z',
      }));

      expect(messages).toHaveLength(3);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
      expect(messages[2].role).toBe('system');
    });

    it('works without optional tokens field', () => {
      const msg: ChatMessage = {
        role: 'user',
        content: 'Minimal message',
        timestamp: '2025-01-01T00:00:00Z',
      };

      expect(msg.tokens).toBeUndefined();
    });
  });

  // ===========================================================================
  // ChatSession
  // ===========================================================================

  describe('ChatSession', () => {
    it('has all required fields', () => {
      const session: ChatSession = {
        id: 'session-001',
        user_id: 'user-abc',
        scope: 'ticket',
        card_id: 'card-123',
        board_id: null,
        title: 'Discussing the login bug',
        messages: [
          { role: 'user', content: 'What is this card about?', timestamp: '2025-06-15T10:00:00Z' },
          { role: 'assistant', content: 'This card is about a login bug on Safari.', timestamp: '2025-06-15T10:00:01Z' },
        ],
        message_count: 2,
        total_tokens: 200,
        model_used: 'claude-sonnet-4-20250514',
        is_archived: false,
        created_at: '2025-06-15T10:00:00Z',
        updated_at: '2025-06-15T10:00:01Z',
      };

      expect(session.id).toBe('session-001');
      expect(session.user_id).toBe('user-abc');
      expect(session.scope).toBe('ticket');
      expect(session.card_id).toBe('card-123');
      expect(session.board_id).toBeNull();
      expect(session.title).toBe('Discussing the login bug');
      expect(session.messages).toHaveLength(2);
      expect(session.message_count).toBe(2);
      expect(session.total_tokens).toBe(200);
      expect(session.model_used).toBe('claude-sonnet-4-20250514');
      expect(session.is_archived).toBe(false);
      expect(session.created_at).toBeDefined();
      expect(session.updated_at).toBeDefined();
    });

    it('supports board scope with board_id and no card_id', () => {
      const session: ChatSession = {
        id: 'session-002',
        user_id: 'user-def',
        scope: 'board',
        card_id: null,
        board_id: 'board-456',
        title: 'Board overview chat',
        messages: [],
        message_count: 0,
        total_tokens: 0,
        model_used: null,
        is_archived: false,
        created_at: '2025-06-16T08:00:00Z',
        updated_at: '2025-06-16T08:00:00Z',
      };

      expect(session.scope).toBe('board');
      expect(session.board_id).toBe('board-456');
      expect(session.card_id).toBeNull();
      expect(session.model_used).toBeNull();
    });

    it('supports all_boards scope with null card_id and board_id', () => {
      const session: ChatSession = {
        id: 'session-003',
        user_id: 'user-ghi',
        scope: 'all_boards',
        card_id: null,
        board_id: null,
        title: null,
        messages: [],
        message_count: 0,
        total_tokens: 0,
        model_used: null,
        is_archived: false,
        created_at: '2025-06-17T12:00:00Z',
        updated_at: '2025-06-17T12:00:00Z',
      };

      expect(session.scope).toBe('all_boards');
      expect(session.card_id).toBeNull();
      expect(session.board_id).toBeNull();
      expect(session.title).toBeNull();
    });

    it('can be marked as archived', () => {
      const session: ChatSession = {
        id: 'session-004',
        user_id: 'user-jkl',
        scope: 'ticket',
        card_id: 'card-999',
        board_id: null,
        title: 'Archived session',
        messages: [{ role: 'user', content: 'Old msg', timestamp: '2025-01-01T00:00:00Z' }],
        message_count: 1,
        total_tokens: 50,
        model_used: 'claude-sonnet-4-20250514',
        is_archived: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-02T00:00:00Z',
      };

      expect(session.is_archived).toBe(true);
    });
  });

  // ===========================================================================
  // ChatContext — structure per scope
  // ===========================================================================

  describe('ChatContext', () => {
    it('ticket scope has card and user, no board', () => {
      const context: ChatContext = {
        scope: 'ticket',
        card: {
          id: 'card-1',
          title: 'Test Card',
          description: 'A test description',
          priority: 'high',
          list_name: 'In Progress',
          labels: ['bug'],
          assignees: ['Dev1'],
        },
        user: { name: 'Alice', role: 'admin' },
      };

      expect(context.scope).toBe('ticket');
      expect(context.card).toBeDefined();
      expect(context.card!.id).toBe('card-1');
      expect(context.board).toBeUndefined();
      expect(context.user.name).toBe('Alice');
      expect(context.user.role).toBe('admin');
    });

    it('board scope has board and user, no card', () => {
      const context: ChatContext = {
        scope: 'board',
        board: {
          id: 'board-1',
          name: 'Dev Board',
          board_type: 'dev',
          cards: [
            { id: 'c1', title: 'Card A', description: null, priority: null, list_name: 'Backlog', labels: [], assignees: [] },
          ],
        },
        user: { name: 'Bob', role: 'department_lead' },
      };

      expect(context.scope).toBe('board');
      expect(context.board).toBeDefined();
      expect(context.board!.id).toBe('board-1');
      expect(context.board!.name).toBe('Dev Board');
      expect(context.board!.board_type).toBe('dev');
      expect(context.board!.cards).toHaveLength(1);
      expect(context.card).toBeUndefined();
    });

    it('all_boards scope has only user, no card or board', () => {
      const context: ChatContext = {
        scope: 'all_boards',
        user: { name: 'Charlie', role: 'member' },
      };

      expect(context.scope).toBe('all_boards');
      expect(context.card).toBeUndefined();
      expect(context.board).toBeUndefined();
      expect(context.user.name).toBe('Charlie');
    });

    it('board context accepts all valid board_type values', () => {
      const boardTypes: BoardType[] = [
        'dev',
        'training',
        'account_manager',
        'graphic_designer',
        'executive_assistant',
        'video_editor',
        'copy',
        'client_strategy_map',
      ];

      for (const bt of boardTypes) {
        const context: ChatContext = {
          scope: 'board',
          board: { id: 'b', name: 'B', board_type: bt, cards: [] },
          user: { name: 'U', role: 'member' },
        };
        expect(context.board!.board_type).toBe(bt);
      }
    });
  });

  // ===========================================================================
  // ChatContextCard
  // ===========================================================================

  describe('ChatContextCard', () => {
    it('has all required fields', () => {
      const card: ChatContextCard = {
        id: 'card-full',
        title: 'Full Card',
        description: 'A complete card with all details',
        priority: 'urgent',
        list_name: 'In Review',
        labels: ['design', 'approved'],
        assignees: ['Alice', 'Bob'],
      };

      expect(card.id).toBe('card-full');
      expect(card.title).toBe('Full Card');
      expect(card.description).toBe('A complete card with all details');
      expect(card.priority).toBe('urgent');
      expect(card.list_name).toBe('In Review');
      expect(card.labels).toEqual(['design', 'approved']);
      expect(card.assignees).toEqual(['Alice', 'Bob']);
    });

    it('allows null for description and priority', () => {
      const card: ChatContextCard = {
        id: 'card-null',
        title: 'Minimal Card',
        description: null,
        priority: null,
        list_name: 'Backlog',
        labels: [],
        assignees: [],
      };

      expect(card.description).toBeNull();
      expect(card.priority).toBeNull();
    });

    it('supports optional checklist_summary', () => {
      const card: ChatContextCard = {
        id: 'card-cl',
        title: 'Checklist Card',
        description: null,
        priority: null,
        list_name: 'Doing',
        labels: [],
        assignees: [],
        checklist_summary: 'Dev Tasks: 2/5 complete',
      };

      expect(card.checklist_summary).toBe('Dev Tasks: 2/5 complete');
    });

    it('supports optional custom_fields', () => {
      const card: ChatContextCard = {
        id: 'card-cf',
        title: 'Custom Fields Card',
        description: null,
        priority: null,
        list_name: 'Backlog',
        labels: [],
        assignees: [],
        custom_fields: {
          'Estimated Hours': 4,
          'Sprint': 'Sprint 12',
        },
      };

      expect(card.custom_fields).toBeDefined();
      expect(card.custom_fields!['Estimated Hours']).toBe(4);
      expect(card.custom_fields!['Sprint']).toBe('Sprint 12');
    });

    it('supports optional brief_data', () => {
      const card: ChatContextCard = {
        id: 'card-bd',
        title: 'Brief Card',
        description: null,
        priority: null,
        list_name: 'Backlog',
        labels: [],
        assignees: [],
        brief_data: {
          target_audience: 'Gen Z',
          platform: 'Instagram',
        },
      };

      expect(card.brief_data).toBeDefined();
      expect(card.brief_data!['target_audience']).toBe('Gen Z');
    });

    it('supports optional recent_comments', () => {
      const card: ChatContextCard = {
        id: 'card-rc',
        title: 'Comments Card',
        description: null,
        priority: null,
        list_name: 'In Review',
        labels: [],
        assignees: [],
        recent_comments: ['First comment', 'Second comment'],
      };

      expect(card.recent_comments).toHaveLength(2);
      expect(card.recent_comments![0]).toBe('First comment');
    });

    it('optional fields are undefined when not provided', () => {
      const card: ChatContextCard = {
        id: 'card-minimal',
        title: 'Bare Minimum',
        description: null,
        priority: null,
        list_name: 'Backlog',
        labels: [],
        assignees: [],
      };

      expect(card.checklist_summary).toBeUndefined();
      expect(card.custom_fields).toBeUndefined();
      expect(card.brief_data).toBeUndefined();
      expect(card.recent_comments).toBeUndefined();
    });
  });
});
