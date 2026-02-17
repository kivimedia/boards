import { SupabaseClient } from '@supabase/supabase-js';
import { createGoogleAIClient, touchApiKey } from './providers';
import { resolveModelWithFallback } from './model-resolver';
import { logUsage } from './cost-tracker';
import { canMakeAICall } from './budget-checker';
import type { AIActivity } from '../types';

// ============================================================================
// NANO BANANA — GEMINI IMAGE EDIT & GENERATE
// ============================================================================

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
}

export interface NanoBananaOutput {
  imageBase64: string;
  mimeType: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
}

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

/**
 * Generate an image using Gemini from a text prompt.
 */
export async function generateImage(
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
