import { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { calculateCost } from './cost-tracker.js';
import type {
  SeoPipelineRun,
  SeoPipelineStatus,
  SeoTeamConfig,
  SeoAgentCall,
  SeoGateDecision,
} from './types.js';

// VPS worker adaptation of agency-board/src/lib/ai/seo-pipeline.ts
// Key change: anthropicClient is REQUIRED (no DB key fallback)

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 8192;
const PREVIEW_LENGTH = 500;

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

export const PHASE_ORDER: string[] = [
  'planning', 'writing', 'qc', 'humanizing', 'scoring',
  'gate1', 'publishing', 'visual_qa', 'gate2',
];

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
      client_id: config.client_id ?? null,
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
  if (error) throw new Error(`Failed to create pipeline run: ${error.message}`);
  return data as SeoPipelineRun;
}

export interface AgentCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  model: string;
}

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

  if (!anthropicClient) {
    throw new Error('anthropicClient is required in VPS worker mode');
  }
  const client = anthropicClient;

  const { count: existingCalls } = await supabase
    .from('seo_agent_calls')
    .select('id', { count: 'exact', head: true })
    .eq('pipeline_run_id', runId)
    .eq('agent_name', agentName)
    .eq('phase', phase);

  const iteration = (existingCalls ?? 0) + 1;

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

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    await supabase
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
      });

    await updateRunCosts(supabase, runId, agentName, costUsd);

    return { text, inputTokens, outputTokens, costUsd, durationMs, model: modelId };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

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

    await appendRunError(supabase, runId, phase, errorMessage);
    throw err;
  }
}

export interface PhaseResult {
  phase: string;
  agentResult: AgentCallResult;
  artifacts: Record<string, unknown>;
}

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
  if (!PHASE_ORDER.includes(phase)) {
    throw new Error(`Unknown phase: ${phase}. Valid: ${PHASE_ORDER.join(', ')}`);
  }
  if (phase === 'gate1' || phase === 'gate2') {
    throw new Error(`Gate phases (${phase}) require human input. Use submitGateDecision() instead.`);
  }

  const { data: run, error } = await supabase
    .from('seo_pipeline_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (error || !run) throw new Error(`Pipeline run not found: ${runId}`);
  if (run.status === 'failed' || run.status === 'scrapped' || run.status === 'published') {
    throw new Error(`Pipeline run ${runId} is in terminal state: ${run.status}`);
  }

  const phaseStatus = PHASE_TO_STATUS[phase] || 'planning';
  const phaseIndex = PHASE_ORDER.indexOf(phase);

  await supabase
    .from('seo_pipeline_runs')
    .update({ status: phaseStatus, current_phase: phaseIndex, updated_at: new Date().toISOString() })
    .eq('id', runId);

  const agentName = phaseConfig.agentName || `seo_${phase}`;
  const result = await callAgent(
    supabase, runId, agentName, phase,
    phaseConfig.systemPrompt, phaseConfig.userMessage,
    phaseConfig.model, phaseConfig.anthropicClient
  );

  const artifacts = buildPhaseArtifacts(phase, result.text, run);
  const updatedPhaseResults = { ...(run.phase_results || {}), [phase]: result.text };
  const updatedArtifacts = { ...(run.artifacts || {}), [phase]: artifacts };

  const nextPhase = PHASE_ORDER[phaseIndex + 1];
  const nextStatus: SeoPipelineStatus = nextPhase
    ? (PHASE_TO_STATUS[nextPhase] || 'planning')
    : 'published';

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

  return { phase, agentResult: result, artifacts };
}

