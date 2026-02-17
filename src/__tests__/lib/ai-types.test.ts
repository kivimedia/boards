import { describe, it, expect } from 'vitest';
import type {
  AIProvider,
  AIActivity,
  AIBudgetScope,
  AIUsageStatus,
  AIApiKey,
  AIModelConfig,
  AIUsageLogEntry,
  AIBudgetConfig,
  AIBudgetStatus,
  AIModelPricing,
} from '@/lib/types';

/**
 * Type-shape tests for AI infrastructure types (P2.0).
 *
 * These tests verify that the type definitions compile correctly and that
 * sample objects conforming to each interface contain all expected fields.
 * The assertions run at both compile time (TypeScript) and runtime (Vitest).
 */

describe('AI Types (P2.0)', () => {
  // ===========================================================================
  // AIProvider
  // ===========================================================================

  describe('AIProvider', () => {
    it('covers all 4 providers', () => {
      const providers: AIProvider[] = ['anthropic', 'openai', 'google', 'browserless'];
      expect(providers).toHaveLength(4);
      // Verify each value is a string at runtime
      for (const p of providers) {
        expect(typeof p).toBe('string');
      }
    });
  });

  // ===========================================================================
  // AIActivity
  // ===========================================================================

  describe('AIActivity', () => {
    it('covers all 11 activities', () => {
      const activities: AIActivity[] = [
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
      ];
      expect(activities).toHaveLength(11);
      for (const a of activities) {
        expect(typeof a).toBe('string');
      }
    });
  });

  // ===========================================================================
  // AIBudgetScope
  // ===========================================================================

  describe('AIBudgetScope', () => {
    it('covers all 6 scopes', () => {
      const scopes: AIBudgetScope[] = [
        'global',
        'provider',
        'activity',
        'user',
        'board',
        'client',
      ];
      expect(scopes).toHaveLength(6);
      for (const s of scopes) {
        expect(typeof s).toBe('string');
      }
    });
  });

  // ===========================================================================
  // AIUsageStatus
  // ===========================================================================

  describe('AIUsageStatus', () => {
    it('covers all 4 statuses', () => {
      const statuses: AIUsageStatus[] = [
        'success',
        'error',
        'budget_blocked',
        'rate_limited',
      ];
      expect(statuses).toHaveLength(4);
      for (const s of statuses) {
        expect(typeof s).toBe('string');
      }
    });
  });

  // ===========================================================================
  // AIApiKey interface
  // ===========================================================================

  describe('AIApiKey interface', () => {
    it('has all expected fields', () => {
      const sample: AIApiKey = {
        id: 'key-1',
        provider: 'anthropic',
        label: 'Production Key',
        key_encrypted: 'enc_abc123',
        is_active: true,
        last_used_at: '2026-01-15T12:00:00Z',
        created_by: 'user-1',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      expect(sample.id).toBe('key-1');
      expect(sample.provider).toBe('anthropic');
      expect(sample.label).toBe('Production Key');
      expect(sample.key_encrypted).toBe('enc_abc123');
      expect(sample.is_active).toBe(true);
      expect(sample.last_used_at).toBe('2026-01-15T12:00:00Z');
      expect(sample.created_by).toBe('user-1');
      expect(sample.created_at).toBeDefined();
      expect(sample.updated_at).toBeDefined();
    });

    it('allows null for last_used_at and created_by', () => {
      const sample: AIApiKey = {
        id: 'key-2',
        provider: 'openai',
        label: 'Test Key',
        key_encrypted: 'enc_xyz',
        is_active: false,
        last_used_at: null,
        created_by: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      expect(sample.last_used_at).toBeNull();
      expect(sample.created_by).toBeNull();
    });
  });

  // ===========================================================================
  // AIModelConfig interface
  // ===========================================================================

  describe('AIModelConfig interface', () => {
    it('has all expected fields', () => {
      const sample: AIModelConfig = {
        id: 'config-1',
        activity: 'design_review',
        provider: 'anthropic',
        model_id: 'claude-sonnet-4-5-20250929',
        temperature: 0.3,
        max_tokens: 4096,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      expect(sample.id).toBe('config-1');
      expect(sample.activity).toBe('design_review');
      expect(sample.provider).toBe('anthropic');
      expect(sample.model_id).toBe('claude-sonnet-4-5-20250929');
      expect(sample.temperature).toBe(0.3);
      expect(sample.max_tokens).toBe(4096);
      expect(sample.is_active).toBe(true);
      expect(sample.created_at).toBeDefined();
      expect(sample.updated_at).toBeDefined();
    });
  });

  // ===========================================================================
  // AIUsageLogEntry interface
  // ===========================================================================

  describe('AIUsageLogEntry interface', () => {
    it('has all expected fields', () => {
      const sample: AIUsageLogEntry = {
        id: 'log-1',
        user_id: 'user-1',
        board_id: 'board-1',
        card_id: 'card-1',
        client_id: 'client-1',
        activity: 'design_review',
        provider: 'anthropic',
        model_id: 'claude-sonnet-4-5-20250929',
        input_tokens: 1000,
        output_tokens: 500,
        total_tokens: 1500,
        cost_usd: 0.0105,
        latency_ms: 2500,
        status: 'success',
        error_message: null,
        metadata: { revision: 2 },
        created_at: '2026-01-15T12:00:00Z',
      };

      expect(sample.id).toBe('log-1');
      expect(sample.user_id).toBe('user-1');
      expect(sample.board_id).toBe('board-1');
      expect(sample.card_id).toBe('card-1');
      expect(sample.client_id).toBe('client-1');
      expect(sample.activity).toBe('design_review');
      expect(sample.provider).toBe('anthropic');
      expect(sample.model_id).toBe('claude-sonnet-4-5-20250929');
      expect(sample.input_tokens).toBe(1000);
      expect(sample.output_tokens).toBe(500);
      expect(sample.total_tokens).toBe(1500);
      expect(sample.cost_usd).toBe(0.0105);
      expect(sample.latency_ms).toBe(2500);
      expect(sample.status).toBe('success');
      expect(sample.error_message).toBeNull();
      expect(sample.metadata).toEqual({ revision: 2 });
      expect(sample.created_at).toBeDefined();
    });

    it('allows null for optional entity IDs', () => {
      const sample: AIUsageLogEntry = {
        id: 'log-2',
        user_id: null,
        board_id: null,
        card_id: null,
        client_id: null,
        activity: 'chatbot_global',
        provider: 'openai',
        model_id: 'gpt-4o',
        input_tokens: 500,
        output_tokens: 200,
        total_tokens: 700,
        cost_usd: 0.005,
        latency_ms: 1200,
        status: 'error',
        error_message: 'Rate limit exceeded',
        metadata: {},
        created_at: '2026-01-15T12:00:00Z',
      };

      expect(sample.user_id).toBeNull();
      expect(sample.board_id).toBeNull();
      expect(sample.card_id).toBeNull();
      expect(sample.client_id).toBeNull();
      expect(sample.error_message).toBe('Rate limit exceeded');
    });
  });

  // ===========================================================================
  // AIBudgetConfig interface
  // ===========================================================================

  describe('AIBudgetConfig interface', () => {
    it('has all expected fields', () => {
      const sample: AIBudgetConfig = {
        id: 'budget-1',
        scope: 'global',
        scope_id: null,
        monthly_cap_usd: 500,
        alert_threshold_pct: 80,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      expect(sample.id).toBe('budget-1');
      expect(sample.scope).toBe('global');
      expect(sample.scope_id).toBeNull();
      expect(sample.monthly_cap_usd).toBe(500);
      expect(sample.alert_threshold_pct).toBe(80);
      expect(sample.is_active).toBe(true);
      expect(sample.created_at).toBeDefined();
      expect(sample.updated_at).toBeDefined();
    });

    it('allows scope_id for non-global scopes', () => {
      const sample: AIBudgetConfig = {
        id: 'budget-2',
        scope: 'provider',
        scope_id: 'anthropic',
        monthly_cap_usd: 200,
        alert_threshold_pct: 90,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      expect(sample.scope_id).toBe('anthropic');
    });
  });

  // ===========================================================================
  // AIBudgetStatus interface
  // ===========================================================================

  describe('AIBudgetStatus interface', () => {
    it('has all expected fields', () => {
      const sample: AIBudgetStatus = {
        scope: 'global',
        scope_id: null,
        monthly_cap_usd: 500,
        spent_usd: 350,
        remaining_usd: 150,
        usage_pct: 70,
        alert_threshold_pct: 80,
        is_over_budget: false,
        is_alert_triggered: false,
      };

      expect(sample.scope).toBe('global');
      expect(sample.scope_id).toBeNull();
      expect(sample.monthly_cap_usd).toBe(500);
      expect(sample.spent_usd).toBe(350);
      expect(sample.remaining_usd).toBe(150);
      expect(sample.usage_pct).toBe(70);
      expect(sample.alert_threshold_pct).toBe(80);
      expect(sample.is_over_budget).toBe(false);
      expect(sample.is_alert_triggered).toBe(false);
    });
  });

  // ===========================================================================
  // AIModelPricing interface
  // ===========================================================================

  describe('AIModelPricing interface', () => {
    it('has all expected fields', () => {
      const sample: AIModelPricing = {
        provider: 'anthropic',
        model_id: 'claude-sonnet-4-5-20250929',
        input_cost_per_1k: 0.003,
        output_cost_per_1k: 0.015,
      };

      expect(sample.provider).toBe('anthropic');
      expect(sample.model_id).toBe('claude-sonnet-4-5-20250929');
      expect(sample.input_cost_per_1k).toBe(0.003);
      expect(sample.output_cost_per_1k).toBe(0.015);
    });
  });
});
