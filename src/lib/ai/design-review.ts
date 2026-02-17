import { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { createAnthropicClient, touchApiKey } from './providers';
import { resolveModelWithFallback } from './model-resolver';
import { logUsage } from './cost-tracker';
import { canMakeAICall } from './budget-checker';
import { getSystemPrompt, buildDesignReviewPrompt } from './prompt-templates';
import type {
  AIChangeRequest,
  AIChangeVerdictResult,
  AIReviewVerdict,
  AIReviewResult,
} from '../types';

// ============================================================================
// CHANGE REQUEST EXTRACTION
// ============================================================================

/**
 * Extract change requests from card comments.
 * Looks for numbered lists or bullet points in comments marked as review feedback.
 */
export function extractChangeRequests(
  comments: { content: string; created_at: string }[]
): AIChangeRequest[] {
  const requests: AIChangeRequest[] = [];
  let index = 1;

  for (const comment of comments) {
    const content = comment.content;

    // Match numbered lists: "1. ...", "1) ...", etc.
    const numberedMatches = content.match(/^\s*\d+[\.\)]\s+.+$/gm);
    if (numberedMatches) {
      for (const match of numberedMatches) {
        const text = match.replace(/^\s*\d+[\.\)]\s+/, '').trim();
        if (text.length > 5) {
          requests.push({ index: index++, text });
        }
      }
      continue;
    }

    // Match bullet lists: "- ...", "* ...", "• ..."
    const bulletMatches = content.match(/^\s*[-*•]\s+.+$/gm);
    if (bulletMatches) {
      for (const match of bulletMatches) {
        const text = match.replace(/^\s*[-*•]\s+/, '').trim();
        if (text.length > 5) {
          requests.push({ index: index++, text });
        }
      }
      continue;
    }

    // If no list format, treat the whole comment as a single request
    // (only if it's reasonably short and looks like feedback)
    if (content.length > 10 && content.length < 500) {
      const lowerContent = content.toLowerCase();
      const feedbackKeywords = ['change', 'update', 'fix', 'adjust', 'modify', 'revise', 'move', 'resize', 'recolor', 'replace', 'add', 'remove', 'make'];
      if (feedbackKeywords.some((kw) => lowerContent.includes(kw))) {
        requests.push({ index: index++, text: content.trim() });
      }
    }
  }

  return requests;
}

// ============================================================================
// IMAGE HANDLING
// ============================================================================

/**
 * Get a public URL for a Supabase storage attachment.
 */
export function getAttachmentUrl(
  supabase: SupabaseClient,
  storagePath: string
): string {
  const { data } = supabase.storage
    .from('card-attachments')
    .getPublicUrl(storagePath);
  return data.publicUrl;
}

/**
 * Download an image as base64 for sending to vision AI.
 */
export async function downloadImageAsBase64(
  supabase: SupabaseClient,
  storagePath: string
): Promise<{ base64: string; mediaType: string } | null> {
  const { data, error } = await supabase.storage
    .from('card-attachments')
    .download(storagePath);

  if (error || !data) return null;

  const buffer = Buffer.from(await data.arrayBuffer());
  const base64 = buffer.toString('base64');

  // Determine media type from extension
  const ext = storagePath.split('.').pop()?.toLowerCase();
  const mediaTypeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
  };
  const mediaType = mediaTypeMap[ext ?? ''] ?? 'image/png';

  return { base64, mediaType };
}

/**
 * Check if an attachment is an image based on mime type.
 */
