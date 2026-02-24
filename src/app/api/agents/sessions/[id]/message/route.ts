import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { executeAgentConversation } from '@/lib/ai/agent-executor';
import type Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 300;

interface Params { params: { id: string } }

/**
 * POST /api/agents/sessions/:id/message
 * Send a follow-up message to an existing agent session. Returns SSE stream.
 * Body: { message: string }
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: { message: string };
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }
  if (!body.message?.trim()) return errorResponse('message is required', 400);

  // Load the session
  const { data: session, error: fetchErr } = await supabase
    .from('agent_sessions')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', userId)
    .single();

  if (fetchErr || !session) return errorResponse('Session not found', 404);
  if (session.status === 'running') return errorResponse('Session is already running', 409);

  // Mark as running
  await supabase.from('agent_sessions').update({ status: 'running' }).eq('id', session.id);

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      try {
        const result = await executeAgentConversation(supabase, {
          skillId: session.skill_id,
          boardId: session.board_id || undefined,
          userId,
          systemPrompt: session.system_prompt,
          messageHistory: (session.message_history || []) as Anthropic.MessageParam[],
          newUserMessage: body.message.trim(),
        }, {
          onToken: (text) => send('token', { text }),
          onComplete: () => {},
          onError: (error) => send('error', { error }),
          onToolCall: (name, input) => send('tool_call', { name, input }),
          onToolResult: (name, result, success) => send('tool_result', { name, result: result.slice(0, 500), success }),
          onThinking: (summary) => send('thinking', { summary }),
        });

        // Persist updated state
        await supabase.from('agent_sessions').update({
          message_history: result.updatedMessageHistory,
          total_input_tokens: session.total_input_tokens + result.inputTokens,
          total_output_tokens: session.total_output_tokens + result.outputTokens,
          total_cost_usd: parseFloat(session.total_cost_usd) + result.costUsd,
          turn_count: session.turn_count + 1,
          tool_call_count: session.tool_call_count + result.toolCallCount,
          status: 'idle',
        }).eq('id', session.id);

        send('complete', { output_preview: result.fullOutput.slice(0, 500) });
      } catch (err: any) {
        await supabase.from('agent_sessions').update({
          status: 'error',
          error_message: err.message,
        }).eq('id', session.id);
        send('error', { error: err.message || 'Unknown error' });
      }

      controller.close();
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
