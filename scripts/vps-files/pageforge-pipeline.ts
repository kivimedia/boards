import { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

// ============================================================================
// PAGEFORGE PIPELINE ENGINE (VPS)
// Constants, AI call function, phase tracking, and helpers.
// ============================================================================

// v2 phase order: desktop-first build, then mobile optimization
export const PAGEFORGE_PHASE_ORDER: string[] = [
  // Pre-build
  'preflight',                    // 0: Validate WP + both Figma files
  'auto_name',                    // 1: AI layer naming suggestions
  // Figma analysis
  'figma_analysis',               // 2: Extract design data from Desktop Figma
  'section_classification',       // 3: AI classifies sections
  // Element mapping gate (skippable)
  'element_mapping_gate',         // 4: AI proposes Divi5 module per section, user reviews
  // Desktop build
  'markup_generation',            // 5: Generate desktop markup using approved mappings
  'markup_validation',            // 6: Validate block syntax
  'deploy_draft',                 // 7: Push draft to WordPress
  'draft_review_gate',            // 8: Human reviews deployed draft
  'image_optimization',           // 9: Download/compress/upload images
  // Desktop VQA
  'vqa_capture',                  // 10: Screenshot WP at 1440px ONLY
  'vqa_comparison',               // 11: Compare WP desktop vs Desktop Figma
  'vqa_fix_loop',                 // 12: AI fixes desktop issues
  'functional_qa',                // 13: Desktop functional checks
  // Mobile optimization
  'mobile_markup_generation',     // 14: Generate responsive CSS from Mobile Figma
  'mobile_deploy',                // 15: Push mobile styles to WP
  // Mobile VQA
  'mobile_vqa_capture',           // 16: Screenshot WP at 375px
  'mobile_vqa_comparison',        // 17: Compare WP mobile vs Mobile Figma
  'mobile_vqa_fix_loop',          // 18: AI fixes mobile issues
  'mobile_functional_qa',         // 19: Mobile functional checks
  // Animation
  'animation_detection',          // 20: Parse animation annotations from Figma
  'animation_implementation',     // 21: Divi 5 animations or CSS @keyframes
  // Finish
  'seo_config',                   // 22: Yoast meta, alt tags, headings
  'report_generation',            // 23: Final build report
  'final_review_gate',            // 24: Side-by-side desktop + mobile review
  'am_signoff_gate',              // 25: Final AM sign-off
];

export const GATE_PHASES = new Set<string>([
  'element_mapping_gate',
  'draft_review_gate',
  'final_review_gate',
  'am_signoff_gate',
]);

export const PHASE_TO_ACTIVITY: Record<string, string> = {
  preflight: 'pageforge_orchestrator',
  auto_name: 'pageforge_orchestrator',
  figma_analysis: 'pageforge_builder',
  section_classification: 'pageforge_builder',
  element_mapping_gate: 'pageforge_builder',
  markup_generation: 'pageforge_builder',
  markup_validation: 'pageforge_builder',
  deploy_draft: 'pageforge_builder',
  image_optimization: 'pageforge_builder',
  vqa_capture: 'pageforge_vqa',
  vqa_comparison: 'pageforge_vqa',
  vqa_fix_loop: 'pageforge_vqa',
  functional_qa: 'pageforge_qa',
  mobile_markup_generation: 'pageforge_builder',
  mobile_deploy: 'pageforge_builder',
  mobile_vqa_capture: 'pageforge_vqa',
  mobile_vqa_comparison: 'pageforge_vqa',
  mobile_vqa_fix_loop: 'pageforge_vqa',
  mobile_functional_qa: 'pageforge_qa',
  animation_detection: 'pageforge_builder',
  animation_implementation: 'pageforge_builder',
  seo_config: 'pageforge_seo',
  report_generation: 'pageforge_orchestrator',
  final_review_gate: 'pageforge_orchestrator',
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
  const maxTokens = options?.maxTokens || 16384;
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

    // Use streaming to avoid timeout for large token requests
    const stream = anthropicClient.messages.stream({
      model, max_tokens: maxTokens, temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content }],
    });
    const response = await stream.finalMessage();

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
    pageforge_builder: `You are the PageForge Builder agent - a senior frontend developer and WordPress expert who converts Figma designs into production-quality WordPress pages.

You produce BEAUTIFUL, pixel-perfect pages that look like they were hand-coded by a top agency. Your pages are indistinguishable from professional custom themes.

CRITICAL RULES:
1. When given a Figma design image, study it meticulously. Match EVERY visual detail: colors, fonts, spacing, layout, alignment, shadows, gradients, border-radius.
2. Generate COMPLETE markup for the ENTIRE page - every section from top to bottom. NEVER skip sections, abbreviate, or leave placeholders.
3. EVERY HTML element MUST have inline styles. Never rely on WordPress theme defaults - they look generic and ugly. Set font-family, font-size, font-weight, color, background-color, padding, margin, line-height explicitly.
4. Use the EXACT hex colors and font families from the design tokens. The primary font family goes on EVERY text element. Not just headings - paragraphs, buttons, links, list items, everything.
5. Build responsive layouts: use CSS Grid for card layouts (grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))), flexbox for alignment, max-width:1200px for content containers.
6. Output length does NOT matter - a 50,000+ character response is expected for a full landing page. Quality and completeness are what matter. NEVER truncate.
7. Always respond with valid JSON when the prompt asks for JSON output.
8. For images: use descriptive alt text. Image containers must have explicit width/height and object-fit:cover.
9. Sections need proper vertical rhythm: 60-100px padding between major sections, consistent gap values within.
10. Dark sections need light text (#ffffff or #f0f0f0), light sections need dark text (#001738 or #333). ALWAYS set explicit text color.`,
    pageforge_vqa: `You are the PageForge VQA (Visual Quality Assurance) agent - a meticulous visual design reviewer.

CRITICAL RULES:
1. Compare screenshots pixel-by-pixel. Check EVERY section from top to bottom.
2. Missing sections are CRITICAL - if the Figma shows 8 sections but WordPress only has 4, that's a score below 50.
3. Be STRICT with scoring: only give 90+ if the page is nearly pixel-perfect.
4. For EVERY difference, provide a specific, actionable CSS/markup fix - not vague suggestions.
5. When fixing markup, output the COMPLETE page markup, not just the changed parts. NEVER truncate.
6. Always respond with valid JSON when the prompt asks for JSON output.`,
    pageforge_qa: `You are the PageForge QA agent. You validate links, check responsive behavior, run Lighthouse audits, and perform accessibility checks. Report pass/fail for each check with details.`,
    pageforge_seo: `You are the PageForge SEO agent. You generate meta titles (max 60 chars), descriptions (max 155 chars), focus keyphrases, alt tags, and validate heading hierarchy. Configure Yoast SEO via REST API. Always respond with valid JSON when the prompt asks for JSON output.`,
  };
  return prompts[activity] || prompts.pageforge_builder;
}
