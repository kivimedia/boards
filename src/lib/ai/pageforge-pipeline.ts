import { SupabaseClient } from '@supabase/supabase-js';
import { calculateCost } from './cost-tracker';
import { getProviderClient, getProviderKey, touchApiKey } from './providers';
import { resolveModelWithFallback } from './model-resolver';
import { getSystemPrompt } from './prompt-templates';
import type {
  PageForgeBuild,
  PageForgeBuildStatus,
  PageForgeSiteProfile,
  PageForgeAgentCall,
  PageForgeBuildPhase,
  PageForgeGateDecision,
  AIActivity,
  AIProvider,
} from '../types';

// ============================================================================
// PAGEFORGE PIPELINE ENGINE
//
// 15-phase Figma-to-WordPress build pipeline with human-in-the-loop gates.
// Mirrors the SEO pipeline architecture (seo-pipeline.ts) exactly.
//
// Phases:
//   0.  preflight               - Validate WP connection, Figma access, builder
//   1.  figma_analysis           - Parse Figma file, extract design tree
//   2.  section_classification   - AI classifies page sections by type/tier
//   3.  markup_generation        - Generate WP page markup (Gutenberg/Divi 5)
//   4.  markup_validation        - Validate block syntax and nesting
//   5.  deploy_draft             - Push draft page to WordPress
//   6.  image_optimization       - Download Figma images, compress, upload to WP
//   7.  vqa_capture              - Screenshot WP page at 3 breakpoints
//   8.  vqa_comparison           - Compare WP screenshots vs Figma renders
//   9.  vqa_fix_loop             - AI-suggested CSS/markup fixes (max N loops)
//  10.  functional_qa            - Links, responsive, Lighthouse, a11y checks
//  11.  seo_config               - Yoast meta, alt tags, heading hierarchy
//  12.  report_generation        - Compile final build report
//  13.  developer_review_gate    - Human approval checkpoint
//  14.  am_signoff_gate          - Final AM sign-off
//
// Designed to run from both Vercel API routes and VPS worker.
// All state is persisted to Supabase so runs survive restarts.
// ============================================================================

const PREVIEW_LENGTH = 500;

// ============================================================================
// MODEL PROFILES - Router for per-build model selection
// ============================================================================

export interface PageForgeModelProfile {
  id: string;
  label: string;
  description: string;
  estimatedCost: string;
  models: {
    orchestrator: string;
    builder: string;
    vqa: string;
    qa: string;
    seo: string;
  };
}

export const MODEL_PROFILES: PageForgeModelProfile[] = [
  {
    id: 'cost_optimized',
    label: 'Cost-Optimized',
    description: 'Gemini Flash for most agents, Claude Sonnet for Builder',
    estimatedCost: '~$2.50/build',
    models: {
      orchestrator: 'gemini-2.5-flash',
      builder: 'claude-sonnet-4-5-20250929',
      vqa: 'gemini-2.5-pro',
      qa: 'gemini-2.5-flash',
      seo: 'gemini-2.5-flash',
    },
  },
  {
    id: 'quality_first',
    label: 'Quality-First',
    description: 'Claude Sonnet for Builder, Gemini Pro for VQA, premium models throughout',
    estimatedCost: '~$6/build',
    models: {
      orchestrator: 'claude-sonnet-4-5-20250929',
      builder: 'claude-sonnet-4-5-20250929',
      vqa: 'gemini-2.5-pro',
      qa: 'claude-haiku-4-5-20251001',
      seo: 'claude-sonnet-4-5-20250929',
    },
  },
  {
    id: 'budget',
    label: 'Budget',
    description: 'Cheapest models for all agents - good for simple landing pages',
    estimatedCost: '~$1/build',
    models: {
      orchestrator: 'gemini-2.5-flash',
      builder: 'claude-haiku-4-5-20251001',
      vqa: 'gemini-2.5-flash',
      qa: 'gemini-2.5-flash',
      seo: 'gemini-2.5-flash',
    },
  },
];

export const PAGEFORGE_PHASE_ORDER: string[] = [
  'preflight',
  'figma_analysis',
  'section_classification',
  'markup_generation',
  'markup_validation',
  'deploy_draft',
  'image_optimization',
  'vqa_capture',
  'vqa_comparison',
  'vqa_fix_loop',
  'functional_qa',
  'seo_config',
  'report_generation',
  'developer_review_gate',
  'am_signoff_gate',
];

