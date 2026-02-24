import { SupabaseClient } from '@supabase/supabase-js';
import { createGoogleAIClient, createAnthropicClient, getReplicateApiKey, touchApiKey } from './providers';
import { resolveModelWithFallback } from './model-resolver';
import { logUsage } from './cost-tracker';
import { canMakeAICall } from './budget-checker';
import type { AIActivity } from '../types';

// ============================================================================
// NANO BANANA — MULTI-PROVIDER IMAGE EDIT & GENERATE
// ============================================================================

export type ImageProvider = 'gemini' | 'replicate';

export interface NanoBananaEditInput {
  cardId: string;
  userId: string;
  boardId?: string;
  attachmentId: string;
  imageBase64: string;
  mimeType: string;
  editInstruction: string;
}

export interface NanoBananaGenerateInput {
  cardId: string;
  userId: string;
  boardId?: string;
  prompt: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  provider?: ImageProvider;
  stylePreset?: string;
  enhancePrompt?: boolean;
}

export interface NanoBananaOutput {
  imageBase64: string;
  mimeType: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  enhancedPrompt?: string;
}

// ============================================================================
// STYLE PRESETS
// ============================================================================

export const IMAGE_STYLE_PRESETS = [
  { id: 'social_post', label: 'Social Post', hint: 'Bold, eye-catching, minimal text space' },
  { id: 'ad_banner', label: 'Ad Banner', hint: 'Clean, professional, product-focused' },
  { id: 'hero_image', label: 'Hero Image', hint: 'Wide, atmospheric, storytelling' },
  { id: 'product_shot', label: 'Product Shot', hint: 'Studio lighting, clean background' },
  { id: 'mood_board', label: 'Mood Board', hint: 'Collage-style, textural, inspirational' },
  { id: 'photo_realistic', label: 'Photo Realistic', hint: 'Natural, high-detail photograph' },
] as const;

export type ImageStylePresetId = (typeof IMAGE_STYLE_PRESETS)[number]['id'];

// ============================================================================
// PROMPT ENHANCEMENT (Claude Haiku)
// ============================================================================

/**
 * Enhance a simple image prompt using Claude Haiku.
 * Adds composition, lighting, color, style, and medium details.
 */
export async function enhanceImagePrompt(
  supabase: SupabaseClient,
  userPrompt: string,
  stylePreset?: string,
  userId?: string,
  boardId?: string,
  cardId?: string,
): Promise<string> {
  const activity: AIActivity = 'image_prompt_enhance';
  const startTime = Date.now();

  const client = await createAnthropicClient(supabase);
  if (!client) {
    // Fall back to raw prompt if Anthropic not configured
    return userPrompt;
  }

  const presetHint = stylePreset
    ? IMAGE_STYLE_PRESETS.find((p) => p.id === stylePreset)?.hint ?? ''
    : '';

  const systemPrompt = `You are an expert image prompt engineer. Rewrite the user's simple description as a detailed, vivid prompt optimized for AI image generation models (FLUX, Gemini). Add composition, lighting, color palette, artistic style, and medium details.${presetHint ? ` Style direction: ${presetHint}.` : ''} Keep under 200 words. Output only the enhanced prompt.`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    });

    const latencyMs = Date.now() - startTime;
    const enhanced = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    await logUsage(supabase, {
      userId,
      boardId,
      cardId,
      activity,
      provider: 'anthropic',
      modelId: 'claude-haiku-4-5-20251001',
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      latencyMs,
      status: 'success',
      metadata: { original_prompt: userPrompt, style_preset: stylePreset },
    });

    return enhanced || userPrompt;
  } catch (err) {
    console.error('[NanoBanana] Prompt enhancement failed, using original:', err);
    return userPrompt;
  }
}

// ============================================================================
// REPLICATE IMAGE GENERATION (FLUX)
// ============================================================================

