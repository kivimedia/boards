import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { generateVideo, getCardVideoGenerations } from '@/lib/ai/video-generation';
import type { VideoProvider, VideoMode, VideoGenerationSettings } from '@/lib/types';

interface Params {
  params: { id: string };
}

/**
 * GET /api/cards/[id]/video
 * List all video generations for a card.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const cardId = params.id;

  try {
    const generations = await getCardVideoGenerations(supabase, cardId);
    return successResponse(generations);
  } catch (err) {
    return errorResponse(
      `Failed to fetch video generations: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

interface GenerateVideoBody {
  provider: VideoProvider;
  mode: VideoMode;
  prompt: string;
  negativePrompt?: string;
  settings?: VideoGenerationSettings;
  sourceImageUrl?: string;
  endImageUrl?: string;
}

/**
 * POST /api/cards/[id]/video
 * Generate a new video for a card.
 *
 * Body:
 *   provider: 'sora' | 'veo' (required)
 *   mode: 'text_to_video' | 'image_to_video' | 'start_end_frame' (required)
 *   prompt: string (required)
 *   negativePrompt?: string
 *   settings?: { duration, aspect_ratio, resolution, fps, style }
 *   sourceImageUrl?: string (required for image_to_video / start_end_frame)
 *   endImageUrl?: string (for start_end_frame)
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<GenerateVideoBody>(request);
  if (!body.ok) return body.response;

  const { provider, mode, prompt, negativePrompt, settings, sourceImageUrl, endImageUrl } = body.body;
  const { supabase, userId } = auth.ctx;
  const cardId = params.id;

  if (!provider || !['sora', 'veo'].includes(provider)) {
    return errorResponse('provider must be "sora" or "veo"');
  }

  if (!mode || !['text_to_video', 'image_to_video', 'start_end_frame'].includes(mode)) {
    return errorResponse('mode must be "text_to_video", "image_to_video", or "start_end_frame"');
  }

  if (!prompt || !prompt.trim()) {
    return errorResponse('prompt is required');
  }

  if ((mode === 'image_to_video' || mode === 'start_end_frame') && !sourceImageUrl) {
    return errorResponse('sourceImageUrl is required for image_to_video and start_end_frame modes');
  }

  if (mode === 'start_end_frame' && !endImageUrl) {
    return errorResponse('endImageUrl is required for start_end_frame mode');
  }

  try {
    const generation = await generateVideo(supabase, {
      cardId,
      userId,
      provider,
      mode,
      prompt: prompt.trim(),
      negativePrompt,
      settings,
      sourceImageUrl,
      endImageUrl,
    });

    if (!generation) {
      return errorResponse('Video generation failed. Check provider configuration.', 500);
    }

    return successResponse(generation, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('Budget exceeded')) {
      return errorResponse(message, 429);
    }

    if (message.includes('not configured') || message.includes('API key')) {
      return errorResponse(message, 422);
    }

    return errorResponse(`Video generation failed: ${message}`, 500);
  }
}