const PHASE_TO_STATUS: Record<string, PageForgeBuildStatus> = {
  preflight: 'preflight',
  figma_analysis: 'figma_analysis',
  section_classification: 'section_classification',
  markup_generation: 'markup_generation',
  markup_validation: 'markup_validation',
  deploy_draft: 'deploy_draft',
  image_optimization: 'image_optimization',
  vqa_capture: 'vqa_capture',
  vqa_comparison: 'vqa_comparison',
  vqa_fix_loop: 'vqa_fix_loop',
  functional_qa: 'functional_qa',
  seo_config: 'seo_config',
  report_generation: 'report_generation',
  developer_review_gate: 'developer_review_gate',
  am_signoff_gate: 'am_signoff_gate',
};

// Map phases to their AI activity for model resolution
const PHASE_TO_ACTIVITY: Record<string, AIActivity> = {
  preflight: 'pageforge_orchestrator',
  figma_analysis: 'pageforge_builder',
  section_classification: 'pageforge_builder',
  markup_generation: 'pageforge_builder',
  markup_validation: 'pageforge_builder',
  deploy_draft: 'pageforge_builder',
  image_optimization: 'pageforge_builder',
  vqa_capture: 'pageforge_vqa',
  vqa_comparison: 'pageforge_vqa',
  vqa_fix_loop: 'pageforge_vqa',
  functional_qa: 'pageforge_qa',
  seo_config: 'pageforge_seo',
  report_generation: 'pageforge_orchestrator',
};

const GATE_PHASES = new Set(['developer_review_gate', 'am_signoff_gate']);

// ============================================================================
// CREATE BUILD
// ============================================================================