/** Map our aspect ratios to Replicate-compatible values. */
const REPLICATE_ASPECT_MAP: Record<string, string> = {
  '1:1': '1:1',
  '16:9': '16:9',
  '9:16': '9:16',
  '4:3': '4:3',
  '3:4': '3:4',
};

/**
 * Generate an image using FLUX on Replicate.
 * Uses HTTP API with polling for completion.
 */
export async function generateImageReplicate(
  supabase: SupabaseClient,
  input: NanoBananaGenerateInput
): Promise<NanoBananaOutput> {
  const activity: AIActivity = 'replicate_generate';
  const startTime = Date.now();
  const modelId = 'flux-1.1-pro';

  // 1. Budget check
  const budgetCheck = await canMakeAICall(supabase, {
    provider: 'replicate',
    activity,
    userId: input.userId,
    boardId: input.boardId,
  });

  if (!budgetCheck.allowed) {
    throw new Error(`Budget exceeded: ${budgetCheck.reason}`);
  }

  // 2. Get API key
  const apiKey = await getReplicateApiKey(supabase);
  if (!apiKey) {
    throw new Error('Replicate API key not configured. Add one in Settings > AI Configuration.');
  }

  // 3. Create prediction
  try {
    const createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/flux-1.1-pro',
        input: {
          prompt: input.prompt,
          aspect_ratio: REPLICATE_ASPECT_MAP[input.aspectRatio ?? '1:1'] ?? '1:1',
          output_format: 'png',
        },
      }),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();
      throw new Error(`Replicate API error ${createRes.status}: ${errBody.slice(0, 300)}`);
    }

    let prediction = await createRes.json();

    // 4. Poll for completion (if not using Prefer: wait or if still processing)
    const maxPollMs = 60_000;
    const pollInterval = 2_000;
    const pollStart = Date.now();

    while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && prediction.status !== 'canceled') {
      if (Date.now() - pollStart > maxPollMs) {
        throw new Error('Replicate prediction timed out after 60s');
      }
      await new Promise((r) => setTimeout(r, pollInterval));

      const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!pollRes.ok) {
        throw new Error(`Replicate poll error ${pollRes.status}`);
      }
      prediction = await pollRes.json();
    }

    if (prediction.status === 'failed') {
      throw new Error(`Replicate prediction failed: ${prediction.error || 'Unknown error'}`);
    }

    if (prediction.status === 'canceled') {
      throw new Error('Replicate prediction was canceled');
    }

    // 5. Download the output image and convert to base64
    const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (!outputUrl) {
      throw new Error('Replicate returned no output image URL');
    }

    const imgRes = await fetch(outputUrl);
    if (!imgRes.ok) {
      throw new Error(`Failed to download generated image: ${imgRes.status}`);
    }

    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const outputBase64 = imgBuffer.toString('base64');

    const latencyMs = Date.now() - startTime;
    await touchApiKey(supabase, 'replicate');

    // Replicate charges per-image, log cost directly
    const estimatedCost = 0.04; // FLUX 1.1 Pro ~$0.04/image
    await logUsage(supabase, {
      userId: input.userId,
      boardId: input.boardId,
      cardId: input.cardId,
      activity,
      provider: 'replicate',
      modelId,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs,
      status: 'success',
      metadata: {
        prompt: input.prompt,
        aspect_ratio: input.aspectRatio,
        replicate_prediction_id: prediction.id,
        per_image_cost_usd: estimatedCost,
      },
    });

    return {
      imageBase64: outputBase64,
      mimeType: 'image/png',
      modelUsed: modelId,
      inputTokens: 0,
      outputTokens: 0,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    await logUsage(supabase, {
      userId: input.userId,
      boardId: input.boardId,
      cardId: input.cardId,
      activity,
      provider: 'replicate',
      modelId,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs,
      status: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw new Error(`Replicate image generation failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ============================================================================
// GEMINI IMAGE EDIT (unchanged)
// ============================================================================

/**
 * Edit an image using Gemini's image understanding + generation.
 * Sends the original image + edit instructions to Gemini.
 */
export async function editImage(
  supabase: SupabaseClient,
  input: NanoBananaEditInput
): Promise<NanoBananaOutput> {
  const activity: AIActivity = 'nano_banana_edit';
  const startTime = Date.now();

  // 1. Budget check
  const budgetCheck = await canMakeAICall(supabase, {
    provider: 'google',
    activity,
    userId: input.userId,
    boardId: input.boardId,
  });

  if (!budgetCheck.allowed) {
    throw new Error(`Budget exceeded: ${budgetCheck.reason}`);
  }

  // 2. Resolve model
  const modelConfig = await resolveModelWithFallback(supabase, activity);

  // 3. Create client
  const client = await createGoogleAIClient(supabase);
  if (!client) {
    throw new Error('Google AI API key not configured. Add one in Settings > AI Configuration.');
  }

  // 4. Send to Gemini
  try {
    const model = client.getGenerativeModel({ model: modelConfig.model_id });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: input.mimeType,
          data: input.imageBase64,
        },
      },
      { text: `Edit this image: ${input.editInstruction}. Return the edited image.` },
    ]);

    const response = result.response;
    const latencyMs = Date.now() - startTime;
    await touchApiKey(supabase, 'google');

    // Extract generated image from response
    const parts = response.candidates?.[0]?.content?.parts || [];
    let outputBase64 = '';
    let outputMimeType = 'image/png';

    for (const part of parts) {
      if (part.inlineData) {
        outputBase64 = part.inlineData.data ?? '';
        outputMimeType = part.inlineData.mimeType ?? 'image/png';
        break;
      }
    }

    const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

    // 5. Log usage
    await logUsage(supabase, {
      userId: input.userId,
      boardId: input.boardId,
      cardId: input.cardId,
      activity,
      provider: 'google',
      modelId: modelConfig.model_id,
      inputTokens,
      outputTokens,
      latencyMs,
      status: 'success',
      metadata: { edit_instruction: input.editInstruction },
    });

    if (!outputBase64) {
      // If no image in response, the model might have returned text only
      const textContent = parts.find((p) => p.text)?.text ?? '';
      throw new Error(`Gemini did not return an edited image. Response: ${textContent.slice(0, 200)}`);
    }

    return {
      imageBase64: outputBase64,
      mimeType: outputMimeType,
      modelUsed: modelConfig.model_id,
      inputTokens,
      outputTokens,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    await logUsage(supabase, {
      userId: input.userId,
      boardId: input.boardId,
      cardId: input.cardId,
      activity,
      provider: 'google',
      modelId: modelConfig.model_id,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs,
      status: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw new Error(`Image edit failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ============================================================================
// GEMINI IMAGE GENERATE (original)
// ============================================================================

/**
 * Generate an image using Gemini from a text prompt.
 */
async function generateImageGemini(
  supabase: SupabaseClient,
  input: NanoBananaGenerateInput
): Promise<NanoBananaOutput> {
  const activity: AIActivity = 'nano_banana_generate';
  const startTime = Date.now();

  // 1. Budget check
  const budgetCheck = await canMakeAICall(supabase, {
    provider: 'google',
    activity,
    userId: input.userId,
    boardId: input.boardId,
  });

  if (!budgetCheck.allowed) {
    throw new Error(`Budget exceeded: ${budgetCheck.reason}`);
  }

  // 2. Resolve model
  const modelConfig = await resolveModelWithFallback(supabase, activity);

  // 3. Create client
  const client = await createGoogleAIClient(supabase);
  if (!client) {
    throw new Error('Google AI API key not configured. Add one in Settings > AI Configuration.');
  }

  // 4. Send to Gemini
  try {
    const model = client.getGenerativeModel({ model: modelConfig.model_id });

    const aspectRatioHint = input.aspectRatio ? ` Aspect ratio: ${input.aspectRatio}.` : '';
    const result = await model.generateContent([
      { text: `Generate an image: ${input.prompt}.${aspectRatioHint} Return the generated image.` },
    ]);

    const response = result.response;
    const latencyMs = Date.now() - startTime;
    await touchApiKey(supabase, 'google');

    const parts = response.candidates?.[0]?.content?.parts || [];
    let outputBase64 = '';
    let outputMimeType = 'image/png';

    for (const part of parts) {
      if (part.inlineData) {
        outputBase64 = part.inlineData.data ?? '';
        outputMimeType = part.inlineData.mimeType ?? 'image/png';
        break;
      }
    }

    const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

    await logUsage(supabase, {
      userId: input.userId,
      boardId: input.boardId,
      cardId: input.cardId,
      activity,
      provider: 'google',
      modelId: modelConfig.model_id,
      inputTokens,
      outputTokens,
      latencyMs,
      status: 'success',
      metadata: { prompt: input.prompt, aspect_ratio: input.aspectRatio },
    });

    if (!outputBase64) {
      const textContent = parts.find((p) => p.text)?.text ?? '';
      throw new Error(`Gemini did not return a generated image. Response: ${textContent.slice(0, 200)}`);
    }

    return {
      imageBase64: outputBase64,
      mimeType: outputMimeType,
      modelUsed: modelConfig.model_id,
      inputTokens,
      outputTokens,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    await logUsage(supabase, {
      userId: input.userId,
      boardId: input.boardId,
      cardId: input.cardId,
      activity,
      provider: 'google',
      modelId: modelConfig.model_id,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs,
      status: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw new Error(`Image generation failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ============================================================================
// UNIFIED GENERATE DISPATCHER
// ============================================================================

/**
 * Generate an image using the specified provider (gemini or replicate).
 * Optionally enhances the prompt via Claude Haiku first.
 */
export async function generateImage(
  supabase: SupabaseClient,
  input: NanoBananaGenerateInput
): Promise<NanoBananaOutput> {
  let finalPrompt = input.prompt;
  let enhancedPrompt: string | undefined;

  // Enhance prompt if requested
  if (input.enhancePrompt) {
    enhancedPrompt = await enhanceImagePrompt(
      supabase,
      input.prompt,
      input.stylePreset,
      input.userId,
      input.boardId,
      input.cardId,
    );
    finalPrompt = enhancedPrompt;
  }

  const inputWithPrompt = { ...input, prompt: finalPrompt };
  const provider = input.provider ?? 'gemini';

  let output: NanoBananaOutput;
  if (provider === 'replicate') {
    output = await generateImageReplicate(supabase, inputWithPrompt);
  } else {
    output = await generateImageGemini(supabase, inputWithPrompt);
  }

  if (enhancedPrompt) {
    output.enhancedPrompt = enhancedPrompt;
  }

  return output;
}

// ============================================================================
// SAVE RESULT
// ============================================================================

/**
 * Save a Nano Banana result as a new attachment on the card.
 */
export async function saveNanoBananaResult(
  supabase: SupabaseClient,
  cardId: string,
  userId: string,
  output: NanoBananaOutput,
  fileName: string,
  parentAttachmentId?: string
): Promise<string | null> {
  const buffer = Buffer.from(output.imageBase64, 'base64');
  const storagePath = `nano-banana/${cardId}/${Date.now()}_${fileName}`;

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from('card-attachments')
    .upload(storagePath, buffer, {
      contentType: output.mimeType,
      upsert: false,
    });

  if (uploadError) {
    console.error('[NanoBanana] Upload failed:', uploadError.message);
    return null;
  }

  // Create attachment record
  const { data, error } = await supabase
    .from('attachments')
    .insert({
      card_id: cardId,
      file_name: fileName,
      file_size: buffer.length,
      mime_type: output.mimeType,
      storage_path: storagePath,
      uploaded_by: userId,
      version: 1,
      parent_attachment_id: parentAttachmentId ?? null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[NanoBanana] Attachment creation failed:', error.message);
    return null;
  }

  return data?.id ?? null;
}
