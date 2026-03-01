import { SupabaseClient } from '@supabase/supabase-js';
import type {
  AIProvider,
  AIActivity,
  AIUsageStatus,
  AIUsageLogEntry,
  AIModelPricing,
} from '../types';

// ============================================================================
// MODEL PRICING (per 1K tokens, in USD)
// ============================================================================

export const MODEL_PRICING: AIModelPricing[] = [
  // Anthropic
  { provider: 'anthropic', model_id: 'claude-opus-4-6', input_cost_per_1k: 0.005, output_cost_per_1k: 0.025 },
  { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', input_cost_per_1k: 0.003, output_cost_per_1k: 0.015 },
  { provider: 'anthropic', model_id: 'claude-haiku-4-5-20251001', input_cost_per_1k: 0.001, output_cost_per_1k: 0.005 },
  // OpenAI
  { provider: 'openai', model_id: 'o3', input_cost_per_1k: 0.01, output_cost_per_1k: 0.04 },
  { provider: 'openai', model_id: 'o3-mini', input_cost_per_1k: 0.0011, output_cost_per_1k: 0.0044 },
  { provider: 'openai', model_id: 'o1', input_cost_per_1k: 0.015, output_cost_per_1k: 0.06 },
  { provider: 'openai', model_id: 'o1-mini', input_cost_per_1k: 0.003, output_cost_per_1k: 0.012 },
  { provider: 'openai', model_id: 'gpt-4.1', input_cost_per_1k: 0.002, output_cost_per_1k: 0.008 },
  { provider: 'openai', model_id: 'gpt-4.1-mini', input_cost_per_1k: 0.0004, output_cost_per_1k: 0.0016 },
  { provider: 'openai', model_id: 'gpt-4.1-nano', input_cost_per_1k: 0.0001, output_cost_per_1k: 0.0004 },
  { provider: 'openai', model_id: 'gpt-4o', input_cost_per_1k: 0.0025, output_cost_per_1k: 0.01 },
  { provider: 'openai', model_id: 'gpt-4o-mini', input_cost_per_1k: 0.00015, output_cost_per_1k: 0.0006 },
  { provider: 'openai', model_id: 'sora-2', input_cost_per_1k: 0.01, output_cost_per_1k: 0.04 },
  // Google
  { provider: 'google', model_id: 'gemini-2.5-pro', input_cost_per_1k: 0.00125, output_cost_per_1k: 0.01 },
  { provider: 'google', model_id: 'gemini-2.5-flash', input_cost_per_1k: 0.00015, output_cost_per_1k: 0.0006 },
  { provider: 'google', model_id: 'gemini-1.5-pro', input_cost_per_1k: 0.00125, output_cost_per_1k: 0.005 },
  // Replicate (per-image pricing, not per-token; cost logged directly in metadata)
  { provider: 'replicate', model_id: 'flux-1.1-pro', input_cost_per_1k: 0, output_cost_per_1k: 0 },
  { provider: 'replicate', model_id: 'flux-schnell', input_cost_per_1k: 0, output_cost_per_1k: 0 },
];

/**
 * Look up pricing for a model. Returns null if model not found.
 */
export function getModelPricing(
  provider: AIProvider,
  modelId: string
): AIModelPricing | null {
  return (
    MODEL_PRICING.find(
      (p) => p.provider === provider && p.model_id === modelId
    ) ?? null
  );
}

/**
 * Calculate cost for a given token usage.
 */
export function calculateCost(
  provider: AIProvider,
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = getModelPricing(provider, modelId);
  if (!pricing) return 0;

  const inputCost = (inputTokens / 1000) * pricing.input_cost_per_1k;
  const outputCost = (outputTokens / 1000) * pricing.output_cost_per_1k;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6 decimal precision
}

// ============================================================================
// USAGE LOGGING
// ============================================================================

export interface LogUsageParams {
  userId?: string;
  boardId?: string;
  cardId?: string;
  clientId?: string;
  activity: AIActivity;
  provider: AIProvider;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  status: AIUsageStatus;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log an AI usage event to the database.
 */
export async function logUsage(
  supabase: SupabaseClient,
  params: LogUsageParams
): Promise<void> {
  const totalTokens = params.inputTokens + params.outputTokens;
  const costUsd = calculateCost(
    params.provider,
    params.modelId,
    params.inputTokens,
    params.outputTokens
  );

  await supabase.from('ai_usage_log').insert({
    user_id: params.userId ?? null,
    board_id: params.boardId ?? null,
    card_id: params.cardId ?? null,
    client_id: params.clientId ?? null,
    activity: params.activity,
    provider: params.provider,
    model_id: params.modelId,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
    total_tokens: totalTokens,
    cost_usd: costUsd,
    latency_ms: params.latencyMs,
    status: params.status,
    error_message: params.errorMessage ?? null,
    metadata: params.metadata ?? {},
  });
}

// ============================================================================
// USAGE QUERIES
// ============================================================================

/**
 * Get total spend for the current month, optionally filtered.
 */
export async function getMonthlySpend(
  supabase: SupabaseClient,
  filters?: {
    provider?: AIProvider;
    activity?: AIActivity;
    userId?: string;
    boardId?: string;
    clientId?: string;
  }
): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  let query = supabase
    .from('ai_usage_log')
    .select('cost_usd')
    .gte('created_at', startOfMonth.toISOString())
    .eq('status', 'success');

  if (filters?.provider) query = query.eq('provider', filters.provider);
  if (filters?.activity) query = query.eq('activity', filters.activity);
  if (filters?.userId) query = query.eq('user_id', filters.userId);
  if (filters?.boardId) query = query.eq('board_id', filters.boardId);
  if (filters?.clientId) query = query.eq('client_id', filters.clientId);

  const { data } = await query;

  if (!data) return 0;
  return data.reduce((sum, row) => sum + Number(row.cost_usd), 0);
}

/**
 * Get usage summary grouped by activity for the current month.
 */
export async function getUsageSummary(
  supabase: SupabaseClient
): Promise<{
  totalSpend: number;
  totalTokens: number;
  totalCalls: number;
  byActivity: Record<string, { calls: number; tokens: number; cost: number }>;
  byProvider: Record<string, { calls: number; tokens: number; cost: number }>;
}> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('ai_usage_log')
    .select('activity, provider, total_tokens, cost_usd')
    .gte('created_at', startOfMonth.toISOString())
    .eq('status', 'success');

  const entries = data as Pick<AIUsageLogEntry, 'activity' | 'provider' | 'total_tokens' | 'cost_usd'>[] || [];

  let totalSpend = 0;
  let totalTokens = 0;
  const byActivity: Record<string, { calls: number; tokens: number; cost: number }> = {};
  const byProvider: Record<string, { calls: number; tokens: number; cost: number }> = {};

  for (const entry of entries) {
    const cost = Number(entry.cost_usd);
    const tokens = entry.total_tokens;

    totalSpend += cost;
    totalTokens += tokens;

    if (!byActivity[entry.activity]) {
      byActivity[entry.activity] = { calls: 0, tokens: 0, cost: 0 };
    }
    byActivity[entry.activity].calls++;
    byActivity[entry.activity].tokens += tokens;
    byActivity[entry.activity].cost += cost;

    if (!byProvider[entry.provider]) {
      byProvider[entry.provider] = { calls: 0, tokens: 0, cost: 0 };
    }
    byProvider[entry.provider].calls++;
    byProvider[entry.provider].tokens += tokens;
    byProvider[entry.provider].cost += cost;
  }

  return {
    totalSpend,
    totalTokens,
    totalCalls: entries.length,
    byActivity,
    byProvider,
  };
}