export async function createBuild(
  supabase: SupabaseClient,
  siteProfile: PageForgeSiteProfile,
  params: {
    figmaFileKey: string;
    figmaNodeIds: string[];
    pageTitle: string;
    pageSlug?: string;
    createdBy?: string;
  }
): Promise<PageForgeBuild> {
  const { data, error } = await supabase
    .from('pageforge_builds')
    .insert({
      site_profile_id: siteProfile.id,
      client_id: siteProfile.client_id,
      figma_file_key: params.figmaFileKey,
      figma_node_ids: params.figmaNodeIds,
      page_title: params.pageTitle,
      page_slug: params.pageSlug || null,
      page_builder: siteProfile.page_builder,
      status: 'pending' as PageForgeBuildStatus,
      current_phase: 0,
      phase_results: {},
      artifacts: {},
      error_log: [],
      total_cost_usd: 0,
      agent_costs: {},
      created_by: params.createdBy || null,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to create PageForge build: ${error.message}`);
  }

  return data as PageForgeBuild;
}

// ============================================================================
// CALL PAGEFORGE AGENT (multi-provider AI call with cost tracking)
// ============================================================================

export interface PageForgeAgentCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  model: string;
  provider: string;
}

export async function callPageForgeAgent(
  supabase: SupabaseClient,
  buildId: string,
  agentName: string,
  phase: string,
  systemPrompt: string,
  userMessage: string,
  options?: {
    activity?: AIActivity;
    images?: Array<{ data: string; mimeType: string }>;
  }
): Promise<PageForgeAgentCallResult> {
  const startTime = Date.now();
  const activity = options?.activity || PHASE_TO_ACTIVITY[phase] || 'pageforge_builder';

  // Resolve model config
  const config = await resolveModelWithFallback(supabase, activity);
  const provider = config.provider as AIProvider;
  const modelId = config.model_id;

  // Get iteration count
  const { count: existingCalls } = await supabase
    .from('pageforge_agent_calls')
    .select('id', { count: 'exact', head: true })
    .eq('build_id', buildId)
    .eq('agent_name', agentName)
    .eq('phase', phase);

  const iteration = (existingCalls ?? 0) + 1;

  try {
    let text = '';
    let inputTokens = 0;
    let outputTokens = 0;

    if (provider === 'anthropic') {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const apiKey = await getProviderKey(supabase, 'anthropic');
      if (!apiKey) throw new Error('Anthropic API key not configured');
      const client = new Anthropic({ apiKey });

      const messages: Array<{ role: 'user'; content: any }> = [];

      if (options?.images && options.images.length > 0) {
        const content: any[] = options.images.map(img => ({
          type: 'image',
          source: { type: 'base64', media_type: img.mimeType, data: img.data },
        }));
        content.push({ type: 'text', text: userMessage });
        messages.push({ role: 'user', content });
      } else {
        messages.push({ role: 'user', content: userMessage });
      }

      const response = await client.messages.create({
        model: modelId,
        max_tokens: config.max_tokens,
        temperature: config.temperature,
        system: systemPrompt,
        messages,
      });

      text = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('\n');
      inputTokens = response.usage.input_tokens;
      outputTokens = response.usage.output_tokens;

    } else if (provider === 'google') {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const apiKey = await getProviderKey(supabase, 'google');
      if (!apiKey) throw new Error('Google AI API key not configured');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelId });

      const parts: any[] = [];

      if (options?.images && options.images.length > 0) {
        for (const img of options.images) {
          parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
        }
      }
      parts.push({ text: userMessage });

      const result = await model.generateContent({
        contents: [{ role: 'user', parts }],
        systemInstruction: { role: 'model', parts: [{ text: systemPrompt }] },
        generationConfig: {
          temperature: config.temperature,
          maxOutputTokens: config.max_tokens,
        },
      });

      text = result.response.text();
      const usage = result.response.usageMetadata;
      inputTokens = usage?.promptTokenCount || 0;
      outputTokens = usage?.candidatesTokenCount || 0;

    } else if (provider === 'openai') {
      const OpenAI = (await import('openai')).default;
      const apiKey = await getProviderKey(supabase, 'openai');
      if (!apiKey) throw new Error('OpenAI API key not configured');
      const client = new OpenAI({ apiKey });

      const messages: any[] = [
        { role: 'system', content: systemPrompt },
      ];

      if (options?.images && options.images.length > 0) {
        const content: any[] = options.images.map(img => ({
          type: 'image_url',
          image_url: { url: `data:${img.mimeType};base64,${img.data}` },
        }));
        content.push({ type: 'text', text: userMessage });
        messages.push({ role: 'user', content });
      } else {
        messages.push({ role: 'user', content: userMessage });
      }

      const response = await client.chat.completions.create({
        model: modelId,
        messages,
        max_tokens: config.max_tokens,
        temperature: config.temperature,
      });

      text = response.choices[0]?.message?.content || '';
      inputTokens = response.usage?.prompt_tokens || 0;
      outputTokens = response.usage?.completion_tokens || 0;
    }

    const durationMs = Date.now() - startTime;
    const costUsd = calculateCost(provider, modelId, inputTokens, outputTokens);

    await touchApiKey(supabase, provider);

    // Log the agent call
    await supabase.from('pageforge_agent_calls').insert({
      build_id: buildId,
      agent_name: agentName,
      phase,
      model_used: modelId,
      provider,
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

    // Update build cost totals
    await updateBuildCosts(supabase, buildId, agentName, costUsd);

    return { text, inputTokens, outputTokens, costUsd, durationMs, model: modelId, provider };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Log failed call
    await supabase.from('pageforge_agent_calls').insert({
      build_id: buildId,
      agent_name: agentName,
      phase,
      model_used: modelId,
      provider,
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

    await appendBuildError(supabase, buildId, phase, errorMessage);
    throw err;
  }
}

// ============================================================================
// RUN PHASE
// ============================================================================

export interface PageForgePhaseResult {
  phase: string;
  agentResult?: PageForgeAgentCallResult;
  artifacts: Record<string, unknown>;
}

export async function runPageForgePhase(
  supabase: SupabaseClient,
  buildId: string,
  phase: string,
  phaseConfig: {
    systemPrompt: string;
    userMessage: string;
    activity?: AIActivity;
    agentName?: string;
    images?: Array<{ data: string; mimeType: string }>;
    skipAiCall?: boolean;
    directResult?: Record<string, unknown>;
  }
): Promise<PageForgePhaseResult> {
  if (!PAGEFORGE_PHASE_ORDER.includes(phase)) {
    throw new Error(`Unknown phase: ${phase}. Valid: ${PAGEFORGE_PHASE_ORDER.join(', ')}`);
  }

  if (GATE_PHASES.has(phase)) {
    throw new Error(`Gate phases (${phase}) require human input. Use submitPageForgeGateDecision() instead.`);
  }

  // Fetch current build
  const { data: build, error } = await supabase
    .from('pageforge_builds')
    .select('*')
    .eq('id', buildId)
    .single();

  if (error || !build) {
    throw new Error(`PageForge build not found: ${buildId}`);
  }

  if (build.status === 'failed' || build.status === 'cancelled' || build.status === 'published') {
    throw new Error(`Build ${buildId} is in terminal state: ${build.status}`);
  }

  const phaseIndex = PAGEFORGE_PHASE_ORDER.indexOf(phase);
  const phaseStatus = PHASE_TO_STATUS[phase] || 'pending';

  // Record phase start
  const { data: phaseRecord } = await supabase
    .from('pageforge_build_phases')
    .insert({
      build_id: buildId,
      phase_name: phase,
      phase_index: phaseIndex,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  // Update build status
  await supabase
    .from('pageforge_builds')
    .update({
      status: phaseStatus,
      current_phase: phaseIndex,
      updated_at: new Date().toISOString(),
    })
    .eq('id', buildId);

  const phaseStartTime = Date.now();
  let agentResult: PageForgeAgentCallResult | undefined;
  let artifacts: Record<string, unknown> = {};

  try {
    if (phaseConfig.skipAiCall && phaseConfig.directResult) {
      artifacts = phaseConfig.directResult;
    } else {
      const agentName = phaseConfig.agentName || `pageforge_${phase}`;
      agentResult = await callPageForgeAgent(
        supabase,
        buildId,
        agentName,
        phase,
        phaseConfig.systemPrompt,
        phaseConfig.userMessage,
        {
          activity: phaseConfig.activity,
          images: phaseConfig.images,
        }
      );
      artifacts = { output: agentResult.text };
    }

    // Persist phase results
    const updatedPhaseResults = { ...(build.phase_results || {}), [phase]: agentResult?.text || artifacts };
    const updatedArtifacts = { ...(build.artifacts || {}), [phase]: artifacts };

    // Determine next status
    const nextPhase = PAGEFORGE_PHASE_ORDER[phaseIndex + 1];
    const nextStatus: PageForgeBuildStatus = nextPhase
      ? (PHASE_TO_STATUS[nextPhase] || 'pending')
      : 'published';

    await supabase
      .from('pageforge_builds')
      .update({
        phase_results: updatedPhaseResults,
        artifacts: updatedArtifacts,
        status: nextStatus,
        current_phase: phaseIndex + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', buildId);

    // Complete phase record
    if (phaseRecord?.id) {
      await supabase
        .from('pageforge_build_phases')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - phaseStartTime,
          result: artifacts,
        })
        .eq('id', phaseRecord.id);
    }

    return { phase, agentResult, artifacts };
  } catch (err) {
    // Mark phase as failed
    if (phaseRecord?.id) {
      await supabase
        .from('pageforge_build_phases')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - phaseStartTime,
          error_message: err instanceof Error ? err.message : String(err),
        })
        .eq('id', phaseRecord.id);
    }

    await supabase
      .from('pageforge_builds')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', buildId);

    throw err;
  }
}

// ============================================================================
// SUBMIT GATE DECISION
// ============================================================================

export async function submitPageForgeGateDecision(
  supabase: SupabaseClient,
  buildId: string,
  gate: 'developer_review_gate' | 'am_signoff_gate',
  decision: PageForgeGateDecision,
  feedback: string | null,
  userId: string
): Promise<{ newStatus: PageForgeBuildStatus }> {
  const now = new Date().toISOString();

  const { data: build, error } = await supabase
    .from('pageforge_builds')
    .select('*')
    .eq('id', buildId)
    .single();

  if (error || !build) {
    throw new Error(`Build not found: ${buildId}`);
  }

  const gatePrefix = gate === 'developer_review_gate' ? 'dev_gate' : 'am_gate';
  const gateUpdate: Record<string, unknown> = {
    [`${gatePrefix}_decision`]: decision,
    [`${gatePrefix}_feedback`]: feedback,
    [`${gatePrefix}_decided_by`]: userId,
    [`${gatePrefix}_decided_at`]: now,
    updated_at: now,
  };

  let newStatus: PageForgeBuildStatus;

  if (decision === 'approve') {
    const gateIndex = PAGEFORGE_PHASE_ORDER.indexOf(gate);
    const nextPhase = PAGEFORGE_PHASE_ORDER[gateIndex + 1];

    if (!nextPhase) {
      newStatus = 'published';
      gateUpdate.published_at = now;
    } else {
      newStatus = PHASE_TO_STATUS[nextPhase] || 'pending';
    }

    gateUpdate.status = newStatus;
    gateUpdate.current_phase = gateIndex + 1;
  } else if (decision === 'revise') {
    // Dev gate -> back to markup_generation, AM gate -> back to vqa_capture
    if (gate === 'developer_review_gate') {
      newStatus = 'markup_generation';
      gateUpdate.current_phase = PAGEFORGE_PHASE_ORDER.indexOf('markup_generation');
    } else {
      newStatus = 'vqa_capture';
      gateUpdate.current_phase = PAGEFORGE_PHASE_ORDER.indexOf('vqa_capture');
    }
    gateUpdate.status = newStatus;
  } else {
    // cancel
    newStatus = 'cancelled';
    gateUpdate.status = newStatus;
  }

  await supabase
    .from('pageforge_builds')
    .update(gateUpdate)
    .eq('id', buildId);

  // Log gate decision as agent call for audit trail
  await supabase.from('pageforge_agent_calls').insert({
    build_id: buildId,
    agent_name: `human_${gatePrefix}`,
    phase: gate,
    model_used: null,
    provider: null,
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
// GET BUILD WITH CALLS
// ============================================================================

export async function getBuildWithCalls(
  supabase: SupabaseClient,
  buildId: string
): Promise<PageForgeBuild & { agent_calls: PageForgeAgentCall[]; phases: PageForgeBuildPhase[] }> {
  const { data: build, error } = await supabase
    .from('pageforge_builds')
    .select('*, site_profile:pageforge_site_profiles(*)')
    .eq('id', buildId)
    .single();

  if (error || !build) {
    throw new Error(`Build not found: ${buildId}`);
  }

  const [{ data: calls }, { data: phases }] = await Promise.all([
    supabase
      .from('pageforge_agent_calls')
      .select('*')
      .eq('build_id', buildId)
      .order('created_at', { ascending: true }),
    supabase
      .from('pageforge_build_phases')
      .select('*')
      .eq('build_id', buildId)
      .order('phase_index', { ascending: true }),
  ]);

  return {
    ...(build as PageForgeBuild),
    agent_calls: (calls as PageForgeAgentCall[]) || [],
    phases: (phases as PageForgeBuildPhase[]) || [],
  };
}

export async function listBuilds(
  supabase: SupabaseClient,
  filters?: { clientId?: string; siteProfileId?: string; status?: PageForgeBuildStatus }
): Promise<PageForgeBuild[]> {
  let query = supabase
    .from('pageforge_builds')
    .select('*, site_profile:pageforge_site_profiles(id, site_name, site_url)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (filters?.clientId) query = query.eq('client_id', filters.clientId);
  if (filters?.siteProfileId) query = query.eq('site_profile_id', filters.siteProfileId);
  if (filters?.status) query = query.eq('status', filters.status);

  const { data } = await query;
  return (data as PageForgeBuild[]) || [];
}

// ============================================================================
// HELPERS
// ============================================================================

async function updateBuildCosts(
  supabase: SupabaseClient,
  buildId: string,
  agentName: string,
  costUsd: number
): Promise<void> {
  const { data: build } = await supabase
    .from('pageforge_builds')
    .select('total_cost_usd, agent_costs')
    .eq('id', buildId)
    .single();

  if (!build) return;

  const currentTotal = Number(build.total_cost_usd) || 0;
  const currentAgentCosts = (build.agent_costs as Record<string, number>) || {};
  const currentAgentCost = currentAgentCosts[agentName] || 0;

  await supabase
    .from('pageforge_builds')
    .update({
      total_cost_usd: currentTotal + costUsd,
      agent_costs: { ...currentAgentCosts, [agentName]: currentAgentCost + costUsd },
    })
    .eq('id', buildId);
}

async function appendBuildError(
  supabase: SupabaseClient,
  buildId: string,
  phase: string,
  errorMessage: string
): Promise<void> {
  const { data: build } = await supabase
    .from('pageforge_builds')
    .select('error_log')
    .eq('id', buildId)
    .single();

  if (!build) return;

  const errorLog = (build.error_log as Array<{ phase: string; error: string; timestamp: string }>) || [];
  errorLog.push({ phase, error: errorMessage, timestamp: new Date().toISOString() });

  await supabase
    .from('pageforge_builds')
    .update({ error_log: errorLog })
    .eq('id', buildId);
}

export { PHASE_TO_ACTIVITY, GATE_PHASES };
