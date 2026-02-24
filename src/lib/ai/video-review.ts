import { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { createAnthropicClient, touchApiKey } from './providers';
import { resolveModelWithFallback } from './model-resolver';
import { logUsage } from './cost-tracker';
import { canMakeAICall } from './budget-checker';
import { extractFramesFromVideo, ExtractedFrame } from './video-frame-extractor';
import type { AIChangeRequest, AIChangeVerdictResult, AIReviewVerdict } from '../types';

export interface VideoReviewInput {
  cardId: string;
  boardId: string;
  userId: string;
  currentVideoPath: string;
  previousVideoPath?: string;
  changeRequests: AIChangeRequest[];
  frameTimestamps?: number[];
}

export interface VideoReviewOutput {
  verdicts: AIChangeVerdictResult[];
  overallVerdict: AIReviewVerdict;
  summary: string;
  confidenceScore: number;
  modelUsed: string;
  currentFrames: ExtractedFrame[];
  previousFrames: ExtractedFrame[];
}

/**
 * Run AI video review by extracting frames and comparing with Claude vision.
 */
export async function runVideoReview(
  supabase: SupabaseClient,
  input: VideoReviewInput
): Promise<VideoReviewOutput> {
  const startTime = Date.now();

  // 1. Budget check
  const budgetCheck = await canMakeAICall(supabase, {
    provider: 'anthropic',
    activity: 'design_review', // Reuse design_review budget category
    userId: input.userId,
    boardId: input.boardId,
  });

  if (!budgetCheck.allowed) {
    throw new Error(`Budget exceeded: ${budgetCheck.reason}`);
  }

  // 2. Resolve model
  const modelConfig = await resolveModelWithFallback(supabase, 'design_review');

  // 3. Create client
  const client = await createAnthropicClient(supabase);
  if (!client) {
    throw new Error('Anthropic API key not configured.');
  }

  // 4. Extract frames from current video
  const currentFrames = await extractFramesFromVideo(supabase, input.currentVideoPath, input.cardId, {
    specificTimestamps: input.frameTimestamps,
    maxFrames: 6,
    intervalSeconds: 5,
  });

  if (currentFrames.length === 0) {
    throw new Error('Could not extract any frames from the current video.');
  }

  // 5. Extract frames from previous video if available
  let previousFrames: ExtractedFrame[] = [];
  if (input.previousVideoPath) {
    previousFrames = await extractFramesFromVideo(
      supabase,
      input.previousVideoPath,
      `${input.cardId}/prev`,
      {
        specificTimestamps: input.frameTimestamps,
        maxFrames: 6,
        intervalSeconds: 5,
      }
    );
  }

  // 6. Build vision message
  const messageContent: Anthropic.MessageCreateParams['messages'][0]['content'] = [];

  if (previousFrames.length > 0) {
    messageContent.push({ type: 'text', text: 'PREVIOUS VERSION frames:' });
    for (const frame of previousFrames) {
      messageContent.push({
        type: 'text',
        text: `Frame at ${frame.timestamp}s:`,
      });
      messageContent.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: frame.buffer.toString('base64') },
      });
    }
  }

  messageContent.push({ type: 'text', text: 'CURRENT VERSION frames:' });
  for (const frame of currentFrames) {
    messageContent.push({
      type: 'text',
      text: `Frame at ${frame.timestamp}s:`,
    });
    messageContent.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: frame.buffer.toString('base64') },
    });
  }

  const changeRequestsText = input.changeRequests
    .map((cr) => `${cr.index}. ${cr.text}`)
    .join('\n');

  messageContent.push({
    type: 'text',
    text: `You are reviewing a video editing revision. The following changes were requested:\n\n${changeRequestsText}\n\nFor each change request, determine if it has been addressed in the current version by comparing the frames. Respond with JSON:\n{\n  "verdicts": [{"index": 1, "verdict": "PASS|FAIL|PARTIAL", "reasoning": "..."}],\n  "overall_verdict": "approved|revisions_needed",\n  "summary": "Brief summary"\n}`,
  });

  // 7. Send to Claude
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: modelConfig.model_id,
      max_tokens: modelConfig.max_tokens,
      temperature: modelConfig.temperature,
      system: 'You are a video review assistant. Compare video frames to verify if requested changes have been implemented. Be thorough but fair.',
      messages: [{ role: 'user', content: messageContent }],
    });
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    await logUsage(supabase, {
      userId: input.userId,
      boardId: input.boardId,
      cardId: input.cardId,
      activity: 'design_review',
      provider: 'anthropic',
      modelId: modelConfig.model_id,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs,
      status: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw new Error(`Video review failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const latencyMs = Date.now() - startTime;
  await touchApiKey(supabase, 'anthropic');

  // 8. Parse response
  const responseText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  let parsed;
  try {
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    parsed = JSON.parse(jsonStr);
  } catch {
    parsed = { verdicts: [], overall_verdict: 'pending', summary: 'Could not parse AI response.' };
  }

  const verdicts: AIChangeVerdictResult[] = (parsed.verdicts || []).map(
    (v: any, i: number) => ({
      index: v.index ?? i + 1,
      verdict: (['PASS', 'FAIL', 'PARTIAL'].includes(v.verdict?.toUpperCase()) ? v.verdict.toUpperCase() : 'PARTIAL') as 'PASS' | 'FAIL' | 'PARTIAL',
      reasoning: v.reasoning ?? '',
      suggestions: v.suggestions ?? '',
    })
  );

  const overallVerdict: AIReviewVerdict =
    parsed.overall_verdict === 'approved' ? 'approved' : 'revisions_needed';

  const confidenceScore = Math.min(
    100,
    Math.round((verdicts.length / Math.max(input.changeRequests.length, 1)) * 100)
  );

  // 9. Log usage
  await logUsage(supabase, {
    userId: input.userId,
    boardId: input.boardId,
    cardId: input.cardId,
    activity: 'design_review',
    provider: 'anthropic',
    modelId: modelConfig.model_id,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    latencyMs,
    status: 'success',
    metadata: { type: 'video_review', frames: currentFrames.length },
  });

  return {
    verdicts,
    overallVerdict,
    summary: parsed.summary ?? '',
    confidenceScore,
    modelUsed: modelConfig.model_id,
    currentFrames,
    previousFrames,
  };
}
