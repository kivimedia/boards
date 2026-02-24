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
  chatbot_ticket: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.7, max_tokens: 2048 },
  chatbot_board: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.7, max_tokens: 4096 },
  chatbot_global: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.7, max_tokens: 4096 },
  email_draft: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.6, max_tokens: 2048 },
  brief_assist: { provider: 'anthropic', model_id: 'claude-haiku-4-5-20251001', temperature: 0.5, max_tokens: 1024 },
  image_prompt_enhance: { provider: 'anthropic', model_id: 'claude-haiku-4-5-20251001', temperature: 0.7, max_tokens: 1024 },
  proposal_generation: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.5, max_tokens: 4096 },
  lead_triage: { provider: 'anthropic', model_id: 'claude-haiku-4-5-20251001', temperature: 0.3, max_tokens: 2048 },
  follow_up_draft: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.6, max_tokens: 2048 },
  friendor_email: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.6, max_tokens: 2048 },
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
  chatbot_ticket: 'Chatbot (Ticket)',
  chatbot_board: 'Chatbot (Board)',
  chatbot_global: 'Chatbot (Global)',
  email_draft: 'Email Draft',
  brief_assist: 'Brief Assist',
  image_prompt_enhance: 'Image Prompt Enhance',
  proposal_generation: 'Proposal Generation',
  lead_triage: 'Lead Triage',
  follow_up_draft: 'Follow-Up Draft',
  friendor_email: 'Friendor Email',
};
