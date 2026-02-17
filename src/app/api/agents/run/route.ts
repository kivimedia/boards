import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { getSkill } from '@/lib/agent-engine';
import { createAnthropicClient } from '@/lib/ai/providers';
import { calculateCost, logUsage } from '@/lib/ai/cost-tracker';

export const maxDuration = 120;

/**
 * POST /api/agents/run
 * Standalone agent execution (no card/board context required).
 * Streams output via SSE.
 *
 * Body: { skill_id: string; input_message: string }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: { skill_id: string; input_message: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.skill_id || !body.input_message) {
    return errorResponse('skill_id and input_message are required', 400);
  }

  // Load skill
  const skill = await getSkill(supabase, body.skill_id);
  if (!skill) {
    return errorResponse('Skill not found', 404);
  }

  // Create Anthropic client
  const client = await createAnthropicClient(supabase);
  if (!client) {
    return errorResponse('Anthropic API key not configured. Go to Settings > AI Keys to add one.', 400);
  }

  // Build prompt
  const systemPrompt = skill.system_prompt;
  const userMessage = body.input_message;
  const modelId = 'claude-sonnet-4-5-20250929';
  const startTime = Date.now();

  // Stream response via SSE
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        let fullOutput = '';

        const stream = client.messages.stream({
          model: modelId,
          max_tokens: Math.min(skill.estimated_tokens * 2, 8192),
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        });

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && (event.delta as any).type === 'text_delta') {
            const text = (event.delta as any).text;
            fullOutput += text;
            controller.enqueue(
              encoder.encode(`event: token\ndata: ${JSON.stringify({ text })}\n\n`)
            );
          }
        }

        const finalMessage = await stream.finalMessage();
        const inputTokens = finalMessage.usage.input_tokens;
        const outputTokens = finalMessage.usage.output_tokens;
        const costUsd = calculateCost('anthropic', modelId, inputTokens, outputTokens);
        const durationMs = Date.now() - startTime;

        // Log usage (non-fatal)
        try {
          await logUsage(supabase, {
            userId,
            activity: 'agent_standalone_execution',
            provider: 'anthropic',
            modelId,
            inputTokens,
            outputTokens,
            latencyMs: durationMs,
            status: 'success',
            metadata: { skill_slug: skill.slug },
          });
        } catch {}

        controller.enqueue(
          encoder.encode(
            `event: complete\ndata: ${JSON.stringify({
              output_preview: fullOutput.slice(0, 500),
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              cost_usd: costUsd,
              duration_ms: durationMs,
            })}\n\n`
          )
        );
        controller.close();
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ error: err.message || 'Unknown error' })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