export async function submitGateDecision(
  supabase: SupabaseClient,
  runId: string,
  gate: 'gate1' | 'gate2',
  decision: SeoGateDecision,
  feedback: string | null,
  userId: string
): Promise<{ newStatus: SeoPipelineStatus }> {
  const now = new Date().toISOString();
  const { data: run, error } = await supabase
    .from('seo_pipeline_runs').select('*').eq('id', runId).single();
  if (error || !run) throw new Error(`Pipeline run not found: ${runId}`);

  const gatePrefix = gate;
  const gateUpdate: Record<string, unknown> = {
    [`${gatePrefix}_decision`]: decision,
    [`${gatePrefix}_feedback`]: feedback,
    [`${gatePrefix}_decided_by`]: userId,
    [`${gatePrefix}_decided_at`]: now,
    updated_at: now,
  };

  let newStatus: SeoPipelineStatus;
  if (decision === 'approve') {
    const gateIndex = PHASE_ORDER.indexOf(gate);
    const nextPhase = PHASE_ORDER[gateIndex + 1];
    if (!nextPhase) {
      newStatus = 'published';
      gateUpdate.published_at = now;
    } else {
      newStatus = PHASE_TO_STATUS[nextPhase] || 'publishing';
    }
    gateUpdate.status = newStatus;
    gateUpdate.current_phase = gateIndex + 1;
  } else if (decision === 'revise') {
    if (gate === 'gate1') {
      newStatus = 'writing';
      gateUpdate.current_phase = PHASE_ORDER.indexOf('writing');
    } else {
      newStatus = 'visual_qa';
      gateUpdate.current_phase = PHASE_ORDER.indexOf('visual_qa');
    }
    gateUpdate.status = newStatus;
  } else {
    newStatus = 'scrapped';
    gateUpdate.status = newStatus;
  }

  await supabase.from('seo_pipeline_runs').update(gateUpdate).eq('id', runId);

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

export async function getRunWithCalls(
  supabase: SupabaseClient,
  runId: string
): Promise<SeoPipelineRun & { agent_calls: SeoAgentCall[] }> {
  const { data: run, error } = await supabase
    .from('seo_pipeline_runs')
    .select('*, team_config:seo_team_configs(*)')
    .eq('id', runId).single();
  if (error || !run) throw new Error(`Pipeline run not found: ${runId}`);
  const { data: calls } = await supabase
    .from('seo_agent_calls').select('*')
    .eq('pipeline_run_id', runId).order('created_at', { ascending: true });
  return { ...(run as SeoPipelineRun), agent_calls: (calls as SeoAgentCall[]) || [] };
}

export async function getTeamConfig(
  supabase: SupabaseClient,
  configId: string
): Promise<SeoTeamConfig | null> {
  const { data } = await supabase.from('seo_team_configs').select('*').eq('id', configId).single();
  return (data as SeoTeamConfig) ?? null;
}

// --- Internal helpers ---

async function updateRunCosts(supabase: SupabaseClient, runId: string, agentName: string, costUsd: number): Promise<void> {
  const { data: run } = await supabase.from('seo_pipeline_runs').select('total_cost_usd, agent_costs').eq('id', runId).single();
  if (!run) return;
  const currentTotal = Number(run.total_cost_usd) || 0;
  const currentAgentCosts = (run.agent_costs as Record<string, number>) || {};
  const currentAgentCost = currentAgentCosts[agentName] || 0;
  await supabase.from('seo_pipeline_runs').update({
    total_cost_usd: Math.round((currentTotal + costUsd) * 1_000_000) / 1_000_000,
    agent_costs: { ...currentAgentCosts, [agentName]: Math.round((currentAgentCost + costUsd) * 1_000_000) / 1_000_000 },
    updated_at: new Date().toISOString(),
  }).eq('id', runId);
}

async function appendRunError(supabase: SupabaseClient, runId: string, phase: string, errorMessage: string): Promise<void> {
  const { data: run } = await supabase.from('seo_pipeline_runs').select('error_log, status').eq('id', runId).single();
  if (!run) return;
  const errorLog = (run.error_log as Array<{ phase: string; error: string; timestamp: string }>) || [];
  errorLog.push({ phase, error: errorMessage, timestamp: new Date().toISOString() });
  await supabase.from('seo_pipeline_runs').update({
    error_log: errorLog, status: 'failed' as SeoPipelineStatus, updated_at: new Date().toISOString(),
  }).eq('id', runId);
}

function buildPhaseArtifacts(phase: string, agentOutput: string, run: Record<string, unknown>): Record<string, unknown> {
  switch (phase) {
    case 'planning': return { outline: agentOutput, topic: run.topic, silo: run.silo };
    case 'writing': return { draft: agentOutput, word_count: agentOutput.split(/\s+/).length };
    case 'qc': {
      const m = agentOutput.match(/"(?:score|qc_score)":\s*(\d+(?:\.\d+)?)/);
      return { qc_report: agentOutput, qc_score: m ? parseFloat(m[1]) : null };
    }
    case 'humanizing': return { humanized_content: agentOutput, word_count: agentOutput.split(/\s+/).length };
    case 'scoring': {
      const m = agentOutput.match(/"(?:score|value_score)":\s*(\d+(?:\.\d+)?)/);
      return { value_report: agentOutput, value_score: m ? parseFloat(m[1]) : null };
    }
    case 'publishing': return { publish_result: agentOutput };
    case 'visual_qa': {
      const m = agentOutput.match(/"(?:score|visual_qa_score)":\s*(\d+(?:\.\d+)?)/);
      return { visual_qa_report: agentOutput, visual_qa_score: m ? parseFloat(m[1]) : null };
    }
    default: return { raw_output: agentOutput };
  }
}

function getPhaseFieldUpdates(phase: string, agentOutput: string, artifacts: Record<string, unknown>): Record<string, unknown> {
  switch (phase) {
    case 'writing': return { final_content: agentOutput };
    case 'humanizing': return { humanized_content: agentOutput };
    case 'qc': return artifacts.qc_score != null ? { qc_score: artifacts.qc_score } : {};
    case 'scoring': return artifacts.value_score != null ? { value_score: artifacts.value_score } : {};
    case 'visual_qa': return artifacts.visual_qa_score != null ? { visual_qa_score: artifacts.visual_qa_score } : {};
    default: return {};
  }
}
