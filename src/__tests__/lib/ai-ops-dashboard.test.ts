import { describe, expect, it } from 'vitest';
import { buildCapacityCards, buildVendorView, computeOpsAlerts, recommendVendor, type AIVendorAccount } from '@/lib/ai/ops-dashboard';

function makeVendor(overrides: Partial<AIVendorAccount> = {}): AIVendorAccount {
  return {
    id: 'vendor-1',
    owner_user_id: 'user-1',
    provider_key: 'claude',
    provider_name: 'Claude',
    product_type: 'AI subscription',
    category: 'ai_subscription',
    status: 'unknown',
    source_type: 'manual',
    confidence_level: 'low',
    plan_name: 'Pro',
    account_label: null,
    billing_period_start: null,
    billing_period_end: null,
    spend_current_period: 20,
    budget_limit: 100,
    remaining_budget: 80,
    remaining_credits: null,
    estimated_remaining_capacity: 0.7,
    renewal_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    last_synced_at: new Date().toISOString(),
    stale_after: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    no_overage_allowed: false,
    provider_url: null,
    notes: null,
    sync_error: null,
    is_manual: true,
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('ai ops dashboard recommendation', () => {
  it('prefers a recently renewed healthy provider over a near-limit one', () => {
    const risky = buildVendorView(makeVendor({
      id: 'vendor-risky',
      provider_name: 'Claude',
      remaining_budget: 5,
      estimated_remaining_capacity: 0.1,
      renewal_at: null,
    }));
    const healthy = buildVendorView(makeVendor({
      id: 'vendor-safe',
      provider_name: 'OpenAI',
      source_type: 'api_synced',
      stale_after: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      remaining_budget: 60,
      estimated_remaining_capacity: 0.8,
    }));

    const recommendation = recommendVendor([risky, healthy]);
    expect(recommendation.vendorAccountId).toBe('vendor-safe');
    expect(recommendation.title).toContain('OpenAI');
  });

  it('falls back to manual check when all vendors are stale or exhausted', () => {
    const stale = buildVendorView(makeVendor({
      id: 'vendor-stale',
      stale_after: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    }));
    const exhausted = buildVendorView(makeVendor({
      id: 'vendor-exhausted',
      remaining_budget: 0,
      estimated_remaining_capacity: 0,
    }));

    const recommendation = recommendVendor([stale, exhausted]);
    expect(recommendation.vendorAccountId).toBeNull();
    expect(recommendation.title).toContain('Manual check');
  });
});

describe('ai ops dashboard alerts', () => {
  it('escalates low-budget vendors with no-overage enabled', () => {
    const alerts = computeOpsAlerts([
      buildVendorView(makeVendor({
        remaining_budget: 10,
        no_overage_allowed: true,
      })),
    ]);

    expect(alerts.some((alert) => alert.severity === 'critical')).toBe(true);
  });
});

describe('ai ops dashboard capacity cards', () => {
  it('builds a configured card from vendor capacity metadata', () => {
    const cards = buildCapacityCards([
      buildVendorView(makeVendor({
        provider_key: 'claude',
        provider_name: 'Claude Web',
        plan_name: 'Claude Team',
        metadata: {
          capacity_profile: 'claude_team',
          capacity_plan_label: 'Claude Team',
          capacity_tracks: [
            {
              key: 'session_messages',
              label: 'Current session',
              used: 120,
              limit: 225,
              unit: 'messages',
              period: 'session',
              resets_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            },
          ],
        },
      })),
    ]);

    const claudeCard = cards.find((card) => card.profile === 'claude_team');
    expect(claudeCard?.isConfigured).toBe(true);
    expect(claudeCard?.tracks[0]?.limit).toBe(225);
  });

  it('returns placeholders when no manual capacity tracker exists yet', () => {
    const cards = buildCapacityCards([]);

    expect(cards.some((card) => card.profile === 'claude_team' && !card.isConfigured)).toBe(true);
    expect(cards.some((card) => card.profile === 'chatgpt_business' && !card.isConfigured)).toBe(true);
    expect(cards.some((card) => card.profile === 'gemini_ultra' && !card.isConfigured)).toBe(true);
  });
});
