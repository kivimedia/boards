import { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

// ============================================================================
// PAGEFORGE PIPELINE ENGINE (VPS)
// Constants, AI call function, phase tracking, and helpers.
// ============================================================================

export const PAGEFORGE_PHASE_ORDER: string[] = [
  'preflight', 'auto_name', 'figma_analysis', 'section_classification', 'markup_generation',
  'markup_validation', 'deploy_draft', 'image_optimization', 'vqa_capture',
  'vqa_comparison', 'vqa_fix_loop', 'functional_qa', 'seo_config',
  'report_generation', 'developer_review_gate', 'am_signoff_gate',
];

export const GATE_PHASES = new Set<string>(['developer_review_gate', 'am_signoff_gate']);

export const PHASE_TO_ACTIVITY: Record<string, string> = {
  preflight: 'pageforge_orchestrator', auto_name: 'pageforge_orchestrator', figma_analysis: 'pageforge_builder',
  section_classification: 'pageforge_builder', markup_generation: 'pageforge_builder',
  markup_validation: 'pageforge_builder', deploy_draft: 'pageforge_builder',
  image_optimization: 'pageforge_builder', vqa_capture: 'pageforge_vqa',
  vqa_comparison: 'pageforge_vqa', vqa_fix_loop: 'pageforge_vqa',
  functional_qa: 'pageforge_qa', seo_config: 'pageforge_seo',
  report_generation: 'pageforge_orchestrator',
};

// Models per activity (can be overridden via DB)
const ACTIVITY_MODELS: Record<string, string> = {
  pageforge_orchestrator: 'claude-sonnet-4-5-20250929',
  pageforge_builder: 'claude-sonnet-4-5-20250929',
  pageforge_vqa: 'claude-sonnet-4-5-20250929',
  pageforge_qa: 'claude-sonnet-4-5-20250929',
  pageforge_seo: 'claude-sonnet-4-5-20250929',
};

// ============================================================================
// AGENT CALL RESULT
// ============================================================================

export interface AgentCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  model: string;
}

// ============================================================================
// CALL PAGEFORGE AGENT (Anthropic AI call with cost tracking + logging)
// ============================================================================

export async function callPageForgeAgent(
  supabase: SupabaseClient,
  buildId: string,
  agentName: string,
  phase: string,
  systemPrompt: string,
  userMessage: string,
  anthropicClient: Anthropic,
  options?: {
    images?: Array<{ data: string; mimeType: string }>;
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }
): Promise<AgentCallResult> {
  const startTime = Date.now();
  const activity = PHASE_TO_ACTIVITY[phase] || 'pageforge_builder';
  const model = options?.model || ACTIVITY_MODELS[activity] || 'claude-sonnet-4-5-20250929';
  const maxTokens = options?.maxTokens || 8192;
  const temperature = options?.temperature ?? 0.3;

  // Get iteration count
  const { count: existingCalls } = await supabase
    .from('pageforge_agent_calls')
    .select('id', { count: 'exact', head: true })
    .eq('build_id', buildId)
    .eq('agent_name', agentName)
    .eq('phase', phase);
  const iteration = (existingCalls ?? 0) + 1;

  try {
    // Build messages with optional images
    const content: Anthropic.MessageCreateParams['messages'][0]['content'] = [];
    if (options?.images?.length) {
      for (const img of options.images) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: img.mimeType as any, data: img.data },
        });
      }
    }
    content.push({ type: 'text', text: userMessage });

    const response = await anthropicClient.messages.create({
      model, max_tokens: maxTokens, temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content }],
    });

    const text = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const durationMs = Date.now() - startTime;
    const costUsd = calculateCost(model, inputTokens, outputTokens);

    // Log agent call
    await supabase.from('pageforge_agent_calls').insert({
      build_id: buildId, agent_name: agentName, phase, model_used: model,
      provider: 'anthropic', input_tokens: inputTokens, output_tokens: outputTokens,
      cost_usd: costUsd, duration_ms: durationMs, iteration,
      input_preview: userMessage.slice(0, 500), output_preview: text.slice(0, 500),
      status: 'success', error_message: null,
    });

    // Update build cost totals
    await updateBuildCosts(supabase, buildId, agentName, costUsd);

    return { text, inputTokens, outputTokens, costUsd, durationMs, model };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    await supabase.from('pageforge_agent_calls').insert({
      build_id: buildId, agent_name: agentName, phase, model_used: model,
      provider: 'anthropic', input_tokens: 0, output_tokens: 0,
      cost_usd: 0, duration_ms: durationMs, iteration,
      input_preview: userMessage.slice(0, 500), output_preview: null,
      status: 'failed', error_message: errorMessage,
    });

    throw err;
  }
}

// ============================================================================
// PHASE TRACKING
// ============================================================================

export async function startPhaseRecord(
  supabase: SupabaseClient, buildId: string, phase: string
): Promise<string | null> {
  const phaseIndex = PAGEFORGE_PHASE_ORDER.indexOf(phase);
  const { data } = await supabase
    .from('pageforge_build_phases')
    .insert({ build_id: buildId, phase_name: phase, phase_index: phaseIndex, status: 'running', started_at: new Date().toISOString() })
    .select('id')
    .single();

  // Update build status
  await supabase
    .from('pageforge_builds')
    .update({ current_phase: phaseIndex, status: phase, updated_at: new Date().toISOString() })
    .eq('id', buildId);

  return data?.id || null;
}

