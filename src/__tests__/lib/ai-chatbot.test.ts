import { describe, it, expect } from 'vitest';
import { formatContextForPrompt } from '../../lib/ai/chatbot';
import type { ChatContext, ChatContextCard } from '@/lib/types';
import type { ChatSendInput, ChatSendOutput } from '@/lib/ai/chatbot';

describe('AI Chatbot (P2.3)', () => {
  // ===========================================================================
  // formatContextForPrompt — ticket scope
  // ===========================================================================

  describe('formatContextForPrompt — ticket scope', () => {
    it('formats card details for a ticket-scope context', () => {
      const context: ChatContext = {
        scope: 'ticket',
        card: {
          id: 'card-1',
          title: 'Fix login bug',
          description: 'Users cannot log in on Safari',
          priority: 'high',
          list_name: 'In Progress',
          labels: ['bug', 'urgent'],
          assignees: ['Alice', 'Bob'],
        },
        user: { name: 'Alice', role: 'admin' },
      };

      const result = formatContextForPrompt(context);

      expect(result).toContain('## Current Ticket');
      expect(result).toContain('Title: Fix login bug');
      expect(result).toContain('Status: In Progress');
      expect(result).toContain('Description: Users cannot log in on Safari');
      expect(result).toContain('Priority: high');
      expect(result).toContain('Labels: bug, urgent');
      expect(result).toContain('Assignees: Alice, Bob');
    });

    it('omits optional fields when not present', () => {
      const context: ChatContext = {
        scope: 'ticket',
        card: {
          id: 'card-2',
          title: 'No-description card',
          description: null,
          priority: null,
          list_name: 'Backlog',
          labels: [],
          assignees: [],
        },
        user: { name: 'Jane', role: 'member' },
      };

      const result = formatContextForPrompt(context);

      expect(result).toContain('Title: No-description card');
      expect(result).toContain('Status: Backlog');
      expect(result).not.toContain('Description:');
      expect(result).not.toContain('Priority:');
      expect(result).not.toContain('Labels:');
      expect(result).not.toContain('Assignees:');
    });
  });

  // ===========================================================================
  // formatContextForPrompt — board scope
  // ===========================================================================

  describe('formatContextForPrompt — board scope', () => {
    it('groups cards by list for a board-scope context', () => {
      const context: ChatContext = {
        scope: 'board',
        board: {
          id: 'board-1',
          name: 'Dev Board',
          board_type: 'dev',
          cards: [
            { id: 'c1', title: 'Task A', description: null, priority: 'high', list_name: 'To Do', labels: [], assignees: [] },
            { id: 'c2', title: 'Task B', description: null, priority: null, list_name: 'To Do', labels: [], assignees: [] },
            { id: 'c3', title: 'Task C', description: null, priority: 'low', list_name: 'Done', labels: [], assignees: [] },
          ],
        },
        user: { name: 'Bob', role: 'department_lead' },
      };

      const result = formatContextForPrompt(context);

      expect(result).toContain('## Board: Dev Board (dev)');
      expect(result).toContain('Total cards: 3');
      expect(result).toContain('### To Do (2 cards)');
      expect(result).toContain('- Task A [high]');
      expect(result).toContain('- Task B');
      expect(result).toContain('### Done (1 cards)');
      expect(result).toContain('- Task C [low]');
    });
  });

  // ===========================================================================
  // formatContextForPrompt — empty context
  // ===========================================================================

  describe('formatContextForPrompt — empty / global context', () => {
    it('returns only user info when no card or board is present', () => {
      const context: ChatContext = {
        scope: 'all_boards',
        user: { name: 'Admin', role: 'admin' },
      };

      const result = formatContextForPrompt(context);

      expect(result).toContain('User: Admin (admin)');
      expect(result).not.toContain('## Current Ticket');
      expect(result).not.toContain('## Board:');
    });
  });

  // ===========================================================================
  // formatContextForPrompt — user info
  // ===========================================================================

  describe('formatContextForPrompt — user info', () => {
    it('includes user name and role in every scope', () => {
      const ticketCtx: ChatContext = {
        scope: 'ticket',
        card: {
          id: 'c1',
          title: 'Card',
          description: null,
          priority: null,
          list_name: 'Backlog',
          labels: [],
          assignees: [],
        },
        user: { name: 'Sarah', role: 'member' },
      };

      const boardCtx: ChatContext = {
        scope: 'board',
        board: {
          id: 'b1',
          name: 'Board',
          board_type: 'dev',
          cards: [],
        },
        user: { name: 'Mike', role: 'department_lead' },
      };

      const globalCtx: ChatContext = {
        scope: 'all_boards',
        user: { name: 'Root', role: 'admin' },
      };

      expect(formatContextForPrompt(ticketCtx)).toContain('User: Sarah (member)');
      expect(formatContextForPrompt(boardCtx)).toContain('User: Mike (department_lead)');
      expect(formatContextForPrompt(globalCtx)).toContain('User: Root (admin)');
    });
  });

  // ===========================================================================
  // formatContextForPrompt — truncation (>20 cards)
  // ===========================================================================

  describe('formatContextForPrompt — card truncation', () => {
    it('truncates card lists longer than 20 items per list', () => {
      const cards: ChatContextCard[] = Array.from({ length: 25 }, (_, i) => ({
        id: `c-${i}`,
        title: `Card ${i}`,
        description: null,
        priority: null,
        list_name: 'Backlog',
        labels: [],
        assignees: [],
      }));

      const context: ChatContext = {
        scope: 'board',
        board: {
          id: 'board-trunc',
          name: 'Big Board',
          board_type: 'dev',
          cards,
        },
        user: { name: 'Admin', role: 'admin' },
      };

      const result = formatContextForPrompt(context);

      // First 20 cards should be listed
      expect(result).toContain('- Card 0');
      expect(result).toContain('- Card 19');
      // Card 20 should NOT be listed individually
      expect(result).not.toContain('- Card 20');
      // Truncation message
      expect(result).toContain('... and 5 more');
    });

    it('does not show truncation message for exactly 20 cards', () => {
      const cards: ChatContextCard[] = Array.from({ length: 20 }, (_, i) => ({
        id: `c-${i}`,
        title: `Card ${i}`,
        description: null,
        priority: null,
        list_name: 'Backlog',
        labels: [],
        assignees: [],
      }));

      const context: ChatContext = {
        scope: 'board',
        board: {
          id: 'board-exact',
          name: 'Board Exact',
          board_type: 'dev',
          cards,
        },
        user: { name: 'Admin', role: 'admin' },
      };

      const result = formatContextForPrompt(context);

      expect(result).toContain('- Card 19');
      expect(result).not.toContain('... and');
    });
  });

  // ===========================================================================
  // ChatSendInput type structure
  // ===========================================================================

  describe('ChatSendInput type', () => {
    it('accepts a valid ChatSendInput object with required fields', () => {
      const input: ChatSendInput = {
        userId: 'user-123',
        scope: 'ticket',
        message: 'What is the status of this card?',
      };

      expect(input.userId).toBe('user-123');
      expect(input.scope).toBe('ticket');
      expect(input.message).toBe('What is the status of this card?');
    });

    it('accepts all optional fields', () => {
      const input: ChatSendInput = {
        sessionId: 'session-abc',
        userId: 'user-456',
        boardId: 'board-789',
        cardId: 'card-xyz',
        scope: 'board',
        message: 'Summarize the board',
        previousMessages: [
          { role: 'user', content: 'Hello', timestamp: '2025-01-01T00:00:00Z' },
          { role: 'assistant', content: 'Hi there!', timestamp: '2025-01-01T00:00:01Z' },
        ],
      };

      expect(input.sessionId).toBe('session-abc');
      expect(input.boardId).toBe('board-789');
      expect(input.cardId).toBe('card-xyz');
      expect(input.previousMessages).toHaveLength(2);
    });
  });

  // ===========================================================================
  // ChatSendOutput type structure
  // ===========================================================================

  describe('ChatSendOutput type', () => {
    it('has all required fields', () => {
      const output: ChatSendOutput = {
        reply: 'The card is currently in In Progress.',
        sessionId: 'session-001',
        inputTokens: 150,
        outputTokens: 42,
        modelUsed: 'claude-sonnet-4-20250514',
      };

      expect(output.reply).toBe('The card is currently in In Progress.');
      expect(output.sessionId).toBe('session-001');
      expect(output.inputTokens).toBe(150);
      expect(output.outputTokens).toBe(42);
      expect(output.modelUsed).toBe('claude-sonnet-4-20250514');
    });

    it('token counts are numbers', () => {
      const output: ChatSendOutput = {
        reply: 'Done',
        sessionId: 's-1',
        inputTokens: 0,
        outputTokens: 0,
        modelUsed: 'test-model',
      };

      expect(typeof output.inputTokens).toBe('number');
      expect(typeof output.outputTokens).toBe('number');
    });
  });

  // ===========================================================================
  // formatContextForPrompt — labels, assignees, checklists
  // ===========================================================================

  describe('formatContextForPrompt — labels, assignees, checklists', () => {
    it('includes labels in formatted output', () => {
      const context: ChatContext = {
        scope: 'ticket',
        card: {
          id: 'c1',
          title: 'Labelled card',
          description: null,
          priority: null,
          list_name: 'To Do',
          labels: ['design', 'review', 'client-facing'],
          assignees: [],
        },
        user: { name: 'Tester', role: 'member' },
      };

      const result = formatContextForPrompt(context);
      expect(result).toContain('Labels: design, review, client-facing');
    });

    it('includes assignees in formatted output', () => {
      const context: ChatContext = {
        scope: 'ticket',
        card: {
          id: 'c2',
          title: 'Assigned card',
          description: null,
          priority: null,
          list_name: 'In Review',
          labels: [],
          assignees: ['Alice Johnson', 'Bob Smith'],
        },
        user: { name: 'Tester', role: 'member' },
      };

      const result = formatContextForPrompt(context);
      expect(result).toContain('Assignees: Alice Johnson, Bob Smith');
    });

    it('includes checklist summary in formatted output', () => {
      const context: ChatContext = {
        scope: 'ticket',
        card: {
          id: 'c3',
          title: 'Checklist card',
          description: null,
          priority: null,
          list_name: 'Doing',
          labels: [],
          assignees: [],
          checklist_summary: 'QA Checks: 3/5 complete; Design Review: 1/2 complete',
        },
        user: { name: 'Tester', role: 'member' },
      };

      const result = formatContextForPrompt(context);
      expect(result).toContain('Checklists: QA Checks: 3/5 complete; Design Review: 1/2 complete');
    });
  });

  // ===========================================================================
  // formatContextForPrompt — custom fields and brief data
  // ===========================================================================

  describe('formatContextForPrompt — custom fields and brief data', () => {
    it('includes custom fields as JSON in formatted output', () => {
      const context: ChatContext = {
        scope: 'ticket',
        card: {
          id: 'c4',
          title: 'Custom fields card',
          description: null,
          priority: null,
          list_name: 'Backlog',
          labels: [],
          assignees: [],
          custom_fields: {
            'Estimated Hours': 8,
            'Client Approved': true,
            'Delivery URL': 'https://example.com',
          },
        },
        user: { name: 'PM', role: 'department_lead' },
      };

      const result = formatContextForPrompt(context);
      expect(result).toContain('Custom Fields:');
      expect(result).toContain('"Estimated Hours":8');
      expect(result).toContain('"Client Approved":true');
      expect(result).toContain('"Delivery URL":"https://example.com"');
    });

    it('includes brief data as JSON in formatted output', () => {
      const context: ChatContext = {
        scope: 'ticket',
        card: {
          id: 'c5',
          title: 'Brief card',
          description: null,
          priority: null,
          list_name: 'Backlog',
          labels: [],
          assignees: [],
          brief_data: {
            target_audience: 'Young professionals',
            key_message: 'Affordable luxury',
            deliverables: ['banner', 'social post'],
          },
        },
        user: { name: 'Creative', role: 'member' },
      };

      const result = formatContextForPrompt(context);
      expect(result).toContain('Brief:');
      expect(result).toContain('"target_audience":"Young professionals"');
      expect(result).toContain('"key_message":"Affordable luxury"');
    });

    it('omits custom fields and brief when not present', () => {
      const context: ChatContext = {
        scope: 'ticket',
        card: {
          id: 'c6',
          title: 'Plain card',
          description: null,
          priority: null,
          list_name: 'Backlog',
          labels: [],
          assignees: [],
        },
        user: { name: 'Dev', role: 'member' },
      };

      const result = formatContextForPrompt(context);
      expect(result).not.toContain('Custom Fields:');
      expect(result).not.toContain('Brief:');
    });
  });

  // ===========================================================================
  // formatContextForPrompt — recent comments
  // ===========================================================================

  describe('formatContextForPrompt — recent comments', () => {
    it('includes recent comments as a bulleted list', () => {
      const context: ChatContext = {
        scope: 'ticket',
        card: {
          id: 'c7',
          title: 'Commented card',
          description: null,
          priority: null,
          list_name: 'In Review',
          labels: [],
          assignees: [],
          recent_comments: [
            'Looks good, just needs a few tweaks.',
            'Updated the header spacing.',
            'Ready for final review.',
          ],
        },
        user: { name: 'Reviewer', role: 'member' },
      };

      const result = formatContextForPrompt(context);
      expect(result).toContain('Recent Comments:');
      expect(result).toContain('- Looks good, just needs a few tweaks.');
      expect(result).toContain('- Updated the header spacing.');
      expect(result).toContain('- Ready for final review.');
    });

    it('omits recent comments section when array is empty', () => {
      const context: ChatContext = {
        scope: 'ticket',
        card: {
          id: 'c8',
          title: 'No comments card',
          description: null,
          priority: null,
          list_name: 'Backlog',
          labels: [],
          assignees: [],
          recent_comments: [],
        },
        user: { name: 'Dev', role: 'member' },
      };

      const result = formatContextForPrompt(context);
      expect(result).not.toContain('Recent Comments:');
    });

    it('omits recent comments section when not provided', () => {
      const context: ChatContext = {
        scope: 'ticket',
        card: {
          id: 'c9',
          title: 'Minimal card',
          description: null,
          priority: null,
          list_name: 'Backlog',
          labels: [],
          assignees: [],
        },
        user: { name: 'Dev', role: 'member' },
      };

      const result = formatContextForPrompt(context);
      expect(result).not.toContain('Recent Comments:');
    });
  });
});
