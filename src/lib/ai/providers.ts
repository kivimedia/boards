import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SupabaseClient } from '@supabase/supabase-js';
import { decryptFromHex } from '../encryption';
import type { AIProvider } from '../types';

// ============================================================================
// PROVIDER CLIENT FACTORY
// ============================================================================

/**
 * Retrieves the decrypted API key for a given provider from the database.
 */
export async function getProviderKey(
  supabase: SupabaseClient,
  provider: AIProvider
): Promise<string | null> {
  const { data } = await supabase
    .from('ai_api_keys')
    .select('key_encrypted')
    .eq('provider', provider)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!data?.key_encrypted) return null;

  try {
    return decryptFromHex(data.key_encrypted);
  } catch {
    console.error(`[AI] Failed to decrypt ${provider} API key`);
    return null;
  }
}

/**
 * Mark an API key as recently used.
 */
export async function touchApiKey(
  supabase: SupabaseClient,
  provider: AIProvider
): Promise<void> {
  await supabase
    .from('ai_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('provider', provider)
    .eq('is_active', true);
}

/**
 * Create an Anthropic client from stored API key.
 */
export async function createAnthropicClient(
  supabase: SupabaseClient
): Promise<Anthropic | null> {
  const apiKey = await getProviderKey(supabase, 'anthropic');
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

/**
 * Create an OpenAI client from stored API key.
 */
export async function createOpenAIClient(
  supabase: SupabaseClient
): Promise<OpenAI | null> {
  const apiKey = await getProviderKey(supabase, 'openai');
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

/**
 * Create a Google Generative AI client from stored API key.
 */
export async function createGoogleAIClient(
  supabase: SupabaseClient
): Promise<GoogleGenerativeAI | null> {
  const apiKey = await getProviderKey(supabase, 'google');
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Unified provider client factory.
 * Returns the appropriate client for the given provider.
 */
export async function getProviderClient(
  supabase: SupabaseClient,
  provider: AIProvider
): Promise<Anthropic | OpenAI | GoogleGenerativeAI | null> {
  switch (provider) {
    case 'anthropic':
      return createAnthropicClient(supabase);
    case 'openai':
      return createOpenAIClient(supabase);
    case 'google':
      return createGoogleAIClient(supabase);
    default:
      return null;
  }
}

/**
 * Check if a provider has an active API key configured.
 */
export async function isProviderConfigured(
  supabase: SupabaseClient,
  provider: AIProvider
): Promise<boolean> {
  const { count } = await supabase
    .from('ai_api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('provider', provider)
    .eq('is_active', true);

  return (count ?? 0) > 0;
}

/**
 * Get all configured providers.
 */
export async function getConfiguredProviders(
  supabase: SupabaseClient
): Promise<AIProvider[]> {
  const { data } = await supabase
    .from('ai_api_keys')
    .select('provider')
    .eq('is_active', true);

  if (!data) return [];

  const providers = new Set(data.map((d) => d.provider as AIProvider));
  return Array.from(providers);
}
