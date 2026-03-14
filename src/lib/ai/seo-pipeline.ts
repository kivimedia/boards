import { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { createAnthropicClient } from './providers';
import { calculateCost } from './cost-tracker';
import { canonicalizeSeoArticle } from '../seo/article-utils';
import type {
  SeoPipelineRun,
  SeoPipelineStatus,
  SeoTeamConfig,
  SeoAgentCall,
  SeoGateDecision,
} from '../types';

// ============================================================================
// SEO PIPELINE ENGINE
//
// 9-phase content pipeline with human-in-the-loop gates.
// Each phase is independently callable for the approval-resume pattern.
//
// Phases:
//   1. planning     - Topic research, outline generation, keyword strategy
//   2. writing      - Full article draft from outline
//   3. qc           - Quality check scoring (readability, SEO, accuracy)
//   4. humanizing   - Rewrite to sound natural, remove AI patterns
//   5. scoring      - Value score (content uniqueness, depth, actionability)
//   6. gate1        - Human approval checkpoint (approve / revise / scrap)
//   7. publishing   - Push to WordPress via REST API
//   8. visual_qa    - Screenshot + visual regression check
//   9. gate2        - Final human sign-off (approve / revise / scrap)
//
// Designed to run from both Vercel API routes and VPS worker.
// All state is persisted to Supabase so runs survive restarts.
// ============================================================================

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;
const PREVIEW_LENGTH = 500;

function extractNumericScore(text: string, keys: string[]): number | null {
  for (const key of keys) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`["']?(?:${escapedKey})["']?\\s*[:=]\\s*(\\d+(?:\\.\\d+)?)`, 'i');
    const match = text.match(regex);
    if (match) return parseFloat(match[1]);
  }
  return null;
}

function extractValueDimensions(text: string): Record<string, number> {
  const entries: Array<[string, string[]]> = [
    ['reader_value', ['reader_value', 'reader value']],
    ['practical_usefulness', ['practical_usefulness', 'practical usefulness']],
    ['information_gain', ['information_gain', 'information gain']],
    ['search_potential', ['search_potential', 'search potential']],
    ['brand_alignment', ['brand_alignment', 'brand alignment']],
  ];

  return entries.reduce<Record<string, number>>((acc, [targetKey, aliases]) => {
    const value = extractNumericScore(text, aliases);
    if (value != null) acc[targetKey] = value;
    return acc;
  }, {});
}

function getStoredPhaseOutput(phase: string, agentOutput: string, run: Record<string, unknown>): string {
  if (phase === 'writing' || phase === 'humanizing') {
    return canonicalizeSeoArticle(agentOutput, String(run.topic || '')).contentMarkdown;
  }
  return agentOutput;
}

// Map phase names to SeoPipelineStatus values
const PHASE_TO_STATUS: Record<string, SeoPipelineStatus> = {
  planning: 'planning',
  plan_review: 'awaiting_plan_review',
  writing: 'writing',
  image_sourcing: 'awaiting_images',
  qc: 'scoring',
  humanizing: 'humanizing',
  scoring: 'scoring',
  gate1: 'awaiting_approval_1',
  publishing: 'publishing',
  visual_qa: 'visual_qa',
  gate2: 'awaiting_approval_2',
};

const PHASE_ORDER: string[] = [
  'planning',
  'plan_review',
  'writing',
  'image_sourcing',
  'qc',
  'humanizing',
  'scoring',
  'gate1',
  'publishing',
  'visual_qa',
  'gate2',
];

// ============================================================================
// CREATE PIPELINE RUN
// ============================================================================

/**
 * Create a new SEO pipeline run in the database.
 * Returns the full run record.
 */
