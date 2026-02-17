import { SupabaseClient } from '@supabase/supabase-js';
import { getMonthlySpend } from './cost-tracker';
import type { AIProvider, AIActivity, AIBudgetConfig, AIBudgetStatus, AIBudgetScope } from '../types';

// ============================================================================
// BUDGET CHECKING
// ============================================================================

/**
 * Get budget config for a specific scope.
 */
export async function getBudgetConfig(
  supabase: SupabaseClient,
  scope: AIBudgetScope,
  scopeId?: string
): Promise<AIBudgetConfig | null> {
  let query = supabase
    .from('ai_budget_config')
    .select('*')
    .eq('scope', scope)
    .eq('is_active', true);

  if (scopeId) {
    query = query.eq('scope_id', scopeId);
  } else {
    query = query.is('scope_id', null);
  }

  const { data } = await query.limit(1).single();
  return data as AIBudgetConfig | null;
}

/**
 * Check budget status for a scope. Returns current spend vs cap.
 */
export async function checkBudgetStatus(
  supabase: SupabaseClient,
  scope: AIBudgetScope,
  scopeId?: string
): Promise<AIBudgetStatus | null> {
  const config = await getBudgetConfig(supabase, scope, scopeId);
  if (!config) return null;

  // Build spend query filters based on scope
  const filters: Record<string, string> = {};
  if (scope === 'provider' && scopeId) filters.provider = scopeId;
  if (scope === 'activity' && scopeId) filters.activity = scopeId;
  if (scope === 'user' && scopeId) filters.userId = scopeId;
  if (scope === 'board' && scopeId) filters.boardId = scopeId;
  if (scope === 'client' && scopeId) filters.clientId = scopeId;

  const spentUsd = await getMonthlySpend(supabase, filters);
  const remainingUsd = Math.max(0, config.monthly_cap_usd - spentUsd);
  const usagePct = config.monthly_cap_usd > 0
    ? Math.round((spentUsd / config.monthly_cap_usd) * 100)
    : 0;

  return {
    scope: config.scope as AIBudgetScope,
    scope_id: config.scope_id,
    monthly_cap_usd: config.monthly_cap_usd,
    spent_usd: spentUsd,
    remaining_usd: remainingUsd,
    usage_pct: usagePct,
    alert_threshold_pct: config.alert_threshold_pct,
    is_over_budget: spentUsd >= config.monthly_cap_usd,
    is_alert_triggered: usagePct >= config.alert_threshold_pct,
  };
}

/**
 * Check if an AI call is allowed under budget constraints.
 * Checks global budget first, then more specific scopes.
 * Returns { allowed, reason } — if not allowed, reason explains why.
 */
export async function canMakeAICall(
  supabase: SupabaseClient,
  context: {
    provider: AIProvider;
    activity: AIActivity;
    userId?: string;
    boardId?: string;
    clientId?: string;
  }
): Promise<{ allowed: boolean; reason?: string }> {
  // Check global budget
  const globalStatus = await checkBudgetStatus(supabase, 'global');
  if (globalStatus?.is_over_budget) {
    return {
      allowed: false,
      reason: `Global monthly budget of $${globalStatus.monthly_cap_usd} has been reached (spent: $${globalStatus.spent_usd.toFixed(2)})`,
    };
  }

  // Check provider-specific budget
  const providerStatus = await checkBudgetStatus(supabase, 'provider', context.provider);
  if (providerStatus?.is_over_budget) {
    return {
      allowed: false,
      reason: `${context.provider} monthly budget of $${providerStatus.monthly_cap_usd} has been reached`,
    };
  }

  // Check activity-specific budget
  const activityStatus = await checkBudgetStatus(supabase, 'activity', context.activity);
  if (activityStatus?.is_over_budget) {
    return {
      allowed: false,
      reason: `${context.activity} monthly budget of $${activityStatus.monthly_cap_usd} has been reached`,
    };
  }

  // Check user-specific budget
  if (context.userId) {
    const userStatus = await checkBudgetStatus(supabase, 'user', context.userId);
    if (userStatus?.is_over_budget) {
      return {
        allowed: false,
        reason: `Your monthly AI budget of $${userStatus.monthly_cap_usd} has been reached`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Get all active budget statuses for the dashboard.
 */
export async function getAllBudgetStatuses(
  supabase: SupabaseClient
): Promise<AIBudgetStatus[]> {
  const { data } = await supabase
    .from('ai_budget_config')
    .select('*')
    .eq('is_active', true)
    .order('scope');

  if (!data) return [];

  const statuses: AIBudgetStatus[] = [];
  for (const config of data as AIBudgetConfig[]) {
    const status = await checkBudgetStatus(
      supabase,
      config.scope as AIBudgetScope,
      config.scope_id ?? undefined
    );
    if (status) statuses.push(status);
  }

  return statuses;
}
