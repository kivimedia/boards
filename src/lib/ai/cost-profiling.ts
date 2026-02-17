import { SupabaseClient } from '@supabase/supabase-js';
import type { AIModelPricingRow, AIActivityConfig, AIBudgetAlert, AICostSummary } from '../types';

// ============================================================================
// MODEL PRICING
// ============================================================================

export async function getModelPricing(
  supabase: SupabaseClient,
  provider?: string
): Promise<AIModelPricingRow[]> {
  let query = supabase
    .from('ai_model_pricing')
    .select('*')
    .order('provider', { ascending: true });

  if (provider) query = query.eq('provider', provider);

  // Only get currently effective pricing
  const today = new Date().toISOString().split('T')[0];
  query = query.lte('effective_from', today);

  const { data } = await query;
  return (data as AIModelPricingRow[]) ?? [];
}

export async function upsertModelPricing(
  supabase: SupabaseClient,
  pricing: {
    provider: string;
    modelId: string;
    inputCostPer1k: number;
    outputCostPer1k: number;
    imageCostPerUnit?: number;
    videoCostPerSecond?: number;
  }
): Promise<AIModelPricingRow | null> {
  const { data, error } = await supabase
    .from('ai_model_pricing')
    .upsert({
      provider: pricing.provider,
      model_id: pricing.modelId,
      input_cost_per_1k: pricing.inputCostPer1k,
      output_cost_per_1k: pricing.outputCostPer1k,
      image_cost_per_unit: pricing.imageCostPerUnit ?? 0,
      video_cost_per_second: pricing.videoCostPerSecond ?? 0,
      effective_from: new Date().toISOString().split('T')[0],
    })
    .select()
    .single();

  if (error) return null;
  return data as AIModelPricingRow;
}

// ============================================================================
// ACTIVITY CONFIG (per-activity model assignment + A/B testing)
// ============================================================================

export async function getActivityConfigs(
  supabase: SupabaseClient,
  activity?: string
): Promise<AIActivityConfig[]> {
  let query = supabase
    .from('ai_activity_config')
    .select('*')
    .eq('is_active', true)
    .order('activity', { ascending: true });

  if (activity) query = query.eq('activity', activity);

  const { data } = await query;
  return (data as AIActivityConfig[]) ?? [];
}

export async function resolveModelForActivity(
  supabase: SupabaseClient,
  activity: string
): Promise<AIActivityConfig | null> {
  const configs = await getActivityConfigs(supabase, activity);
  if (configs.length === 0) return null;
  if (configs.length === 1) return configs[0];

  // A/B testing: weighted random selection
  const totalWeight = configs.reduce((sum, c) => sum + c.weight, 0);
  let random = Math.random() * totalWeight;
  for (const config of configs) {
    random -= config.weight;
    if (random <= 0) return config;
  }
  return configs[0];
}

export async function createActivityConfig(
  supabase: SupabaseClient,
  config: {
    activity: string;
    provider: string;
    modelId: string;
    weight?: number;
    maxTokens?: number;
    temperature?: number;
  }
): Promise<AIActivityConfig | null> {
  const { data, error } = await supabase
    .from('ai_activity_config')
    .insert({
      activity: config.activity,
      provider: config.provider,
      model_id: config.modelId,
      weight: config.weight ?? 100,
      max_tokens: config.maxTokens ?? 4096,
      temperature: config.temperature ?? 0.7,
      is_active: true,
    })
    .select()
    .single();

  if (error) return null;
  return data as AIActivityConfig;
}

export async function updateActivityConfig(
  supabase: SupabaseClient,
  configId: string,
  updates: Partial<Pick<AIActivityConfig, 'provider' | 'model_id' | 'weight' | 'is_active' | 'max_tokens' | 'temperature'>>
): Promise<AIActivityConfig | null> {
  const { data, error } = await supabase
    .from('ai_activity_config')
    .update(updates)
    .eq('id', configId)
    .select()
    .single();

  if (error) return null;
  return data as AIActivityConfig;
}

export async function deleteActivityConfig(
  supabase: SupabaseClient,
  configId: string
): Promise<void> {
  await supabase.from('ai_activity_config').delete().eq('id', configId);
}

// ============================================================================
// BUDGET ALERTS
// ============================================================================

export async function getBudgetAlerts(
  supabase: SupabaseClient,
  scope?: string
): Promise<AIBudgetAlert[]> {
  let query = supabase
    .from('ai_budget_alerts')
    .select('*')
    .order('scope', { ascending: true });

  if (scope) query = query.eq('scope', scope);

  const { data } = await query;
  return (data as AIBudgetAlert[]) ?? [];
}