export async function createPipelineRun(
  supabase: SupabaseClient,
  config: SeoTeamConfig,
  topic: string,
  silo: string | null
): Promise<SeoPipelineRun> {
  const { data, error } = await supabase
    .from('seo_pipeline_runs')
    .insert({
      team_config_id: config.id,
      status: 'planning' as SeoPipelineStatus,
      current_phase: 0,
      phase_results: {},
      artifacts: {},
      error_log: [],
      topic,
      silo: silo ?? null,
      total_cost_usd: 0,
      agent_costs: {},
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to create pipeline run: ${error.message}`);
  }

  return data as SeoPipelineRun;
}

// ============================================================================
// CALL AGENT (core AI call with cost tracking)
// ============================================================================

export interface AgentCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  model: string;
}

/**
 * Call a Claude agent, log the call to seo_agent_calls, and update run cost.
 *
 * Accepts an optional Anthropic client. If not provided, creates one from
 * stored API keys (for Vercel routes). VPS workers should pass their own.
 */
export async function callAgent(
  supabase: SupabaseClient,
  runId: string,
  agentName: string,
  phase: string,
  systemPrompt: string,
  userMessage: string,
  model?: string,
  anthropicClient?: Anthropic
): Promise<AgentCallResult> {
  const startTime = Date.now();
  const modelId = model || DEFAULT_MODEL;

  // Get or create Anthropic client
  const client = anthropicClient || await createAnthropicClient(supabase);
  if (!client) {
    throw new Error('Anthropic API key not configured. Go to Settings > AI Keys to add one.');
  }

  // Get current iteration count for this agent in this run
  const { count: existingCalls } = await supabase
    .from('seo_agent_calls')
    .select('id', { count: 'exact', head: true })
    .eq('pipeline_run_id', runId)
    .eq('agent_name', agentName)
    .eq('phase', phase);

  const iteration = (existingCalls ?? 0) + 1;

  let callRecord: SeoAgentCall | null = null;

  try {
    const response = await client.messages.create({
      model: modelId,
      max_tokens: DEFAULT_MAX_TOKENS,
      messages: [{ role: 'user', content: userMessage }],
      system: systemPrompt,
    });

    const durationMs = Date.now() - startTime;
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costUsd = calculateCost('anthropic', modelId, inputTokens, outputTokens);

    // Extract text from response
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    // Log the agent call
    const { data: logged } = await supabase
      .from('seo_agent_calls')
      .insert({
        pipeline_run_id: runId,
        agent_name: agentName,
        phase,
        model_used: modelId,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: costUsd,
        duration_ms: durationMs,
        iteration,
        input_preview: userMessage.slice(0, PREVIEW_LENGTH),
        output_preview: text.slice(0, PREVIEW_LENGTH),
        status: 'success',
        error_message: null,
      })
      .select('*')
      .single();

    callRecord = logged as SeoAgentCall;

    // Update run cost totals
    await updateRunCosts(supabase, runId, agentName, costUsd);

    return {
      text,
      inputTokens,
      outputTokens,
      costUsd,
      durationMs,
      model: modelId,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Log failed call
    await supabase.from('seo_agent_calls').insert({
      pipeline_run_id: runId,
      agent_name: agentName,
      phase,
      model_used: modelId,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      duration_ms: durationMs,
      iteration,
      input_preview: userMessage.slice(0, PREVIEW_LENGTH),
      output_preview: null,
      status: 'failed',
      error_message: errorMessage,
    });

    // Log error on the run
    await appendRunError(supabase, runId, phase, errorMessage);

    throw err;
  }
}

// ============================================================================
// RUN PHASE
// ============================================================================

export interface PhaseResult {
  phase: string;
  agentResult: AgentCallResult;
  artifacts: Record<string, unknown>;
}

/**
 * Execute a single pipeline phase. Fetches the run, validates state,
 * calls the appropriate agent, and updates DB.
 *
 * System prompts and user messages must be provided via phaseConfig.
 * In production these come from the agent_skills table or team config.
 */
export async function runPhase(
  supabase: SupabaseClient,
  runId: string,
  phase: string,
  phaseConfig: {
    systemPrompt: string;
    userMessage: string;
    model?: string;
    agentName?: string;
    anthropicClient?: Anthropic;
  }
): Promise<PhaseResult> {
  // Validate phase name
  if (!PHASE_ORDER.includes(phase)) {
    throw new Error(`Unknown phase: ${phase}. Valid phases: ${PHASE_ORDER.join(', ')}`);
  }

  // Gate phases should use submitGateDecision instead
  if (phase === 'gate1' || phase === 'gate2') {
    throw new Error(`Gate phases (${phase}) require human input. Use submitGateDecision() instead.`);
  }

  // Fetch current run
  const { data: run, error } = await supabase
    .from('seo_pipeline_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (error || !run) {
    throw new Error(`Pipeline run not found: ${runId}`);
  }

  // Check run isn't terminal
  if (run.status === 'failed' || run.status === 'scrapped' || run.status === 'published') {
    throw new Error(`Pipeline run ${runId} is in terminal state: ${run.status}`);
  }

  // Update status to current phase
  const phaseStatus = PHASE_TO_STATUS[phase] || 'planning';
  const phaseIndex = PHASE_ORDER.indexOf(phase);

  await supabase
    .from('seo_pipeline_runs')
    .update({
      status: phaseStatus,
      current_phase: phaseIndex,
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId);

  // Call the agent
  const agentName = phaseConfig.agentName || `seo_${phase}`;
  const result = await callAgent(
    supabase,
    runId,
    agentName,
    phase,
    phaseConfig.systemPrompt,
    phaseConfig.userMessage,
    phaseConfig.model,
    phaseConfig.anthropicClient
  );

  // Build artifacts from agent output
  const storedOutput = getStoredPhaseOutput(phase, result.text, run);
  const artifacts = buildPhaseArtifacts(phase, storedOutput, run);

  // Persist phase results and artifacts
  const updatedPhaseResults = { ...(run.phase_results || {}), [phase]: storedOutput };
  const updatedArtifacts = { ...(run.artifacts || {}), [phase]: artifacts };

  // Determine next status
  const nextPhase = PHASE_ORDER[phaseIndex + 1];
  const nextStatus: SeoPipelineStatus = nextPhase
    ? (PHASE_TO_STATUS[nextPhase] || 'planning')
    : 'published';

  // Apply phase-specific field updates
  const fieldUpdates = getPhaseFieldUpdates(phase, storedOutput, artifacts);

  await supabase
    .from('seo_pipeline_runs')
    .update({
      phase_results: updatedPhaseResults,
      artifacts: updatedArtifacts,
      status: nextStatus,
      current_phase: phaseIndex + 1,
      updated_at: new Date().toISOString(),
      ...fieldUpdates,
    })
    .eq('id', runId);

  return {
    phase,
    agentResult: result,
    artifacts,
  };
}

// ============================================================================
// SUBMIT GATE DECISION
// ============================================================================

/**
 * Record a human gate decision (gate1 or gate2).
 * On approve: advances to next phase.
 * On revise: sets status back to allow re-running previous phases.
 * On scrap: marks run as scrapped.
 */
export async function submitGateDecision(
  supabase: SupabaseClient,
  runId: string,
  gate: 'gate1' | 'gate2',
  decision: SeoGateDecision,
  feedback: string | null,
  userId: string
): Promise<{ newStatus: SeoPipelineStatus }> {
  const now = new Date().toISOString();

  // Fetch current run to validate
  const { data: run, error } = await supabase
    .from('seo_pipeline_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (error || !run) {
    throw new Error(`Pipeline run not found: ${runId}`);
  }

  // Build gate-specific update
  const gatePrefix = gate === 'gate1' ? 'gate1' : 'gate2';
  const gateUpdate: Record<string, unknown> = {
    [`${gatePrefix}_decision`]: decision,
    [`${gatePrefix}_feedback`]: feedback,
    [`${gatePrefix}_decided_by`]: userId,
    [`${gatePrefix}_decided_at`]: now,
    updated_at: now,
  };

  let newStatus: SeoPipelineStatus;

  if (decision === 'approve') {
    // Advance past the gate
    const gateIndex = PHASE_ORDER.indexOf(gate);
    const nextPhase = PHASE_ORDER[gateIndex + 1];

    if (!nextPhase) {
      // gate2 approve = published
      newStatus = 'published';
      gateUpdate.published_at = now;
    } else {
      newStatus = PHASE_TO_STATUS[nextPhase] || 'publishing';
    }

    gateUpdate.status = newStatus;
    gateUpdate.current_phase = gateIndex + 1;
  } else if (decision === 'revise') {
    // Send back to writing phase for gate1, visual_qa for gate2
    if (gate === 'gate1') {
      newStatus = 'writing';
      gateUpdate.current_phase = PHASE_ORDER.indexOf('writing');
    } else {
      newStatus = 'visual_qa';
      gateUpdate.current_phase = PHASE_ORDER.indexOf('visual_qa');
    }
    gateUpdate.status = newStatus;
  } else {
    // scrap
    newStatus = 'scrapped';
    gateUpdate.status = newStatus;
  }

  await supabase
    .from('seo_pipeline_runs')
    .update(gateUpdate)
    .eq('id', runId);

  // Also log the gate decision as an agent call for audit trail
  await supabase.from('seo_agent_calls').insert({
    pipeline_run_id: runId,
    agent_name: `human_${gate}`,
    phase: gate,
    model_used: null,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    duration_ms: 0,
    iteration: 1,
    input_preview: feedback?.slice(0, PREVIEW_LENGTH) ?? null,
    output_preview: decision,
    status: 'success',
    error_message: null,
  });

  return { newStatus };
}

// ============================================================================
// GET RUN WITH CALLS
// ============================================================================

/**
 * Fetch a pipeline run with all its agent calls and team config.
 */
export async function getRunWithCalls(
  supabase: SupabaseClient,
  runId: string
): Promise<SeoPipelineRun & { agent_calls: SeoAgentCall[] }> {
  const { data: run, error } = await supabase
    .from('seo_pipeline_runs')
    .select('*, team_config:seo_team_configs(*)')
    .eq('id', runId)
    .single();

  if (error || !run) {
    throw new Error(`Pipeline run not found: ${runId}`);
  }

  const { data: calls } = await supabase
    .from('seo_agent_calls')
    .select('*')
    .eq('pipeline_run_id', runId)
    .order('created_at', { ascending: true });

  return {
    ...(run as SeoPipelineRun),
    agent_calls: (calls as SeoAgentCall[]) || [],
  };
}

// ============================================================================
// HELPER: Update run cost totals
// ============================================================================

async function updateRunCosts(
  supabase: SupabaseClient,
  runId: string,
  agentName: string,
  costUsd: number
): Promise<void> {
  const { data: run } = await supabase
    .from('seo_pipeline_runs')
    .select('total_cost_usd, agent_costs')
    .eq('id', runId)
    .single();

  if (!run) return;

  const currentTotal = Number(run.total_cost_usd) || 0;
  const currentAgentCosts = (run.agent_costs as Record<string, number>) || {};
  const currentAgentCost = currentAgentCosts[agentName] || 0;

  await supabase
    .from('seo_pipeline_runs')
    .update({
      total_cost_usd: Math.round((currentTotal + costUsd) * 1_000_000) / 1_000_000,
      agent_costs: {
        ...currentAgentCosts,
        [agentName]: Math.round((currentAgentCost + costUsd) * 1_000_000) / 1_000_000,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId);
}

// ============================================================================
// HELPER: Append error to run error_log
// ============================================================================

async function appendRunError(
  supabase: SupabaseClient,
  runId: string,
  phase: string,
  errorMessage: string
): Promise<void> {
  const { data: run } = await supabase
    .from('seo_pipeline_runs')
    .select('error_log, status')
    .eq('id', runId)
    .single();

  if (!run) return;

  const errorLog = (run.error_log as Array<{ phase: string; error: string; timestamp: string }>) || [];
  errorLog.push({
    phase,
    error: errorMessage,
    timestamp: new Date().toISOString(),
  });

  await supabase
    .from('seo_pipeline_runs')
    .update({
      error_log: errorLog,
      status: 'failed' as SeoPipelineStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId);
}

// ============================================================================
// HELPER: Build phase artifacts from agent output
// ============================================================================

function buildPhaseArtifacts(
  phase: string,
  agentOutput: string,
  run: Record<string, unknown>
): Record<string, unknown> {
  switch (phase) {
    case 'planning':
      return {
        outline: agentOutput,
        topic: run.topic,
        silo: run.silo,
      };

    case 'writing': {
      const writingArticle = canonicalizeSeoArticle(agentOutput, String(run.topic || ''));
      return {
        draft: writingArticle.contentMarkdown,
        canonical_title: writingArticle.title,
        canonical_body: writingArticle.body,
        content_word_count: writingArticle.contentWordCount,
        compliance_checks: writingArticle.compliance.checks,
        compliance: writingArticle.compliance,
      };
    }

    case 'qc': {
      // Try to parse a score from the QC output (expects JSON or a numeric score)
      const scoreMatch = agentOutput.match(/"(?:score|qc_score)":\s*(\d+(?:\.\d+)?)/);
      return {
        qc_report: agentOutput,
        qc_score: scoreMatch ? parseFloat(scoreMatch[1]) : null,
      };
    }

    case 'humanizing': {
      const humanizedArticle = canonicalizeSeoArticle(agentOutput, String(run.topic || ''));
      return {
        humanized_content: humanizedArticle.contentMarkdown,
        canonical_title: humanizedArticle.title,
        canonical_body: humanizedArticle.body,
        content_word_count: humanizedArticle.contentWordCount,
        compliance_checks: humanizedArticle.compliance.checks,
        compliance: humanizedArticle.compliance,
      };
    }

    case 'scoring': {
      const valueScore = extractNumericScore(agentOutput, ['score', 'value_score', 'value score']);
      return {
        value_report: agentOutput,
        value_score: valueScore,
        value_dimensions: extractValueDimensions(agentOutput),
      };
    }

    case 'publishing':
      return {
        publish_result: agentOutput,
      };

    case 'visual_qa': {
      const vqaMatch = agentOutput.match(/"(?:score|visual_qa_score)":\s*(\d+(?:\.\d+)?)/);
      return {
        visual_qa_report: agentOutput,
        visual_qa_score: vqaMatch ? parseFloat(vqaMatch[1]) : null,
      };
    }

    default:
      return { raw_output: agentOutput };
  }
}

// ============================================================================
// HELPER: Get phase-specific DB field updates
// ============================================================================

function getPhaseFieldUpdates(
  phase: string,
  agentOutput: string,
  artifacts: Record<string, unknown>
): Record<string, unknown> {
  switch (phase) {
    case 'writing':
      return { final_content: agentOutput };

    case 'humanizing':
      return { humanized_content: agentOutput };

    case 'qc':
      return artifacts.qc_score != null ? { qc_score: artifacts.qc_score } : {};

    case 'scoring':
      return artifacts.value_score != null ? { value_score: artifacts.value_score } : {};

    case 'visual_qa':
      return artifacts.visual_qa_score != null
        ? { visual_qa_score: artifacts.visual_qa_score }
        : {};

    default:
      return {};
  }
}

// ============================================================================
// CONVENIENCE: List runs for a team config
// ============================================================================

export async function listRuns(
  supabase: SupabaseClient,
  teamConfigId: string,
  options?: {
    status?: SeoPipelineStatus;
    limit?: number;
    offset?: number;
  }
): Promise<{ runs: SeoPipelineRun[]; total: number }> {
  let query = supabase
    .from('seo_pipeline_runs')
    .select('*', { count: 'exact' })
    .eq('team_config_id', teamConfigId)
    .order('created_at', { ascending: false });

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
  }

  const { data, count, error } = await query;

  if (error) {
    throw new Error(`Failed to list pipeline runs: ${error.message}`);
  }

  return {
    runs: (data as SeoPipelineRun[]) || [],
    total: count ?? 0,
  };
}

// ============================================================================
// CONVENIENCE: Get team config
// ============================================================================

export async function getTeamConfig(
  supabase: SupabaseClient,
  configId: string
): Promise<SeoTeamConfig | null> {
  const { data } = await supabase
    .from('seo_team_configs')
    .select('*')
    .eq('id', configId)
    .single();

  return (data as SeoTeamConfig) ?? null;
}

// ============================================================================
// GOOGLE ADS ENRICHMENT (pre-Phase 1)
// ============================================================================

import * as gadsAccount from '../integrations/google-ads-account';
import * as gadsIntel from '../integrations/google-ads-intel';
import { sanitizeMcpOutput, logSanitizationEvent } from './agent-tools';

export interface PlanningEnrichment {
  searchTerms: string | null;
  keywordPerformance: string | null;
  competitorAds: string | null;
  errors: string[];
}

/**
 * Enrich planning context with Google Ads data before Phase 1.
 * Returns formatted context sections to inject into the planning prompt.
 * Non-blocking: failures return null sections with logged errors.
 */
export async function enrichPlanningContext(
  supabase: SupabaseClient,
  teamConfig: SeoTeamConfig,
  competitorDomains?: string[]
): Promise<PlanningEnrichment> {
  const result: PlanningEnrichment = {
    searchTerms: null,
    keywordPerformance: null,
    competitorAds: null,
    errors: [],
  };

  const hasGadsCredentials = teamConfig.google_credentials?.google_ads?.customer_id;
  if (!hasGadsCredentials) {
    result.errors.push('Google Ads credentials not configured - skipping enrichment');
    return result;
  }

  const opts = { teamConfigId: teamConfig.id };

  // Fetch search terms and keyword performance in parallel
  const [searchTermsRes, keywordsRes] = await Promise.allSettled([
    gadsAccount.getSearchTermsReport(opts, undefined, 30),
    gadsAccount.getKeywordPerformance(opts),
  ]);

  if (searchTermsRes.status === 'fulfilled' && searchTermsRes.value.data) {
    const raw = JSON.stringify(searchTermsRes.value.data, null, 2);
    const sanitized = sanitizeMcpOutput(raw, 'gads_search_terms_report', teamConfig.id);
    if (sanitized.flags.length > 0) {
      await logSanitizationEvent(supabase, 'gads_search_terms_report', teamConfig.id, raw, sanitized.flags, sanitized.blocked ? 'blocked' : 'sanitized');
    }
    if (!sanitized.blocked) {
      result.searchTerms = sanitized.output;
    } else {
      result.errors.push('Search terms data blocked by security sanitizer');
    }
  } else {
    const err = searchTermsRes.status === 'rejected' ? searchTermsRes.reason : searchTermsRes.value.error;
    result.errors.push(`Search terms fetch failed: ${err}`);
  }

  if (keywordsRes.status === 'fulfilled' && keywordsRes.value.data) {
    const raw = JSON.stringify(keywordsRes.value.data, null, 2);
    const sanitized = sanitizeMcpOutput(raw, 'gads_keyword_performance', teamConfig.id);
    if (sanitized.flags.length > 0) {
      await logSanitizationEvent(supabase, 'gads_keyword_performance', teamConfig.id, raw, sanitized.flags, sanitized.blocked ? 'blocked' : 'sanitized');
    }
    if (!sanitized.blocked) {
      result.keywordPerformance = sanitized.output;
    } else {
      result.errors.push('Keyword performance data blocked by security sanitizer');
    }
  } else {
    const err = keywordsRes.status === 'rejected' ? keywordsRes.reason : keywordsRes.value.error;
    result.errors.push(`Keyword performance fetch failed: ${err}`);
  }

  // Fetch competitor ads if domains provided
  if (competitorDomains?.length) {
    try {
      const firstDomain = competitorDomains[0];
      const { data, error } = await gadsIntel.getCompetitorAds(
        { teamConfigId: teamConfig.id },
        firstDomain,
        undefined,
        10
      );
      if (data) {
        const raw = JSON.stringify(data, null, 2);
        const sanitized = sanitizeMcpOutput(raw, 'gads_competitor_ads', teamConfig.id);
        if (sanitized.flags.length > 0) {
          await logSanitizationEvent(supabase, 'gads_competitor_ads', teamConfig.id, raw, sanitized.flags, sanitized.blocked ? 'blocked' : 'sanitized');
        }
        if (!sanitized.blocked) {
          result.competitorAds = sanitized.output;
        } else {
          result.errors.push('Competitor ads data blocked by security sanitizer');
        }
      } else if (error) {
        result.errors.push(`Competitor ads fetch failed: ${error}`);
      }
    } catch (e) {
      result.errors.push(`Competitor ads error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}

/**
 * Format enrichment data into context sections for the planning prompt.
 */
export function formatEnrichmentForPrompt(enrichment: PlanningEnrichment): string {
  const sections: string[] = [];

  if (enrichment.searchTerms) {
    sections.push(`## Google Ads Search Terms (30 days)\nReal user queries that triggered paid ads. High-impression terms without organic content are priority targets.\n${enrichment.searchTerms}`);
  }

  if (enrichment.keywordPerformance) {
    sections.push(`## Google Ads Keyword Performance\nKeyword quality scores and performance metrics. Low quality scores indicate landing page content gaps.\n${enrichment.keywordPerformance}`);
  }

  if (enrichment.competitorAds) {
    sections.push(`## Competitor Ad Intelligence\nActive competitor ads from Google Ads Transparency Library. Use for messaging differentiation.\n${enrichment.competitorAds}`);
  }

  if (enrichment.errors.length > 0) {
    sections.push(`## Google Ads Enrichment Notes\n${enrichment.errors.map(e => `- ${e}`).join('\n')}`);
  }

  return sections.length > 0 ? `\n\n---\n# Paid Search Context\n${sections.join('\n\n')}` : '';
}

// ============================================================================
// EXPORTS SUMMARY
// ============================================================================
// createPipelineRun    - Create a new pipeline run
// callAgent            - Call Claude and log to seo_agent_calls (used by runPhase and externally)
// runPhase             - Execute one pipeline phase (planning, writing, qc, etc.)
// submitGateDecision   - Record gate1/gate2 human decision
// getRunWithCalls      - Fetch run + all agent calls
// listRuns             - List runs for a team config
// getTeamConfig        - Fetch a team config by ID
// enrichPlanningContext - Fetch Google Ads data for pre-planning enrichment
// formatEnrichmentForPrompt - Format enrichment into planning prompt context
// PHASE_ORDER          - Ordered list of phase names
