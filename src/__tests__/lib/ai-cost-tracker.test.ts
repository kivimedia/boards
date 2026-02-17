import { describe, it, expect } from 'vitest';
import {
  MODEL_PRICING,
  getModelPricing,
  calculateCost,
} from '@/lib/ai/cost-tracker';
import type { AIProvider } from '@/lib/types';

describe('AI Cost Tracker (P2.0)', () => {
  // ===========================================================================
  // MODEL_PRICING
  // ===========================================================================

  describe('MODEL_PRICING', () => {
    it('has entries for all known Anthropic models', () => {
      const anthropicModels = MODEL_PRICING.filter((p) => p.provider === 'anthropic');
      expect(anthropicModels.length).toBeGreaterThanOrEqual(3);
      const modelIds = anthropicModels.map((p) => p.model_id);
      expect(modelIds).toContain('claude-opus-4-6');
      expect(modelIds).toContain('claude-sonnet-4-5-20250929');
      expect(modelIds).toContain('claude-haiku-4-5-20251001');
    });

    it('has entries for all known OpenAI models', () => {
      const openaiModels = MODEL_PRICING.filter((p) => p.provider === 'openai');
      expect(openaiModels.length).toBeGreaterThanOrEqual(3);
      const modelIds = openaiModels.map((p) => p.model_id);
      expect(modelIds).toContain('gpt-4o');
      expect(modelIds).toContain('gpt-4o-mini');
      expect(modelIds).toContain('sora-2');
    });

    it('has entries for all known Google models', () => {
      const googleModels = MODEL_PRICING.filter((p) => p.provider === 'google');
      expect(googleModels.length).toBeGreaterThanOrEqual(2);
      const modelIds = googleModels.map((p) => p.model_id);
      expect(modelIds).toContain('gemini-2.0-flash-exp');
      expect(modelIds).toContain('gemini-1.5-pro');
    });

    it('has exactly 20 pricing entries', () => {
      expect(MODEL_PRICING).toHaveLength(20);
    });

    it('has no negative cost values', () => {
      for (const pricing of MODEL_PRICING) {
        expect(
          pricing.input_cost_per_1k,
          `${pricing.provider}/${pricing.model_id} input cost should be >= 0`
        ).toBeGreaterThanOrEqual(0);
        expect(
          pricing.output_cost_per_1k,
          `${pricing.provider}/${pricing.model_id} output cost should be >= 0`
        ).toBeGreaterThanOrEqual(0);
      }
    });

    it('output cost is >= input cost for all models (output tokens are more expensive)', () => {
      for (const pricing of MODEL_PRICING) {
        expect(
          pricing.output_cost_per_1k,
          `${pricing.provider}/${pricing.model_id} output should cost >= input`
        ).toBeGreaterThanOrEqual(pricing.input_cost_per_1k);
      }
    });
  });

  // ===========================================================================
  // getModelPricing
  // ===========================================================================

  describe('getModelPricing', () => {
    it('returns correct pricing for anthropic/claude-sonnet-4-5-20250929', () => {
      const pricing = getModelPricing('anthropic', 'claude-sonnet-4-5-20250929');
      expect(pricing).not.toBeNull();
      expect(pricing!.provider).toBe('anthropic');
      expect(pricing!.model_id).toBe('claude-sonnet-4-5-20250929');
      expect(pricing!.input_cost_per_1k).toBe(0.003);
      expect(pricing!.output_cost_per_1k).toBe(0.015);
    });

    it('returns correct pricing for openai/gpt-4o', () => {
      const pricing = getModelPricing('openai', 'gpt-4o');
      expect(pricing).not.toBeNull();
      expect(pricing!.provider).toBe('openai');
      expect(pricing!.model_id).toBe('gpt-4o');
      expect(pricing!.input_cost_per_1k).toBe(0.0025);
      expect(pricing!.output_cost_per_1k).toBe(0.01);
    });

    it('returns correct pricing for google/gemini-2.0-flash-exp', () => {
      const pricing = getModelPricing('google', 'gemini-2.0-flash-exp');
      expect(pricing).not.toBeNull();
      expect(pricing!.provider).toBe('google');
      expect(pricing!.model_id).toBe('gemini-2.0-flash-exp');
      expect(pricing!.input_cost_per_1k).toBe(0.0001);
      expect(pricing!.output_cost_per_1k).toBe(0.0004);
    });

    it('returns null for an unknown model', () => {
      const pricing = getModelPricing('anthropic', 'nonexistent-model');
      expect(pricing).toBeNull();
    });

    it('returns null for an unknown provider', () => {
      const pricing = getModelPricing('browserless' as AIProvider, 'gpt-4o');
      expect(pricing).toBeNull();
    });

    it('returns null when provider is correct but model belongs to a different provider', () => {
      const pricing = getModelPricing('openai', 'claude-sonnet-4-5-20250929');
      expect(pricing).toBeNull();
    });
  });

  // ===========================================================================
  // calculateCost
  // ===========================================================================

  describe('calculateCost', () => {
    it('computes correctly for anthropic/claude-sonnet-4-5-20250929 with 1000 input / 500 output', () => {
      // input: (1000/1000) * 0.003 = 0.003
      // output: (500/1000) * 0.015 = 0.0075
      // total: 0.0105
      const cost = calculateCost('anthropic', 'claude-sonnet-4-5-20250929', 1000, 500);
      expect(cost).toBeCloseTo(0.0105, 6);
    });

    it('computes correctly for openai/gpt-4o-mini with 2000 input / 1000 output', () => {
      // input: (2000/1000) * 0.00015 = 0.0003
      // output: (1000/1000) * 0.0006 = 0.0006
      // total: 0.0009
      const cost = calculateCost('openai', 'gpt-4o-mini', 2000, 1000);
      expect(cost).toBeCloseTo(0.0009, 6);
    });

    it('returns 0 for unknown models', () => {
      const cost = calculateCost('anthropic', 'unknown-model', 1000, 500);
      expect(cost).toBe(0);
    });

    it('handles zero input tokens', () => {
      const cost = calculateCost('anthropic', 'claude-sonnet-4-5-20250929', 0, 1000);
      // output only: (1000/1000) * 0.015 = 0.015
      expect(cost).toBeCloseTo(0.015, 6);
    });

    it('handles zero output tokens', () => {
      const cost = calculateCost('anthropic', 'claude-sonnet-4-5-20250929', 1000, 0);
      // input only: (1000/1000) * 0.003 = 0.003
      expect(cost).toBeCloseTo(0.003, 6);
    });

    it('handles zero tokens for both input and output', () => {
      const cost = calculateCost('anthropic', 'claude-sonnet-4-5-20250929', 0, 0);
      expect(cost).toBe(0);
    });

    it('handles large token counts with precision', () => {
      // 1M input, 500K output using claude-opus-4-6
      // input: (1_000_000/1000) * 0.005 = 5.0
      // output: (500_000/1000) * 0.025 = 12.5
      // total: 17.5
      const cost = calculateCost('anthropic', 'claude-opus-4-6', 1_000_000, 500_000);
      expect(cost).toBe(17.5);
    });

    it('returns a value rounded to 6 decimal places', () => {
      // Use values that would produce many decimal places without rounding
      const cost = calculateCost('google', 'gemini-2.0-flash-exp', 7, 3);
      // input: (7/1000) * 0.0001 = 0.0000007
      // output: (3/1000) * 0.0004 = 0.0000012
      // total: 0.0000019 -> rounded to 6 decimals = 0.000002
      const decimalStr = cost.toString();
      const decimalPlaces = decimalStr.includes('.')
        ? decimalStr.split('.')[1].length
        : 0;
      expect(decimalPlaces).toBeLessThanOrEqual(6);
    });
  });
});
