import { describe, it, expect } from 'vitest';
import {
  getDefaultConfig,
  getAllActivities,
  ACTIVITY_LABELS,
} from '@/lib/ai/model-resolver';
import type { AIActivity, AIProvider } from '@/lib/types';

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

const VALID_PROVIDERS: AIProvider[] = ['anthropic', 'openai', 'google'];

describe('AI Model Resolver (P2.0)', () => {
  // ===========================================================================
  // getAllActivities
  // ===========================================================================

  describe('getAllActivities', () => {
    it('returns all 10 activities', () => {
      const activities = getAllActivities();
      expect(activities).toHaveLength(10);
    });

    it('includes every known activity', () => {
      const activities = getAllActivities();
      for (const activity of ALL_ACTIVITIES) {
        expect(activities, `missing activity: ${activity}`).toContain(activity);
      }
    });
  });

  // ===========================================================================
  // ACTIVITY_LABELS
  // ===========================================================================

  describe('ACTIVITY_LABELS', () => {
    it('has a label for every activity', () => {
      for (const activity of ALL_ACTIVITIES) {
        expect(
          ACTIVITY_LABELS[activity],
          `missing label for: ${activity}`
        ).toBeDefined();
      }
    });

    it('has exactly 10 labels', () => {
      expect(Object.keys(ACTIVITY_LABELS)).toHaveLength(10);
    });

    it('all label values are non-empty strings', () => {
      for (const [activity, label] of Object.entries(ACTIVITY_LABELS)) {
        expect(typeof label, `${activity} label should be a string`).toBe('string');
        expect(label.length, `${activity} label should be non-empty`).toBeGreaterThan(0);
      }
    });

    it('has expected label for chatbot_ticket', () => {
      expect(ACTIVITY_LABELS.chatbot_ticket).toBe('Chatbot (Ticket)');
    });

    it('has expected label for chatbot_board', () => {
      expect(ACTIVITY_LABELS.chatbot_board).toBe('Chatbot (Board)');
    });

    it('has expected label for chatbot_global', () => {
      expect(ACTIVITY_LABELS.chatbot_global).toBe('Chatbot (Global)');
    });

    it('has expected label for email_draft', () => {
      expect(ACTIVITY_LABELS.email_draft).toBe('Email Draft');
    });

    it('has expected label for proposal_generation', () => {
      expect(ACTIVITY_LABELS.proposal_generation).toBe('Proposal Generation');
    });

    it('has expected label for lead_triage', () => {
      expect(ACTIVITY_LABELS.lead_triage).toBe('Lead Triage');
    });

    it('has expected label for follow_up_draft', () => {
      expect(ACTIVITY_LABELS.follow_up_draft).toBe('Follow-Up Draft');
    });

    it('has expected label for friendor_email', () => {
      expect(ACTIVITY_LABELS.friendor_email).toBe('Friendor Email');
    });
  });

  // ===========================================================================
  // getDefaultConfig
  // ===========================================================================

  describe('getDefaultConfig', () => {
    it('returns a config for every AIActivity', () => {
      for (const activity of ALL_ACTIVITIES) {
        const config = getDefaultConfig(activity);
        expect(config, `missing default config for: ${activity}`).toBeDefined();
      }
    });

    it('every config has a valid provider', () => {
      for (const activity of ALL_ACTIVITIES) {
        const config = getDefaultConfig(activity);
        expect(
          VALID_PROVIDERS,
          `${activity} has invalid provider: ${config.provider}`
        ).toContain(config.provider);
      }
    });

    it('every config has a non-empty model_id string', () => {
      for (const activity of ALL_ACTIVITIES) {
        const config = getDefaultConfig(activity);
        expect(typeof config.model_id).toBe('string');
        expect(config.model_id.length).toBeGreaterThan(0);
      }
    });

    it('every config has temperature between 0 and 1', () => {
      for (const activity of ALL_ACTIVITIES) {
        const config = getDefaultConfig(activity);
        expect(
          config.temperature,
          `${activity} temperature ${config.temperature} out of [0, 1]`
        ).toBeGreaterThanOrEqual(0);
        expect(
          config.temperature,
          `${activity} temperature ${config.temperature} out of [0, 1]`
        ).toBeLessThanOrEqual(1);
      }
    });

    it('every config has positive max_tokens', () => {
      for (const activity of ALL_ACTIVITIES) {
        const config = getDefaultConfig(activity);
        expect(
          config.max_tokens,
          `${activity} max_tokens should be positive`
        ).toBeGreaterThan(0);
      }
    });

    it('chatbot_ticket defaults to anthropic/claude-sonnet-4-5-20250929', () => {
      const config = getDefaultConfig('chatbot_ticket');
      expect(config.provider).toBe('anthropic');
      expect(config.model_id).toBe('claude-sonnet-4-5-20250929');
      expect(config.temperature).toBe(0.7);
      expect(config.max_tokens).toBe(2048);
    });

    it('proposal_generation defaults to anthropic/claude-sonnet-4-5-20250929', () => {
      const config = getDefaultConfig('proposal_generation');
      expect(config.provider).toBe('anthropic');
      expect(config.model_id).toBe('claude-sonnet-4-5-20250929');
      expect(config.temperature).toBe(0.5);
      expect(config.max_tokens).toBe(4096);
    });

    it('lead_triage defaults to anthropic/claude-haiku-4-5-20251001', () => {
      const config = getDefaultConfig('lead_triage');
      expect(config.provider).toBe('anthropic');
      expect(config.model_id).toBe('claude-haiku-4-5-20251001');
      expect(config.temperature).toBe(0.3);
      expect(config.max_tokens).toBe(2048);
    });

    it('brief_assist defaults to anthropic/claude-haiku-4-5-20251001', () => {
      const config = getDefaultConfig('brief_assist');
      expect(config.provider).toBe('anthropic');
      expect(config.model_id).toBe('claude-haiku-4-5-20251001');
    });
  });
});