export async function completePhaseRecord(
  supabase: SupabaseClient, phaseRecordId: string | null, result: any, durationMs: number
): Promise<void> {
  if (!phaseRecordId) return;
  await supabase.from('pageforge_build_phases').update({
    status: 'completed', completed_at: new Date().toISOString(), duration_ms: durationMs, result,
  }).eq('id', phaseRecordId);
}

export async function failPhaseRecord(
  supabase: SupabaseClient, phaseRecordId: string | null, error: string, durationMs: number
): Promise<void> {
  if (!phaseRecordId) return;
  await supabase.from('pageforge_build_phases').update({
    status: 'failed', completed_at: new Date().toISOString(), duration_ms: durationMs, error_message: error,
  }).eq('id', phaseRecordId);
}

// ============================================================================
// BUILD HELPERS
// ============================================================================

export async function updateBuildArtifacts(
  supabase: SupabaseClient, buildId: string, phase: string, data: any
): Promise<void> {
  const { data: build } = await supabase.from('pageforge_builds').select('artifacts').eq('id', buildId).single();
  const artifacts = (build?.artifacts || {}) as Record<string, unknown>;
  artifacts[phase] = data;
  await supabase.from('pageforge_builds').update({ artifacts, updated_at: new Date().toISOString() }).eq('id', buildId);
}

export async function appendBuildError(
  supabase: SupabaseClient, buildId: string, phase: string, errorMessage: string
): Promise<void> {
  const { data: build } = await supabase.from('pageforge_builds').select('error_log').eq('id', buildId).single();
  const errorLog = (build?.error_log as any[] || []);
  errorLog.push({ phase, error: errorMessage, timestamp: new Date().toISOString() });
  await supabase.from('pageforge_builds').update({ error_log: errorLog }).eq('id', buildId);
}

async function updateBuildCosts(
  supabase: SupabaseClient, buildId: string, agentName: string, costUsd: number
): Promise<void> {
  const { data: build } = await supabase.from('pageforge_builds').select('total_cost_usd, agent_costs').eq('id', buildId).single();
  if (!build) return;
  const currentTotal = Number(build.total_cost_usd) || 0;
  const agentCosts = (build.agent_costs as Record<string, number>) || {};
  agentCosts[agentName] = (agentCosts[agentName] || 0) + costUsd;
  await supabase.from('pageforge_builds').update({ total_cost_usd: currentTotal + costUsd, agent_costs: agentCosts }).eq('id', buildId);
}

// ============================================================================
// COST CALCULATION
// ============================================================================

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Pricing per million tokens
  const pricing: Record<string, { input: number; output: number }> = {
    'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
    'claude-haiku-4-5-20251001': { input: 0.25, output: 1.25 },
    'claude-opus-4-6': { input: 15, output: 75 },
  };
  const p = pricing[model] || pricing['claude-sonnet-4-5-20250929'];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

// ============================================================================
// BUILD CHAT MESSAGES
// ============================================================================

export async function postBuildMessage(
  supabase: SupabaseClient,
  buildId: string,
  content: string,
  phase?: string,
  role: 'orchestrator' | 'system' = 'orchestrator'
): Promise<void> {
  const phaseIndex = phase ? PAGEFORGE_PHASE_ORDER.indexOf(phase) : null;
  await supabase.from('pageforge_build_messages').insert({
    build_id: buildId,
    role,
    sender_name: role === 'orchestrator' ? 'Orchestrator' : 'System',
    content,
    phase: phase || null,
    phase_index: phaseIndex !== null && phaseIndex >= 0 ? phaseIndex : null,
  });
}

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

export function getSystemPrompt(activity: string): string {
  const prompts: Record<string, string> = {
    pageforge_orchestrator: `You are the PageForge Orchestrator agent. You manage the build pipeline, run preflight checks, and compile final reports. Be precise and systematic.`,
    pageforge_builder: `You are the PageForge Builder agent. You analyze Figma designs, classify sections, generate WordPress markup (Gutenberg blocks or Divi 5 JSON), validate markup, deploy drafts, and optimize images. Follow WordPress coding standards strictly. Always respond with valid JSON when the prompt asks for JSON output.`,
    pageforge_vqa: `You are the PageForge VQA (Visual Quality Assurance) agent. You capture screenshots, compare WordPress renders against Figma designs, identify visual discrepancies, and suggest CSS/markup fixes. Score fidelity from 0-100. Always respond with valid JSON when the prompt asks for JSON output.`,
    pageforge_qa: `You are the PageForge QA agent. You validate links, check responsive behavior, run Lighthouse audits, and perform accessibility checks. Report pass/fail for each check with details.`,
    pageforge_seo: `You are the PageForge SEO agent. You generate meta titles (max 60 chars), descriptions (max 155 chars), focus keyphrases, alt tags, and validate heading hierarchy. Configure Yoast SEO via REST API. Always respond with valid JSON when the prompt asks for JSON output.`,
  };
  return prompts[activity] || prompts.pageforge_builder;
}
