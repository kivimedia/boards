import { describe, expect, it } from 'vitest';
import {
  getSyncCapabilities,
  sumAnthropicCosts,
  sumAnthropicUsage,
  sumOpenAICosts,
  sumOpenAIUsage,
} from '@/lib/ai/ops-sync';

describe('ai ops sync helpers', () => {
  it('sums OpenAI costs across cost buckets', () => {
    const total = sumOpenAICosts([
      { results: [{ amount: { value: 12.5 } }, { amount: { value: '3.25' } }] },
      { results: [{ amount: { value: 1 } }] },
    ]);

    expect(total).toBe(16.75);
  });

  it('sums OpenAI token usage and requests', () => {
    const usage = sumOpenAIUsage([
      {
        results: [
          { input_tokens: 1000, output_tokens: 250, input_cached_tokens: 50, num_model_requests: 2 },
          { input_tokens: 500, output_tokens: 100, total_tokens: 700, num_model_requests: 1 },
        ],
      },
    ]);

    expect(usage.requestCount).toBe(3);
    expect(usage.inputTokens).toBe(1500);
    expect(usage.outputTokens).toBe(350);
    expect(usage.totalTokens).toBe(2000);
  });

  it('sums Anthropic costs in cents into USD', () => {
    const total = sumAnthropicCosts([
      { results: [{ cost_cents: 1234 }, { cost_cents: 66 }] },
    ]);

    expect(total).toBe(13);
  });

  it('sums Anthropic token usage including cache tokens', () => {
    const usage = sumAnthropicUsage([
      {
        results: [
          {
            input_tokens: 100,
            output_tokens: 50,
            cache_creation_input_tokens: 25,
            cache_read_input_tokens: 10,
            requests: 2,
          },
        ],
      },
    ]);

    expect(usage.requestCount).toBe(2);
    expect(usage.inputTokens).toBe(135);
    expect(usage.outputTokens).toBe(50);
    expect(usage.totalTokens).toBe(185);
  });

  it('declares the expected sync coverage modes', () => {
    const capabilities = getSyncCapabilities();

    expect(capabilities.find((entry) => entry.providerKey === 'openai')?.syncMode).toBe('live_admin');
    expect(capabilities.find((entry) => entry.providerKey === 'anthropic')?.syncMode).toBe('live_admin');
    expect(capabilities.find((entry) => entry.providerKey === 'google')?.syncMode).toBe('app_usage');
    expect(capabilities.find((entry) => entry.providerKey === 'claude')?.syncMode).toBe('manual');
  });
});
