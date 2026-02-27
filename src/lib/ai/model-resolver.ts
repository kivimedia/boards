import { SupabaseClient } from '@supabase/supabase-js';
import type { AIActivity, AIModelConfig, AIProvider } from '../types';

// ============================================================================
// MODEL RESOLVER
// ============================================================================

/**
 * Get the configured model for a specific AI activity.
 * Falls back to defaults if no configuration exists.
 */
export async function resolveModel(
  supabase: SupabaseClient,
  activity: AIActivity
): Promise<AIModelConfig | null> {
  const { data } = await supabase
    .from('ai_model_config')
    .select('*')
    .eq('activity', activity)
    .eq('is_active', true)
    .limit(1)
    .single();

  return data as AIModelConfig | null;
}

/**
 * Get all active model configurations.
 */
export async function getAllModelConfigs(
  supabase: SupabaseClient
): Promise<AIModelConfig[]> {
  const { data } = await supabase
    .from('ai_model_config')
    .select('*')
    .eq('is_active', true)
    .order('activity');

  return (data as AIModelConfig[]) ?? [];
}

/**
 * Update a model configuration for a specific activity.
 */
export async function updateModelConfig(
  supabase: SupabaseClient,
  activity: AIActivity,
  updates: {
    provider?: AIProvider;
    model_id?: string;
    temperature?: number;
    max_tokens?: number;
    is_active?: boolean;
  }
): Promise<AIModelConfig | null> {
  const { data } = await supabase
    .from('ai_model_config')
    .update(updates)
    .eq('activity', activity)
    .select()
    .single();

  return data as AIModelConfig | null;
}

// ============================================================================
// DEFAULT FALLBACKS
// ============================================================================

const DEFAULT_CONFIGS: Record<AIActivity, { provider: AIProvider; model_id: string; temperature: number; max_tokens: number }> = {
  design_review: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.3, max_tokens: 4096 },
  dev_qa: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.2, max_tokens: 4096 },
  chatbot_ticket: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.7, max_tokens: 2048 },
  chatbot_board: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.7, max_tokens: 4096 },
  chatbot_global: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.7, max_tokens: 4096 },
  client_brain: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.5, max_tokens: 4096 },
  nano_banana_edit: { provider: 'google', model_id: 'gemini-2.0-flash-exp', temperature: 0.7, max_tokens: 1024 },
  nano_banana_generate: { provider: 'google', model_id: 'gemini-2.0-flash-exp', temperature: 0.8, max_tokens: 1024 },
  email_draft: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.6, max_tokens: 2048 },
  video_generation: { provider: 'openai', model_id: 'sora-2', temperature: 0.7, max_tokens: 1024 },
  brief_assist: { provider: 'anthropic', model_id: 'claude-haiku-4-5-20251001', temperature: 0.5, max_tokens: 1024 },
  agent_execution: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.4, max_tokens: 8192 },
  agent_standalone_execution: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.4, max_tokens: 8192 },
  web_research: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.3, max_tokens: 8192 },
  replicate_generate: { provider: 'replicate', model_id: 'flux-1.1-pro', temperature: 0.8, max_tokens: 1024 },
  image_prompt_enhance: { provider: 'anthropic', model_id: 'claude-haiku-4-5-20251001', temperature: 0.7, max_tokens: 1024 },
  knowledge_index: { provider: 'openai', model_id: 'text-embedding-3-small', temperature: 0, max_tokens: 0 },
  board_summary: { provider: 'anthropic', model_id: 'claude-haiku-4-5-20251001', temperature: 0.3, max_tokens: 600 },
};

/**
 * Resolve model with fallback to hardcoded defaults.
 * Use this when you need a guaranteed config even if DB is empty.
 */
export async function resolveModelWithFallback(
  supabase: SupabaseClient,
  activity: AIActivity
): Promise<{ provider: AIProvider; model_id: string; temperature: number; max_tokens: number }> {
  const dbConfig = await resolveModel(supabase, activity);
  if (dbConfig) {
    return {
      provider: dbConfig.provider as AIProvider,
      model_id: dbConfig.model_id,
      temperature: Number(dbConfig.temperature),
      max_tokens: dbConfig.max_tokens,
    };
  }
  return DEFAULT_CONFIGS[activity];
}

/**
 * Get the default config for an activity (no DB lookup).
 */
export function getDefaultConfig(
  activity: AIActivity
): { provider: AIProvider; model_id: string; temperature: number; max_tokens: number } {
  return DEFAULT_CONFIGS[activity];
}

/**
 * Get all available AI activities.
 */
export function getAllActivities(): AIActivity[] {
  return Object.keys(DEFAULT_CONFIGS) as AIActivity[];
}

/**
 * Human-readable activity labels.
 */
export const ACTIVITY_LABELS: Record<AIActivity, string> = {
  design_review: 'Design Review',
  dev_qa: 'Dev QA',
  chatbot_ticket: 'Chatbot (Ticket)',
  chatbot_board: 'Chatbot (Board)',
  chatbot_global: 'Chatbot (Global)',
  client_brain: 'Client AI Brain',
  nano_banana_edit: 'Nano Banana Edit',
  nano_banana_generate: 'Nano Banana Generate',
  email_draft: 'Email Draft',
  video_generation: 'Video Generation',
  brief_assist: 'Brief Assist',
  agent_execution: 'Agent Execution',
  agent_standalone_execution: 'Agent (Standalone)',
  web_research: 'Web Research',
  replicate_generate: 'Replicate Generate (FLUX)',
  image_prompt_enhance: 'Image Prompt Enhance',
  knowledge_index: 'Knowledge Indexing',
  board_summary: 'Board Summary',
};
