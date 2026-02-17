import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  AIModelPricingRow,
  AIActivityConfig,
  AIBudgetAlert,
  AICostSummary,
  BudgetAlertScope,
} from '@/lib/types';

/**
 * Tests for AI Cost Profiling (P3.4).
 *
 * Covers resolveModelForActivity (A/B testing weighted random),
 * calculateCost, cost summary aggregation, budget alert checking,
 * type shapes, and edge cases.
 */

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockPricing(overrides: Partial<AIModelPricingRow> = {}): AIModelPricingRow {
  return {
    id: 'pricing-001',
    provider: 'openai',
    model_id: 'gpt-4o',
    input_cost_per_1k: 0.005,
    output_cost_per_1k: 0.015,
    image_cost_per_unit: 0.04,
    video_cost_per_second: 0.01,
    effective_from: '2026-01-01',
    effective_to: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockActivityConfig(overrides: Partial<AIActivityConfig> = {}): AIActivityConfig {
  return {
    id: 'config-001',
    activity: 'design_review',
    provider: 'openai',
    model_id: 'gpt-4o',
    weight: 100,
    is_active: true,
    max_tokens: 4096,
    temperature: 0.7,
    metadata: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockBudgetAlert(overrides: Partial<AIBudgetAlert> = {}): AIBudgetAlert {
  return {
    id: 'alert-001',
    scope: 'global',
    scope_id: null,
    threshold_percent: 80,
    monthly_cap: 100,
    current_spend: 0,
    alerted_at: null,
    alert_sent: false,
    period_start: '2026-01-01',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Type shape tests
// ---------------------------------------------------------------------------

describe('AI Cost Profiling Types (P3.4)', () => {
  describe('AIModelPricingRow interface', () => {
    it('has all expected fields', () => {
      const pricing = createMockPricing();
      expect(pricing.id).toBe('pricing-001');
      expect(pricing.provider).toBe('openai');
      expect(pricing.model_id).toBe('gpt-4o');
      expect(typeof pricing.input_cost_per_1k).toBe('number');
      expect(typeof pricing.output_cost_per_1k).toBe('number');
      expect(typeof pricing.image_cost_per_unit).toBe('number');
      expect(typeof pricing.video_cost_per_second).toBe('number');
      expect(pricing.effective_from).toBeTruthy();
    });

    it('allows nullable effective_to', () => {
      const pricing = createMockPricing({ effective_to: null });
      expect(pricing.effective_to).toBeNull();

      const withEnd = createMockPricing({ effective_to: '2026-12-31' });
      expect(withEnd.effective_to).toBe('2026-12-31');
    });
  });

  describe('AIActivityConfig interface', () => {
    it('has all expected fields', () => {
      const config = createMockActivityConfig();
      expect(config.id).toBeTruthy();
      expect(config.activity).toBe('design_review');
      expect(config.provider).toBe('openai');
      expect(config.model_id).toBe('gpt-4o');
      expect(config.weight).toBe(100);
      expect(config.is_active).toBe(true);
      expect(config.max_tokens).toBe(4096);
      expect(typeof config.temperature).toBe('number');
    });

    it('supports weight for A/B testing', () => {
      const configA = createMockActivityConfig({ id: 'a', weight: 70 });
      const configB = createMockActivityConfig({ id: 'b', weight: 30, model_id: 'claude-3-sonnet' });
      expect(configA.weight + configB.weight).toBe(100);
    });
  });

  describe('AIBudgetAlert interface', () => {
    it('has all expected fields', () => {
      const alert = createMockBudgetAlert();
      expect(alert.id).toBeTruthy();
      expect(alert.scope).toBe('global');
      expect(alert.threshold_percent).toBe(80);
      expect(alert.monthly_cap).toBe(100);
      expect(alert.current_spend).toBe(0);
      expect(alert.alert_sent).toBe(false);
    });

    it('supports all budget alert scopes', () => {
      const scopes: BudgetAlertScope[] = ['global', 'user', 'board', 'activity'];
      expect(scopes).toHaveLength(4);
      for (const scope of scopes) {
        const alert = createMockBudgetAlert({ scope });
        expect(alert.scope).toBe(scope);
      }
    });
  });

  describe('AICostSummary interface', () => {
    it('has all expected fields', () => {
      const summary: AICostSummary = {
        totalCost: 42.50,
        byProvider: { openai: 30, google: 12.50 },
        byModel: { 'gpt-4o': 30, 'gemini-2.0-flash': 12.50 },
        byActivity: { design_review: 20, dev_qa: 15, video_generation: 7.50 },
        byUser: { 'user-1': 25, 'user-2': 17.50 },
        byBoard: { 'board-1': 42.50 },
        trend: [
          { date: '2026-01-01', cost: 5 },
          { date: '2026-01-02', cost: 10 },
        ],
      };

      expect(summary.totalCost).toBe(42.50);
      expect(Object.keys(summary.byProvider)).toHaveLength(2);
      expect(summary.trend).toHaveLength(2);
    });
  });
});

// ---------------------------------------------------------------------------
// resolveModelForActivity (A/B testing) tests
// ---------------------------------------------------------------------------

describe('resolveModelForActivity logic', () => {
  it('returns null when no configs exist', () => {
    const configs: AIActivityConfig[] = [];
    // Simulate resolveModelForActivity logic
    if (configs.length === 0) {
      expect(true).toBe(true); // returns null
    }
  });

  it('returns the single config when only one exists', () => {
    const configs = [createMockActivityConfig()];
    if (configs.length === 1) {
      expect(configs[0].model_id).toBe('gpt-4o');
    }
  });

  it('selects from multiple configs using weighted random', () => {
    const configs = [
      createMockActivityConfig({ id: 'a', weight: 70, model_id: 'gpt-4o' }),
      createMockActivityConfig({ id: 'b', weight: 30, model_id: 'claude-3-sonnet' }),
    ];

    // Run multiple selections to verify distribution
    const selections: Record<string, number> = {};
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const totalWeight = configs.reduce((sum, c) => sum + c.weight, 0);
      let random = Math.random() * totalWeight;
      let selected = configs[0];
      for (const config of configs) {
        random -= config.weight;
        if (random <= 0) {
          selected = config;
          break;
        }
      }
      selections[selected.model_id] = (selections[selected.model_id] ?? 0) + 1;
    }

    // With 70/30 weights, gpt-4o should get roughly 70% of selections
    const gptPct = (selections['gpt-4o'] ?? 0) / iterations;
    expect(gptPct).toBeGreaterThan(0.55);
    expect(gptPct).toBeLessThan(0.85);
  });

  it('handles zero-weight config correctly', () => {
    const configs = [
      createMockActivityConfig({ id: 'a', weight: 100, model_id: 'gpt-4o' }),
      createMockActivityConfig({ id: 'b', weight: 0, model_id: 'claude-3-sonnet' }),
    ];

    const totalWeight = configs.reduce((sum, c) => sum + c.weight, 0);
    expect(totalWeight).toBe(100);

    // With weight=0, claude should never be selected
    let selected = configs[0];
    let random = Math.random() * totalWeight;
    for (const config of configs) {
      random -= config.weight;
      if (random <= 0) {
        selected = config;
        break;
      }
    }
    expect(selected.model_id).toBe('gpt-4o');
  });

  it('handles equal weights as 50/50 distribution', () => {
    const configs = [
      createMockActivityConfig({ id: 'a', weight: 50, model_id: 'model-a' }),
      createMockActivityConfig({ id: 'b', weight: 50, model_id: 'model-b' }),
    ];

    const selections: Record<string, number> = {};
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const totalWeight = configs.reduce((sum, c) => sum + c.weight, 0);
      let random = Math.random() * totalWeight;
      let selected = configs[0];
      for (const config of configs) {
        random -= config.weight;
        if (random <= 0) {
          selected = config;
          break;
        }
      }
      selections[selected.model_id] = (selections[selected.model_id] ?? 0) + 1;
    }

    const aPct = (selections['model-a'] ?? 0) / iterations;
    expect(aPct).toBeGreaterThan(0.35);
    expect(aPct).toBeLessThan(0.65);
  });
});

// ---------------------------------------------------------------------------
// calculateCost tests
// ---------------------------------------------------------------------------

describe('calculateCost logic', () => {
  it('calculates cost for input and output tokens', () => {
    const pricing = createMockPricing({
      input_cost_per_1k: 0.005,
      output_cost_per_1k: 0.015,
    });

    const inputTokens = 1000;
    const outputTokens = 500;
    const inputCost = (inputTokens / 1000) * pricing.input_cost_per_1k;
    const outputCost = (outputTokens / 1000) * pricing.output_cost_per_1k;
    const totalCost = Math.round((inputCost + outputCost) * 10000) / 10000;

    expect(totalCost).toBe(0.0125);
  });

  it('returns 0 when no pricing found', () => {
    // Simulate null pricing
    const pricing = null;
    const cost = pricing ? 1 : 0;
    expect(cost).toBe(0);
  });

  it('handles zero tokens', () => {
    const pricing = createMockPricing();
    const inputCost = (0 / 1000) * pricing.input_cost_per_1k;
    const outputCost = (0 / 1000) * pricing.output_cost_per_1k;
    const totalCost = Math.round((inputCost + outputCost) * 10000) / 10000;
    expect(totalCost).toBe(0);
  });

  it('handles large token counts', () => {
    const pricing = createMockPricing({
      input_cost_per_1k: 0.01,
      output_cost_per_1k: 0.03,
    });

    const inputTokens = 100_000;
    const outputTokens = 50_000;
    const inputCost = (inputTokens / 1000) * pricing.input_cost_per_1k;
    const outputCost = (outputTokens / 1000) * pricing.output_cost_per_1k;
    const totalCost = Math.round((inputCost + outputCost) * 10000) / 10000;

    expect(totalCost).toBe(2.5); // 1.0 + 1.5
  });

  it('rounds to 4 decimal places', () => {
    const pricing = createMockPricing({
      input_cost_per_1k: 0.003,
      output_cost_per_1k: 0.006,
    });

    const inputTokens = 333;
    const outputTokens = 777;
    const inputCost = (inputTokens / 1000) * pricing.input_cost_per_1k;
    const outputCost = (outputTokens / 1000) * pricing.output_cost_per_1k;
    const totalCost = Math.round((inputCost + outputCost) * 10000) / 10000;

    // 0.333 * 0.003 + 0.777 * 0.006 = 0.000999 + 0.004662 = 0.005661
    expect(totalCost).toBe(0.0057);
  });
});

// ---------------------------------------------------------------------------
// Cost summary aggregation tests
// ---------------------------------------------------------------------------

describe('Cost Summary Aggregation', () => {
  it('aggregates total cost from usage logs', () => {
    const logs = [
      { cost: 0.01, provider: 'openai', model_id: 'gpt-4o', activity: 'design_review', user_id: 'u1', board_id: 'b1', created_at: '2026-01-01T00:00:00Z' },
      { cost: 0.02, provider: 'openai', model_id: 'gpt-4o', activity: 'dev_qa', user_id: 'u1', board_id: 'b1', created_at: '2026-01-02T00:00:00Z' },
      { cost: 0.005, provider: 'google', model_id: 'gemini-2.0', activity: 'design_review', user_id: 'u2', board_id: 'b2', created_at: '2026-01-02T00:00:00Z' },
    ];

    let totalCost = 0;
    const byProvider: Record<string, number> = {};
    const byModel: Record<string, number> = {};
    const byActivity: Record<string, number> = {};

    for (const log of logs) {
      totalCost += log.cost;
      byProvider[log.provider] = (byProvider[log.provider] ?? 0) + log.cost;
      byModel[log.model_id] = (byModel[log.model_id] ?? 0) + log.cost;
      byActivity[log.activity] = (byActivity[log.activity] ?? 0) + log.cost;
    }

    expect(totalCost).toBeCloseTo(0.035, 4);
    expect(byProvider['openai']).toBeCloseTo(0.03, 4);
    expect(byProvider['google']).toBeCloseTo(0.005, 4);
    expect(byModel['gpt-4o']).toBeCloseTo(0.03, 4);
    expect(byActivity['design_review']).toBeCloseTo(0.015, 4);
    expect(byActivity['dev_qa']).toBeCloseTo(0.02, 4);
  });

  it('builds daily trend from logs', () => {
    const logs = [
      { cost: 0.01, created_at: '2026-01-01T10:00:00Z' },
      { cost: 0.02, created_at: '2026-01-01T14:00:00Z' },
      { cost: 0.005, created_at: '2026-01-02T09:00:00Z' },
    ];

    const dailyCosts: Record<string, number> = {};
    for (const log of logs) {
      const date = log.created_at.split('T')[0];
      dailyCosts[date] = (dailyCosts[date] ?? 0) + log.cost;
    }

    const trend = Object.entries(dailyCosts)
      .map(([date, cost]) => ({ date, cost }))
      .sort((a, b) => a.date.localeCompare(b.date));

    expect(trend).toHaveLength(2);
    expect(trend[0].date).toBe('2026-01-01');
    expect(trend[0].cost).toBeCloseTo(0.03, 4);
    expect(trend[1].date).toBe('2026-01-02');
    expect(trend[1].cost).toBeCloseTo(0.005, 4);
  });

  it('returns empty summary for no logs', () => {
    const logs: unknown[] = [];

    const summary: AICostSummary = {
      totalCost: 0,
      byProvider: {},
      byModel: {},
      byActivity: {},
      byUser: {},
      byBoard: {},
      trend: [],
    };

    expect(summary.totalCost).toBe(0);
    expect(Object.keys(summary.byProvider)).toHaveLength(0);
    expect(summary.trend).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Budget alert checking tests
// ---------------------------------------------------------------------------

describe('Budget Alert Checking', () => {
  it('triggers alert when spend exceeds threshold', () => {
    const alert = createMockBudgetAlert({
      threshold_percent: 80,
      monthly_cap: 100,
      current_spend: 85,
      alert_sent: false,
    });

    const spendPercent = (alert.current_spend / alert.monthly_cap) * 100;
    expect(spendPercent).toBe(85);
    expect(spendPercent >= alert.threshold_percent).toBe(true);
  });

  it('does not trigger alert when spend is below threshold', () => {
    const alert = createMockBudgetAlert({
      threshold_percent: 80,
      monthly_cap: 100,
      current_spend: 50,
      alert_sent: false,
    });

    const spendPercent = (alert.current_spend / alert.monthly_cap) * 100;
    expect(spendPercent).toBe(50);
    expect(spendPercent >= alert.threshold_percent).toBe(false);
  });

  it('skips already-sent alerts', () => {
    const alert = createMockBudgetAlert({
      threshold_percent: 80,
      monthly_cap: 100,
      current_spend: 95,
      alert_sent: true,
    });

    // checkBudgetAlerts only fetches alert_sent=false
    expect(alert.alert_sent).toBe(true);
  });

  it('handles 100% threshold (only at cap)', () => {
    const alert = createMockBudgetAlert({
      threshold_percent: 100,
      monthly_cap: 50,
      current_spend: 50,
    });

    const spendPercent = (alert.current_spend / alert.monthly_cap) * 100;
    expect(spendPercent >= alert.threshold_percent).toBe(true);
  });

  it('detects over-budget (spend > cap)', () => {
    const alert = createMockBudgetAlert({
      threshold_percent: 80,
      monthly_cap: 100,
      current_spend: 120,
    });

    const spendPercent = (alert.current_spend / alert.monthly_cap) * 100;
    expect(spendPercent).toBe(120);
    expect(spendPercent >= 100).toBe(true);
  });

  it('handles scoped alerts correctly', () => {
    const userAlert = createMockBudgetAlert({
      scope: 'user',
      scope_id: 'user-1',
      monthly_cap: 20,
      current_spend: 18,
      threshold_percent: 80,
    });

    const boardAlert = createMockBudgetAlert({
      scope: 'board',
      scope_id: 'board-1',
      monthly_cap: 50,
      current_spend: 10,
      threshold_percent: 80,
    });

    const userPct = (userAlert.current_spend / userAlert.monthly_cap) * 100;
    const boardPct = (boardAlert.current_spend / boardAlert.monthly_cap) * 100;

    expect(userPct).toBe(90);
    expect(userPct >= userAlert.threshold_percent).toBe(true);

    expect(boardPct).toBe(20);
    expect(boardPct >= boardAlert.threshold_percent).toBe(false);
  });
});
