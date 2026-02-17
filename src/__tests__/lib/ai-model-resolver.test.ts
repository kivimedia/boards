import { describe, it, expect } from 'vitest';
import {
  getDefaultConfig,
  getAllActivities,
  ACTIVITY_LABELS,
} from '@/lib/ai/model-resolver';
import type { AIActivity, AIProvider } from '@/lib/types';

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
];

const VALID_PROVIDERS: AIProvider[] = ['anthropic', 'openai', 'google', 'browserless'];

describe('AI Model Resolver (P2.0)', () => {
  // ===========================================================================
  // getAllActivities
  // ===========================================================================

  describe('getAllActivities', () => {
    it('returns all 13 activities', () => {
      const activities = getAllActivities();
      expect(activities).toHaveLength(13);
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

    it('has exactly 13 labels', () => {
      expect(Object.keys(ACTIVITY_LABELS)).toHaveLength(13);
    });

    it('all label values are non-empty strings', () => {
      for (const [activity, label] of Object.entries(ACTIVITY_LABELS)) {
        expect(typeof label, `${activity} label should be a string`).toBe('string');
        expect(label.length, `${activity} label should be non-empty`).toBeGreaterThan(0);
      }
    });

    it('has expected label for design_review', () => {
      expect(ACTIVITY_LABELS.design_review).toBe('Design Review');
    });

    it('has expected label for dev_qa', () => {
      expect(ACTIVITY_LABELS.dev_qa).toBe('Dev QA');
    });

    it('has expected label for video_generation', () => {
      expect(ACTIVITY_LABELS.video_generation).toBe('Video Generation');
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

    it('design_review defaults to anthropic/claude-sonnet-4-5-20250929', () => {
      const config = getDefaultConfig('design_review');
      expect(config.provider).toBe('anthropic');
      expect(config.model_id).toBe('claude-sonnet-4-5-20250929');
      expect(config.temperature).toBe(0.3);
      expect(config.max_tokens).toBe(4096);
    });

    it('nano_banana_edit defaults to google/gemini-2.0-flash-exp', () => {
      const config = getDefaultConfig('nano_banana_edit');
      expect(config.provider).toBe('google');
      expect(config.model_id).toBe('gemini-2.0-flash-exp');
    });

    it('video_generation defaults to openai/sora-2', () => {
      const config = getDefaultConfig('video_generation');
      expect(config.provider).toBe('openai');
      expect(config.model_id).toBe('sora-2');
    });

    it('brief_assist defaults to anthropic/claude-haiku-4-5-20251001', () => {
      const config = getDefaultConfig('brief_assist');
      expect(config.provider).toBe('anthropic');
      expect(config.model_id).toBe('claude-haiku-4-5-20251001');
    });
  });
});
