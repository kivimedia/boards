import { describe, it, expect } from 'vitest';
import {
  SYSTEM_PROMPTS,
  getSystemPrompt,
  buildPrompt,
  buildEmailDraftPrompt,
} from '@/lib/ai/prompt-templates';
import type { AIActivity } from '@/lib/types';

const ALL_ACTIVITIES: AIActivity[] = [
  'chatbot_ticket',
  'chatbot_board',
  'chatbot_global',
  'email_draft',
  'brief_assist',
  'image_prompt_enhance',
  'proposal_generation',
  'lead_triage',
  'follow_up_draft',
  'friendor_email',
];

describe('AI Prompt Templates (P2.0)', () => {
  // ===========================================================================
  // SYSTEM_PROMPTS
  // ===========================================================================

  describe('SYSTEM_PROMPTS', () => {
    it('has a prompt for every AIActivity', () => {
      for (const activity of ALL_ACTIVITIES) {
        expect(
          SYSTEM_PROMPTS[activity],
          `missing system prompt for: ${activity}`
        ).toBeDefined();
      }
    });

    it('has exactly 10 system prompts', () => {
      expect(Object.keys(SYSTEM_PROMPTS)).toHaveLength(10);
    });

    it('all system prompts are non-empty strings', () => {
      for (const [activity, prompt] of Object.entries(SYSTEM_PROMPTS)) {
        expect(typeof prompt, `${activity} prompt should be a string`).toBe('string');
        expect(prompt.length, `${activity} prompt should be non-empty`).toBeGreaterThan(0);
      }
    });

    it('chatbot_ticket prompt mentions Carolina Balloons HQ', () => {
      expect(SYSTEM_PROMPTS.chatbot_ticket).toContain('Carolina Balloons HQ');
    });

    it('email_draft prompt mentions email', () => {
      expect(SYSTEM_PROMPTS.email_draft.toLowerCase()).toContain('email');
    });

    it('email_draft prompt mentions Carolina Balloons', () => {
      expect(SYSTEM_PROMPTS.email_draft).toContain('Carolina Balloons');
    });

    it('proposal_generation prompt mentions proposal', () => {
      expect(SYSTEM_PROMPTS.proposal_generation.toLowerCase()).toContain('proposal');
    });

    it('lead_triage prompt mentions lead', () => {
      expect(SYSTEM_PROMPTS.lead_triage.toLowerCase()).toContain('lead');
    });

    it('friendor_email prompt mentions venue', () => {
      expect(SYSTEM_PROMPTS.friendor_email.toLowerCase()).toContain('venue');
    });
  });

  // ===========================================================================
  // getSystemPrompt
  // ===========================================================================

  describe('getSystemPrompt', () => {
    it('returns correct prompt for each activity', () => {
      for (const activity of ALL_ACTIVITIES) {
        const prompt = getSystemPrompt(activity);
        expect(prompt).toBe(SYSTEM_PROMPTS[activity]);
      }
    });

    it('returns a string for chatbot_ticket', () => {
      const prompt = getSystemPrompt('chatbot_ticket');
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // buildPrompt
  // ===========================================================================

  describe('buildPrompt', () => {
    it('replaces a single placeholder', () => {
      const template = 'Hello {{name}}, welcome!';
      const result = buildPrompt(template, { name: 'Alice' });
      expect(result).toBe('Hello Alice, welcome!');
    });

    it('replaces multiple different placeholders', () => {
      const template = '{{greeting}} {{name}}, you have {{count}} items.';
      const result = buildPrompt(template, {
        greeting: 'Hi',
        name: 'Bob',
        count: '5',
      });
      expect(result).toBe('Hi Bob, you have 5 items.');
    });

    it('replaces multiple occurrences of the same placeholder', () => {
      const template = '{{name}} likes {{name}} things.';
      const result = buildPrompt(template, { name: 'good' });
      expect(result).toBe('good likes good things.');
    });

    it('leaves unreferenced placeholders as-is', () => {
      const template = 'Hello {{name}}, your role is {{role}}.';
      const result = buildPrompt(template, { name: 'Carol' });
      expect(result).toBe('Hello Carol, your role is {{role}}.');
    });

    it('returns template unchanged when context is empty', () => {
      const template = 'No placeholders here {{something}}.';
      const result = buildPrompt(template, {});
      expect(result).toBe('No placeholders here {{something}}.');
    });

    it('handles empty string values', () => {
      const template = 'Value: {{val}}!';
      const result = buildPrompt(template, { val: '' });
      expect(result).toBe('Value: !');
    });
  });

  // ===========================================================================
  // buildEmailDraftPrompt
  // ===========================================================================

  describe('buildEmailDraftPrompt', () => {
    it('includes the client name', () => {
      const result = buildEmailDraftPrompt(
        'Acme Corp',
        'formal',
        ['Website redesign'],
        ['Q2 launch'],
        ['Approve mockups']
      );
      expect(result).toContain('Acme Corp');
    });

    it('includes the tone', () => {
      const result = buildEmailDraftPrompt(
        'Client',
        'friendly',
        [],
        [],
        []
      );
      expect(result).toContain('friendly');
    });

    it('includes deliverables', () => {
      const deliverables = ['Logo v2', 'Brand guide'];
      const result = buildEmailDraftPrompt(
        'Client',
        'formal',
        deliverables,
        [],
        []
      );
      expect(result).toContain('Logo v2');
      expect(result).toContain('Brand guide');
    });

    it('handles empty deliverables array gracefully', () => {
      const result = buildEmailDraftPrompt('Client', 'formal', [], ['Milestone'], ['Action']);
      expect(result).toContain('None this period');
    });

    it('handles empty upcoming milestones array gracefully', () => {
      const result = buildEmailDraftPrompt('Client', 'formal', ['Deliverable'], [], ['Action']);
      expect(result).toContain('None scheduled');
    });

    it('handles empty action items array gracefully', () => {
      const result = buildEmailDraftPrompt('Client', 'formal', ['Deliverable'], ['Milestone'], []);
      expect(result).toContain('None at this time');
    });

    it('includes next date when provided', () => {
      const result = buildEmailDraftPrompt(
        'Client',
        'casual',
        ['Deliverable'],
        [],
        [],
        '2026-03-15'
      );
      expect(result).toContain('2026-03-15');
      expect(result).toContain('Next Date');
    });

    it('omits next date section when not provided', () => {
      const result = buildEmailDraftPrompt(
        'Client',
        'casual',
        ['Deliverable'],
        [],
        []
      );
      expect(result).not.toContain('Next Date');
    });

    it('handles all three tones (formal, friendly, casual)', () => {
      for (const tone of ['formal', 'friendly', 'casual'] as const) {
        const result = buildEmailDraftPrompt('Client', tone, [], [], []);
        expect(result).toContain(tone);
      }
    });
  });
});
