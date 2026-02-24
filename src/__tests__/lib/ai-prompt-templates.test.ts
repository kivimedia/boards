import { describe, it, expect } from 'vitest';
import {
  SYSTEM_PROMPTS,
  getSystemPrompt,
  buildPrompt,
  buildDesignReviewPrompt,
  buildDevQAPrompt,
  buildEmailDraftPrompt,
} from '@/lib/ai/prompt-templates';
import type { AIActivity } from '@/lib/types';

const ALL_ACTIVITIES: AIActivity[] = [
  'design_review',
  'dev_qa',
  'chatbot_ticket',
  'chatbot_board',
  'chatbot_global',
  'client_brain',
  'nano_banana_edit',
  'nano_banana_generate',
  'email_draft',
  'video_generation',
  'brief_assist',
  'agent_execution',
  'agent_standalone_execution',
  'web_research',
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

    it('has exactly 16 system prompts', () => {
      expect(Object.keys(SYSTEM_PROMPTS)).toHaveLength(16);
    });

    it('all system prompts are non-empty strings', () => {
      for (const [activity, prompt] of Object.entries(SYSTEM_PROMPTS)) {
        expect(typeof prompt, `${activity} prompt should be a string`).toBe('string');
        expect(prompt.length, `${activity} prompt should be non-empty`).toBeGreaterThan(0);
      }
    });

    it('design_review prompt mentions design and review', () => {
      expect(SYSTEM_PROMPTS.design_review.toLowerCase()).toContain('design');
      expect(SYSTEM_PROMPTS.design_review.toLowerCase()).toContain('review');
    });

    it('dev_qa prompt mentions QA', () => {
      expect(SYSTEM_PROMPTS.dev_qa.toLowerCase()).toContain('qa');
    });

    it('email_draft prompt mentions email', () => {
      expect(SYSTEM_PROMPTS.email_draft.toLowerCase()).toContain('email');
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

    it('returns a string for design_review', () => {
      const prompt = getSystemPrompt('design_review');
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
  // buildDesignReviewPrompt
  // ===========================================================================

  describe('buildDesignReviewPrompt', () => {
    it('includes the brief summary', () => {
      const result = buildDesignReviewPrompt(
        ['Fix logo placement'],
        'Brand refresh project'
      );
      expect(result).toContain('Brand refresh project');
    });

    it('includes all change requests', () => {
      const changeRequests = ['Fix header color', 'Resize banner', 'Update font'];
      const result = buildDesignReviewPrompt(changeRequests, 'Test brief');
      expect(result).toContain('1. Fix header color');
      expect(result).toContain('2. Resize banner');
      expect(result).toContain('3. Update font');
    });

    it('contains "Brief Summary" and "Change Requests" sections', () => {
      const result = buildDesignReviewPrompt(['Item'], 'Brief text');
      expect(result).toContain('## Brief Summary');
      expect(result).toContain('## Change Requests to Evaluate');
    });

    it('mentions JSON format in the output instructions', () => {
      const result = buildDesignReviewPrompt(['Item'], 'Brief text');
      expect(result.toLowerCase()).toContain('json');
    });

    it('mentions PASS/FAIL/PARTIAL verdicts', () => {
      const result = buildDesignReviewPrompt(['Item'], 'Brief text');
      expect(result).toContain('PASS');
      expect(result).toContain('FAIL');
      expect(result).toContain('PARTIAL');
    });
  });

  // ===========================================================================
  // buildDevQAPrompt
  // ===========================================================================

  describe('buildDevQAPrompt', () => {
    it('includes the page URL', () => {
      const result = buildDevQAPrompt(
        'https://example.com/page',
        '1920x1080',
        ['Check button alignment']
      );
      expect(result).toContain('https://example.com/page');
    });

    it('includes the viewport', () => {
      const result = buildDevQAPrompt(
        'https://example.com',
        '1920x1080',
        ['Check layout']
      );
      expect(result).toContain('1920x1080');
    });

    it('includes all checklist items', () => {
      const items = ['Check header', 'Check footer', 'Check sidebar'];
      const result = buildDevQAPrompt('https://example.com', '1920x1080', items);
      expect(result).toContain('1. Check header');
      expect(result).toContain('2. Check footer');
      expect(result).toContain('3. Check sidebar');
    });

    it('contains "QA Checklist" section', () => {
      const result = buildDevQAPrompt('https://example.com', '1920x1080', ['Item']);
      expect(result).toContain('## QA Checklist');
    });

    it('mentions JSON format in the output instructions', () => {
      const result = buildDevQAPrompt('https://example.com', '1920x1080', ['Item']);
      expect(result.toLowerCase()).toContain('json');
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

    it('includes next meeting date when provided', () => {
      const result = buildEmailDraftPrompt(
        'Client',
        'casual',
        ['Deliverable'],
        [],
        [],
        '2026-03-15'
      );
      expect(result).toContain('2026-03-15');
      expect(result).toContain('Next Meeting');
    });

    it('omits next meeting section when not provided', () => {
      const result = buildEmailDraftPrompt(
        'Client',
        'casual',
        ['Deliverable'],
        [],
        []
      );
      expect(result).not.toContain('Next Meeting');
    });

    it('handles all three tones (formal, friendly, casual)', () => {
      for (const tone of ['formal', 'friendly', 'casual'] as const) {
        const result = buildEmailDraftPrompt('Client', tone, [], [], []);
        expect(result).toContain(tone);
      }
    });
  });
});
