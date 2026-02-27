import { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { createAnthropicClient } from './providers';
import { calculateCost } from './cost-tracker';
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

// Map phase names to SeoPipelineStatus values
const PHASE_TO_STATUS: Record<string, SeoPipelineStatus> = {
  planning: 'planning',
  writing: 'writing',
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
  'writing',
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
  const artifacts = buildPhaseArtifacts(phase, result.text, run);

  // Persist phase results and artifacts
  const updatedPhaseResults = { ...(run.phase_results || {}), [phase]: result.text };
  const updatedArtifacts = { ...(run.artifacts || {}), [phase]: artifacts };

  // Determine next status
  const nextPhase = PHASE_ORDER[phaseIndex + 1];
  const nextStatus: SeoPipelineStatus = nextPhase
    ? (PHASE_TO_STATUS[nextPhase] || 'planning')
    : 'published';

  // Apply phase-specific field updates
  const fieldUpdates = getPhaseFieldUpdates(phase, result.text, artifacts);

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

    case 'writing':
      return {
        draft: agentOutput,
        word_count: agentOutput.split(/\s+/).length,
      };

    case 'qc': {
      // Try to parse a score from the QC output (expects JSON or a numeric score)
      const scoreMatch = agentOutput.match(/"(?:score|qc_score)":\s*(\d+(?:\.\d+)?)/);
      return {
        qc_report: agentOutput,
        qc_score: scoreMatch ? parseFloat(scoreMatch[1]) : null,
      };
    }

    case 'humanizing':
      return {
        humanized_content: agentOutput,
        word_count: agentOutput.split(/\s+/).length,
      };

    case 'scoring': {
      const valueMatch = agentOutput.match(/"(?:score|value_score)":\s*(\d+(?:\.\d+)?)/);
      return {
        value_report: agentOutput,
        value_score: valueMatch ? parseFloat(valueMatch[1]) : null,
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
// EXPORTS SUMMARY
// ============================================================================
// createPipelineRun  - Create a new pipeline run
// callAgent          - Call Claude and log to seo_agent_calls (used by runPhase and externally)
// runPhase           - Execute one pipeline phase (planning, writing, qc, etc.)
// submitGateDecision - Record gate1/gate2 human decision
// getRunWithCalls    - Fetch run + all agent calls
// listRuns           - List runs for a team config
// getTeamConfig      - Fetch a team config by ID
// PHASE_ORDER        - Ordered list of phase names
