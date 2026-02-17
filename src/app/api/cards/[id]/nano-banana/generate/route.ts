import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { generateImage, saveNanoBananaResult } from '@/lib/ai/nano-banana';

interface Params {
  params: { id: string };
}

interface GenerateBody {
  prompt: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  fileName?: string;
}

/**
 * POST /api/cards/[id]/nano-banana/generate
 * Generate a new image from a text prompt using Nano Banana (Gemini image generation).
 *
 * Body:
 *   prompt: string (required) - Text description of the image to generate
 *   aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' - Desired aspect ratio
 *   fileName?: string - Custom file name for the generated image
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<GenerateBody>(request);
  if (!body.ok) return body.response;

  const { prompt, aspectRatio, fileName } = body.body;
  const { supabase, userId } = auth.ctx;
  const cardId = params.id;

  if (!prompt) {
    return errorResponse('prompt is required');
  }

  // Validate aspect ratio if provided
  const validRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'];
  if (aspectRatio && !validRatios.includes(aspectRatio)) {
    return errorResponse(
      `Invalid aspectRatio. Must be one of: ${validRatios.join(', ')}`
    );
  }

  try {
    // 1. Resolve board_id from card -> card_placements -> lists -> board
    const { data: placement } = await supabase
      .from('card_placements')
      .select('list:lists(board_id)')
      .eq('card_id', cardId)
      .limit(1)
      .single();

    const boardId = placement?.list
      ? (placement.list as unknown as { board_id: string }).board_id
      : undefined;

    // 2. Call generateImage
    const output = await generateImage(supabase, {
      cardId,
      userId,
      boardId,
      prompt,
      aspectRatio,
    });

    // 3. Save result as new attachment
    const resolvedFileName = fileName || `generated_${Date.now()}.png`;
    const newAttachmentId = await saveNanoBananaResult(
      supabase,
      cardId,
      userId,
      output,
      resolvedFileName
    );

    if (!newAttachmentId) {
      return errorResponse('Image was generated but failed to save the result', 500);
    }

    return successResponse({ attachmentId: newAttachmentId }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('Budget exceeded')) {
      return errorResponse(message, 429);
    }

    if (message.includes('not configured') || message.includes('API key')) {
      return errorResponse(message, 422);
    }

    return errorResponse(`Image generation failed: ${message}`, 500);
  }
}