export function isImageAttachment(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

// ============================================================================
// REVIEW PIPELINE
// ============================================================================

export interface ReviewInput {
  cardId: string;
  boardId: string;
  userId: string;
  attachmentId: string;
  previousAttachmentId?: string;
  changeRequests: AIChangeRequest[];
  briefSummary: string;
}

export interface ReviewOutput {
  verdicts: AIChangeVerdictResult[];
  overallVerdict: AIReviewVerdict;
  summary: string;
  confidenceScore: number;
  modelUsed: string;
  usageLogId: string | null;
}

/**
 * Run the AI design review pipeline.
 *
 * 1. Check budget
 * 2. Resolve model
 * 3. Download images
 * 4. Send to Claude vision API
 * 5. Parse results
 * 6. Log usage
 * 7. Store results
 */
export async function runDesignReview(
  supabase: SupabaseClient,
  input: ReviewInput
): Promise<ReviewOutput> {
  const startTime = Date.now();

  // 1. Check budget
  const budgetCheck = await canMakeAICall(supabase, {
    provider: 'anthropic',
    activity: 'design_review',
    userId: input.userId,
    boardId: input.boardId,
  });

  if (!budgetCheck.allowed) {
    throw new Error(`Budget exceeded: ${budgetCheck.reason}`);
  }

  // 2. Resolve model
  const modelConfig = await resolveModelWithFallback(supabase, 'design_review');

  // 3. Create Anthropic client
  const client = await createAnthropicClient(supabase);
  if (!client) {
    throw new Error('Anthropic API key not configured. Add one in Settings > AI Configuration.');
  }

  // 4. Download current image
  const { data: attachment } = await supabase
    .from('attachments')
    .select('storage_path, mime_type')
    .eq('id', input.attachmentId)
    .single();

  if (!attachment) {
    throw new Error('Attachment not found');
  }

  const currentImage = await downloadImageAsBase64(supabase, attachment.storage_path);
  if (!currentImage) {
    throw new Error('Failed to download current design image');
  }

  // 5. Build message content
  const systemPrompt = getSystemPrompt('design_review');
  const userPrompt = buildDesignReviewPrompt(
    input.changeRequests.map((cr) => cr.text),
    input.briefSummary
  );

  const messageContent: Anthropic.MessageCreateParams['messages'][0]['content'] = [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: currentImage.mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
        data: currentImage.base64,
      },
    },
  ];

  // Add previous image for comparison if available
  if (input.previousAttachmentId) {
    const { data: prevAttachment } = await supabase
      .from('attachments')
      .select('storage_path')
      .eq('id', input.previousAttachmentId)
      .single();

    if (prevAttachment) {
      const prevImage = await downloadImageAsBase64(supabase, prevAttachment.storage_path);
      if (prevImage) {
        messageContent.unshift({
          type: 'text',
          text: 'Previous version:',
        });
        messageContent.unshift({
          type: 'image',
          source: {
            type: 'base64',
            media_type: prevImage.mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
            data: prevImage.base64,
          },
        });
        messageContent.push({
          type: 'text',
          text: 'Current version (to review):',
        });
      }
    }
  }

  messageContent.push({
    type: 'text',
    text: userPrompt,
  });

  // 6. Send to Claude
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: modelConfig.model_id,
      max_tokens: modelConfig.max_tokens,
      temperature: modelConfig.temperature,
      system: systemPrompt,
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
    throw new Error(`AI review failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const latencyMs = Date.now() - startTime;
  await touchApiKey(supabase, 'anthropic');

  // 7. Parse response
  const responseText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  const parsed = parseReviewResponse(responseText, input.changeRequests.length);

  // 8. Log usage
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
    metadata: {
      overall_verdict: parsed.overallVerdict,
      change_request_count: input.changeRequests.length,
    },
  });

  return {
    verdicts: parsed.verdicts,
    overallVerdict: parsed.overallVerdict,
    summary: parsed.summary,
    confidenceScore: parsed.confidenceScore,
    modelUsed: modelConfig.model_id,
    usageLogId: null, // Would need to capture from logUsage if we return the ID
  };
}

// ============================================================================
// RESPONSE PARSING
// ============================================================================

interface ParsedReviewResponse {
  verdicts: AIChangeVerdictResult[];
  overallVerdict: AIReviewVerdict;
  summary: string;
  confidenceScore: number;
}

/**
 * Parse the AI's JSON response into structured verdicts.
 * Handles both clean JSON and JSON embedded in markdown code blocks.
 */
export function parseReviewResponse(
  responseText: string,
  expectedCount: number
): ParsedReviewResponse {
  // Try to extract JSON from the response
  let jsonStr = responseText;

  // Handle markdown code blocks
  const jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  try {
    const parsed = JSON.parse(jsonStr);

    const verdicts: AIChangeVerdictResult[] = (parsed.verdicts || []).map(
      (v: { index?: number; verdict?: string; reasoning?: string; suggestions?: string }, i: number) => ({
        index: v.index ?? i + 1,
        verdict: normalizeVerdict(v.verdict),
        reasoning: v.reasoning ?? '',
        suggestions: v.suggestions ?? '',
      })
    );

    const overallVerdict = normalizeOverallVerdict(parsed.overall_verdict);
    const summary = parsed.summary ?? '';

    // Calculate confidence based on how many verdicts matched expected count
    const confidenceScore = Math.min(
      100,
      Math.round((verdicts.length / Math.max(expectedCount, 1)) * 100)
    );

    return { verdicts, overallVerdict, summary, confidenceScore };
  } catch {
    // If JSON parsing fails, create a fallback
    return {
      verdicts: [],
      overallVerdict: 'pending',
      summary: `AI response could not be parsed. Raw response: ${responseText.slice(0, 200)}...`,
      confidenceScore: 0,
    };
  }
}

function normalizeVerdict(verdict?: string): 'PASS' | 'FAIL' | 'PARTIAL' {
  const v = (verdict ?? '').toUpperCase();
  if (v === 'PASS' || v === 'APPROVED' || v === 'YES') return 'PASS';
  if (v === 'FAIL' || v === 'REJECTED' || v === 'NO') return 'FAIL';
  return 'PARTIAL';
}

function normalizeOverallVerdict(verdict?: string): AIReviewVerdict {
  const v = (verdict ?? '').toLowerCase().replace(/[^a-z_]/g, '');
  if (v === 'approved' || v === 'pass') return 'approved';
  if (v === 'revisionsneeded' || v === 'revisions_needed' || v === 'fail') return 'revisions_needed';
  return 'pending';
}

// ============================================================================
// RESULT STORAGE
// ============================================================================

/**
 * Store review results in the database.
 */
export async function storeReviewResult(
  supabase: SupabaseClient,
  input: ReviewInput,
  output: ReviewOutput
): Promise<AIReviewResult | null> {
  const { data, error } = await supabase
    .from('ai_review_results')
    .insert({
      card_id: input.cardId,
      attachment_id: input.attachmentId,
      previous_attachment_id: input.previousAttachmentId ?? null,
      change_requests: input.changeRequests,
      verdicts: output.verdicts,
      overall_verdict: output.overallVerdict,
      summary: output.summary,
      confidence_score: output.confidenceScore,
      model_used: output.modelUsed,
      usage_log_id: output.usageLogId,
      created_by: input.userId,
    })
    .select()
    .single();

  if (error) {
    console.error('[DesignReview] Failed to store results:', error.message);
    return null;
  }

  return data as AIReviewResult;
}

/**
 * Override a review verdict (admin/lead action).
 */
export async function overrideReviewVerdict(
  supabase: SupabaseClient,
  reviewId: string,
  userId: string,
  overrideVerdict: 'overridden_approved' | 'overridden_rejected',
  reason: string
): Promise<AIReviewResult | null> {
  const { data, error } = await supabase
    .from('ai_review_results')
    .update({
      override_verdict: overrideVerdict,
      override_reason: reason,
      overridden_by: userId,
      overridden_at: new Date().toISOString(),
      overall_verdict: overrideVerdict,
    })
    .eq('id', reviewId)
    .select()
    .single();

  if (error) {
    console.error('[DesignReview] Failed to override:', error.message);
    return null;
  }

  return data as AIReviewResult;
}

/**
 * Get review history for a card.
 */
export async function getCardReviewHistory(
  supabase: SupabaseClient,
  cardId: string
): Promise<AIReviewResult[]> {
  const { data } = await supabase
    .from('ai_review_results')
    .select('*')
    .eq('card_id', cardId)
    .order('created_at', { ascending: false });

  return (data as AIReviewResult[]) ?? [];
}
