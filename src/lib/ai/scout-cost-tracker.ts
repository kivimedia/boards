/**
 * Scout Cost Tracker - tracks API credit usage across Hunter, Snov.io,
 * Anthropic, and Resend for the podcast scout/outreach pipeline.
 *
 * Ported from the local podcast outreach agent's cost_tracker.py.
 * Unlike the basic AI cost-tracker.ts (which logs to ai_usage_log),
 * this module tracks external API credits specifically for the scout pipeline
 * using the pga_scout_costs table.
 */

import { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// COST RATES
// ============================================================================

/** Hunter.io Starter plan: $49/mo for 500 searches + 1000 verifications */
export const HUNTER_COSTS = {
  domain_search: 0.098, // $49 / 500 searches
  email_finder: 0.049, // $49 / 1000 calls
  email_verifier: 0.049, // $49 / 1000 verifications
} as const;

/** Snov.io Starter plan: $30/mo for 1000 credits */
export const SNOV_COSTS = {
  linkedin_enrichment: 0.039, // ~1 credit per profile ($39/1000)
  email_search: 0.039, // ~1 credit per search
  email_verify: 0.0, // Free (included)
} as const;

/** Resend free tier: 100/day, 3000/month, $0 */
export const RESEND_COSTS = {
  email_send: 0.0, // Free tier
} as const;

export type ScoutService = 'hunter' | 'snov' | 'anthropic' | 'resend';
export type HunterOperation = 'domain_search' | 'email_finder' | 'email_verifier';
export type SnovOperation = 'linkedin_enrichment' | 'email_search' | 'email_verify';
export type AnthropicOperation = 'linkedin_discovery' | 'deep_research' | 'dossier_research' | 'email_generation';
export type ResendOperation = 'email_send';

export type ScoutOperation = HunterOperation | SnovOperation | AnthropicOperation | ResendOperation;

// ============================================================================
// TRACKING
// ============================================================================

/**
 * Record a cost event in pga_scout_costs.
 */
export async function recordScoutCost(
  supabase: SupabaseClient,
  params: {
    runId?: string;
    service: ScoutService;
    operation: ScoutOperation;
    creditsUsed: number;
    costUsd: number;
    apiCalls?: number;
    candidateName?: string;
    candidateId?: string;
  }
): Promise<void> {
  await supabase.from('pga_scout_costs').insert({
    run_id: params.runId || null,
    service: params.service,
    operation: params.operation,
    credits_used: params.creditsUsed,
    cost_usd: params.costUsd,
    api_calls: params.apiCalls ?? 1,
    candidate_name: params.candidateName || null,
    candidate_id: params.candidateId || null,
  });
}

/**
 * Record a Hunter.io API call cost.
 */
export async function recordHunterCost(
  supabase: SupabaseClient,
  operation: HunterOperation,
  options?: { runId?: string; candidateName?: string; candidateId?: string }
): Promise<void> {
  const costUsd = HUNTER_COSTS[operation];
  await recordScoutCost(supabase, {
    runId: options?.runId,
    service: 'hunter',
    operation,
    creditsUsed: 1,
    costUsd,
    candidateName: options?.candidateName,
    candidateId: options?.candidateId,
  });
}

/**
 * Record a Snov.io API call cost.
 */
export async function recordSnovCost(
  supabase: SupabaseClient,
  operation: SnovOperation,
  credits: number = 1,
  options?: { runId?: string; candidateName?: string; candidateId?: string }
): Promise<void> {
  const costPerCredit = SNOV_COSTS[operation];
  await recordScoutCost(supabase, {
    runId: options?.runId,
    service: 'snov',
    operation,
    creditsUsed: credits,
    costUsd: credits * costPerCredit,
    candidateName: options?.candidateName,
    candidateId: options?.candidateId,
  });
}

// ============================================================================
// REPORTING
// ============================================================================

export interface ScoutCostReport {
  run_id: string | null;
  period: string;
  total_cost_usd: number;
  total_api_calls: number;
  by_service: Record<
    string,
    {
      cost_usd: number;
      credits_used: number;
      api_calls: number;
      operations: Record<string, { cost_usd: number; credits: number; calls: number }>;
    }
  >;
  candidates_processed: number;
  cost_per_candidate: number;
}

/**
 * Generate a cost report for a specific run or time period.
 */
export async function getScoutCostReport(
  supabase: SupabaseClient,
  filters?: {
    runId?: string;
    since?: string; // ISO date
    until?: string; // ISO date
  }
): Promise<ScoutCostReport> {
  let query = supabase
    .from('pga_scout_costs')
    .select('*')
    .order('created_at', { ascending: true });

  if (filters?.runId) {
    query = query.eq('run_id', filters.runId);
  }
  if (filters?.since) {
    query = query.gte('created_at', filters.since);
  }
  if (filters?.until) {
    query = query.lte('created_at', filters.until);
  }

  const { data: costs } = await query;
  const entries = costs || [];

  const byService: ScoutCostReport['by_service'] = {};
  let totalCost = 0;
  let totalCalls = 0;
  const candidateSet = new Set<string>();

  for (const entry of entries) {
    const service = entry.service;
    const operation = entry.operation;
    const cost = Number(entry.cost_usd);
    const credits = Number(entry.credits_used);
    const calls = entry.api_calls || 1;

    totalCost += cost;
    totalCalls += calls;

    if (entry.candidate_name) {
      candidateSet.add(entry.candidate_name);
    }

    if (!byService[service]) {
      byService[service] = { cost_usd: 0, credits_used: 0, api_calls: 0, operations: {} };
    }
    byService[service].cost_usd += cost;
    byService[service].credits_used += credits;
    byService[service].api_calls += calls;

    if (!byService[service].operations[operation]) {
      byService[service].operations[operation] = { cost_usd: 0, credits: 0, calls: 0 };
    }
    byService[service].operations[operation].cost_usd += cost;
    byService[service].operations[operation].credits += credits;
    byService[service].operations[operation].calls += calls;
  }

  const candidatesProcessed = candidateSet.size;

  return {
    run_id: filters?.runId || null,
    period: filters?.since
      ? `${filters.since} to ${filters?.until || 'now'}`
      : 'all time',
    total_cost_usd: Math.round(totalCost * 1_000_000) / 1_000_000,
    total_api_calls: totalCalls,
    by_service: byService,
    candidates_processed: candidatesProcessed,
    cost_per_candidate:
      candidatesProcessed > 0
        ? Math.round((totalCost / candidatesProcessed) * 1_000_000) / 1_000_000
        : 0,
  };
}

/**
 * Get a formatted text report for display.
 */
export function formatCostReport(report: ScoutCostReport): string {
  const lines: string[] = [
    '═'.repeat(60),
    '  SCOUT PIPELINE COST REPORT',
    `  Period: ${report.period}`,
    '═'.repeat(60),
    '',
  ];

  // Per-service breakdown
  for (const [service, data] of Object.entries(report.by_service)) {
    lines.push(`${service.toUpperCase()}`);
    lines.push('-'.repeat(40));
    lines.push(`  Total cost:    $${data.cost_usd.toFixed(4)}`);
    lines.push(`  Credits used:  ${data.credits_used}`);
    lines.push(`  API calls:     ${data.api_calls}`);

    for (const [op, opData] of Object.entries(data.operations)) {
      lines.push(`    ${op}: ${opData.calls} calls, $${opData.cost_usd.toFixed(4)}`);
    }
    lines.push('');
  }

  // Summary
  lines.push('SUMMARY');
  lines.push('-'.repeat(40));
  lines.push(`  Total cost:           $${report.total_cost_usd.toFixed(4)}`);
  lines.push(`  Total API calls:      ${report.total_api_calls}`);
  lines.push(`  Candidates processed: ${report.candidates_processed}`);
  lines.push(`  Cost per candidate:   $${report.cost_per_candidate.toFixed(4)}`);
  lines.push('═'.repeat(60));

  return lines.join('\n');
}
