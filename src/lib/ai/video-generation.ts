import { SupabaseClient } from '@supabase/supabase-js';
import type { AIVideoGeneration, VideoProvider, VideoMode, VideoGenerationSettings } from '../types';
import { canMakeAICall } from './budget-checker';
import { logUsage } from './cost-tracker';
import { touchApiKey } from './providers';

// ============================================================================
// VIDEO GENERATION
// ============================================================================

export async function generateVideo(
  supabase: SupabaseClient,
  params: {
    cardId: string;
    userId: string;
    provider: VideoProvider;
    mode: VideoMode;
    prompt: string;
    negativePrompt?: string;
    settings?: VideoGenerationSettings;
    sourceImageUrl?: string;
    endImageUrl?: string;
  }
): Promise<AIVideoGeneration | null> {
  const startTime = Date.now();

  // 1. Budget check
  const budgetCheck = await canMakeAICall(supabase, {
    provider: params.provider === 'sora' ? 'openai' : 'google',
    activity: 'video_generation',
    userId: params.userId,
  });

  if (!budgetCheck.allowed) {
    throw new Error(`Budget exceeded: ${budgetCheck.reason}`);
  }

  // 2. Create pending record
  const { data: generation, error } = await supabase
    .from('ai_video_generations')
    .insert({
      card_id: params.cardId,
      user_id: params.userId,
      provider: params.provider,
      mode: params.mode,
      prompt: params.prompt,
      negative_prompt: params.negativePrompt ?? null,
      settings: params.settings ?? {},
      source_image_url: params.sourceImageUrl ?? null,
      end_image_url: params.endImageUrl ?? null,
      status: 'processing',
    })
    .select()
    .single();

  if (error || !generation) return null;

  try {
    // 3. Call provider API
    let result: { outputUrls: string[]; thumbnailUrl?: string };

    if (params.provider === 'sora') {
      result = await callSoraAPI(supabase, params);
    } else {
      result = await callVeoAPI(supabase, params);
    }

    const latencyMs = Date.now() - startTime;

    // 4. Update with results
    const { data: updated } = await supabase
      .from('ai_video_generations')
      .update({
        status: 'completed',
        output_urls: result.outputUrls,
        thumbnail_url: result.thumbnailUrl ?? null,
        generation_time_ms: latencyMs,
      })
      .eq('id', generation.id)
      .select()
      .single();

    // 5. Log usage
    await logUsage(supabase, {
      userId: params.userId,
      cardId: params.cardId,
      activity: 'video_generation',
      provider: params.provider === 'sora' ? 'openai' : 'google',
      modelId: params.provider === 'sora' ? 'sora-2' : 'veo-3',
      inputTokens: 0,
      outputTokens: 0,
      latencyMs,
      status: 'success',
      metadata: { mode: params.mode, generation_id: generation.id },
    });

    await touchApiKey(supabase, params.provider === 'sora' ? 'openai' : 'google');

    return updated as AIVideoGeneration;
  } catch (err) {
    const latencyMs = Date.now() - startTime;

    // Update with failure
    await supabase
      .from('ai_video_generations')
      .update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : String(err),
        generation_time_ms: latencyMs,
      })
      .eq('id', generation.id);

    await logUsage(supabase, {
      userId: params.userId,
      cardId: params.cardId,
      activity: 'video_generation',
      provider: params.provider === 'sora' ? 'openai' : 'google',
      modelId: params.provider === 'sora' ? 'sora-2' : 'veo-3',
      inputTokens: 0,
      outputTokens: 0,
      latencyMs,
      status: 'error',
      metadata: { mode: params.mode, error: err instanceof Error ? err.message : String(err) },
    });

    return null;
  }
}

// ============================================================================
// PROVIDER API CLIENTS
// ============================================================================

async function callSoraAPI(
  supabase: SupabaseClient,
  params: {
    prompt: string;
    negativePrompt?: string;
    settings?: VideoGenerationSettings;
    sourceImageUrl?: string;
    endImageUrl?: string;
    mode: VideoMode;
  }
): Promise<{ outputUrls: string[]; thumbnailUrl?: string }> {
  const { data: keyData } = await supabase
    .from('ai_api_keys')
    .select('key_encrypted')
    .eq('provider', 'openai')
    .single();

  if (!keyData) throw new Error('OpenAI API key not configured for Sora video generation.');

  // Sora 2 API call (OpenAI images/generations endpoint for video)
  const response = await fetch('https://api.openai.com/v1/videos/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${keyData.key_encrypted}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sora-2',
      prompt: params.prompt,
      negative_prompt: params.negativePrompt,
      duration: params.settings?.duration ?? 5,
      aspect_ratio: params.settings?.aspect_ratio ?? '16:9',
      resolution: params.settings?.resolution ?? '1080p',
      fps: params.settings?.fps ?? 24,
      style: params.settings?.style,
      input_image: params.sourceImageUrl,
      end_image: params.endImageUrl,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Sora API error: ${errText}`);
  }

  const result = await response.json();
  return {
    outputUrls: result.data?.map((d: { url: string }) => d.url) ?? [],
    thumbnailUrl: result.data?.[0]?.thumbnail,
  };
}

async function callVeoAPI(
  supabase: SupabaseClient,
  params: {
    prompt: string;
    negativePrompt?: string;
    settings?: VideoGenerationSettings;
    sourceImageUrl?: string;
    mode: VideoMode;
  }
): Promise<{ outputUrls: string[]; thumbnailUrl?: string }> {
  const { data: keyData } = await supabase
    .from('ai_api_keys')
    .select('key_encrypted')
    .eq('provider', 'google')
    .single();

  if (!keyData) throw new Error('Google API key not configured for Veo video generation.');

  // Veo 3 API call
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/veo-3:generateContent?key=${keyData.key_encrypted}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: params.prompt,
          }],
        }],
        generationConfig: {
          responseMimeType: 'video/mp4',
          videoDuration: `${params.settings?.duration ?? 5}s`,
          aspectRatio: params.settings?.aspect_ratio ?? '16:9',
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Veo API error: ${errText}`);
  }

  const result = await response.json();
  const videoUrls: string[] = [];
  if (result.candidates) {
    for (const candidate of result.candidates) {
      for (const part of candidate.content?.parts ?? []) {
        if (part.fileData?.fileUri) {
          videoUrls.push(part.fileData.fileUri);
        }
      }
    }
  }

  return { outputUrls: videoUrls };
}

// ============================================================================
// QUERIES
// ============================================================================

export async function getCardVideoGenerations(
  supabase: SupabaseClient,
  cardId: string
): Promise<AIVideoGeneration[]> {
  const { data } = await supabase
    .from('ai_video_generations')
    .select('*')
    .eq('card_id', cardId)
    .order('created_at', { ascending: false });

  return (data as AIVideoGeneration[]) ?? [];
}

export async function getVideoGeneration(
  supabase: SupabaseClient,
  generationId: string
): Promise<AIVideoGeneration | null> {
  const { data } = await supabase
    .from('ai_video_generations')
    .select('*')
    .eq('id', generationId)
    .single();

  return data as AIVideoGeneration | null;
}

export async function getUserVideoGenerations(
  supabase: SupabaseClient,
  userId: string,
  limit?: number
): Promise<AIVideoGeneration[]> {
  const { data } = await supabase
    .from('ai_video_generations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit ?? 20);

  return (data as AIVideoGeneration[]) ?? [];
}

export async function deleteVideoGeneration(
  supabase: SupabaseClient,
  generationId: string
): Promise<void> {
  await supabase.from('ai_video_generations').delete().eq('id', generationId);
}