export async function createBudgetAlert(
  supabase: SupabaseClient,
  alert: {
    scope: string;
    scopeId?: string;
    thresholdPercent: number;
    monthlyCap: number;
  }
): Promise<AIBudgetAlert | null> {
  const { data, error } = await supabase
    .from('ai_budget_alerts')
    .insert({
      scope: alert.scope,
      scope_id: alert.scopeId ?? null,
      threshold_percent: alert.thresholdPercent,
      monthly_cap: alert.monthlyCap,
    })
    .select()
    .single();

  if (error) return null;
  return data as AIBudgetAlert;
}

export async function updateBudgetAlert(
  supabase: SupabaseClient,
  alertId: string,
  updates: Partial<Pick<AIBudgetAlert, 'threshold_percent' | 'monthly_cap' | 'current_spend' | 'alert_sent'>>
): Promise<AIBudgetAlert | null> {
  const { data, error } = await supabase
    .from('ai_budget_alerts')
    .update(updates)
    .eq('id', alertId)
    .select()
    .single();

  if (error) return null;
  return data as AIBudgetAlert;
}

export async function checkBudgetAlerts(
  supabase: SupabaseClient
): Promise<AIBudgetAlert[]> {
  const { data } = await supabase
    .from('ai_budget_alerts')
    .select('*')
    .eq('alert_sent', false);

  const alerts = (data as AIBudgetAlert[]) ?? [];
  const triggered: AIBudgetAlert[] = [];

  for (const alert of alerts) {
    const spendPercent = (alert.current_spend / alert.monthly_cap) * 100;
    if (spendPercent >= alert.threshold_percent) {
      triggered.push(alert);
      await supabase
        .from('ai_budget_alerts')
        .update({ alert_sent: true, alerted_at: new Date().toISOString() })
        .eq('id', alert.id);
    }
  }

  return triggered;
}

// ============================================================================
// COST SUMMARY & ANALYTICS
// ============================================================================

export async function getCostSummary(
  supabase: SupabaseClient,
  filters: { startDate: string; endDate: string; userId?: string; boardId?: string }
): Promise<AICostSummary> {
  let query = supabase
    .from('ai_usage_log')
    .select('*')
    .gte('created_at', filters.startDate)
    .lte('created_at', filters.endDate);

  if (filters.userId) query = query.eq('user_id', filters.userId);
  if (filters.boardId) query = query.eq('board_id', filters.boardId);

  const { data } = await query;
  const logs = data ?? [];

  let totalCost = 0;
  const byProvider: Record<string, number> = {};
  const byModel: Record<string, number> = {};
  const byActivity: Record<string, number> = {};
  const byUser: Record<string, number> = {};
  const byBoard: Record<string, number> = {};
  const dailyCosts: Record<string, number> = {};

  for (const log of logs) {
    const cost = log.cost ?? 0;
    totalCost += cost;
    byProvider[log.provider] = (byProvider[log.provider] ?? 0) + cost;
    byModel[log.model_id] = (byModel[log.model_id] ?? 0) + cost;
    byActivity[log.activity] = (byActivity[log.activity] ?? 0) + cost;
    if (log.user_id) byUser[log.user_id] = (byUser[log.user_id] ?? 0) + cost;
    if (log.board_id) byBoard[log.board_id] = (byBoard[log.board_id] ?? 0) + cost;

    const date = log.created_at.split('T')[0];
    dailyCosts[date] = (dailyCosts[date] ?? 0) + cost;
  }

  const trend = Object.entries(dailyCosts)
    .map(([date, cost]) => ({ date, cost }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { totalCost, byProvider, byModel, byActivity, byUser, byBoard, trend };
}

export async function calculateCost(
  supabase: SupabaseClient,
  provider: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number
): Promise<number> {
  const { data: pricing } = await supabase
    .from('ai_model_pricing')
    .select('*')
    .eq('provider', provider)
    .eq('model_id', modelId)
    .order('effective_from', { ascending: false })
    .limit(1)
    .single();

  if (!pricing) return 0;

  const inputCost = (inputTokens / 1000) * pricing.input_cost_per_1k;
  const outputCost = (outputTokens / 1000) * pricing.output_cost_per_1k;
  return Math.round((inputCost + outputCost) * 10000) / 10000;
}
