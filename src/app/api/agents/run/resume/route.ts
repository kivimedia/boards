import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { executeStandaloneAgent } from '@/lib/ai/agent-executor';

export const maxDuration = 300;

/**
 * POST /api/agents/run/resume
 * Resume an agent execution after user confirms or rejects a pending tool call.
 *
 * Body: {
 *   execution_id: string;
 *   tool_call_id: string;
 *   action: 'approve' | 'reject';
 *   skill_id: string;
 *   input_message: string;
 *   board_id?: string;
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: {
    execution_id: string;
    tool_call_id: string;
    action: 'approve' | 'reject';
    skill_id: string;
    input_message: string;
    board_id?: string;
  };

  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.execution_id || !body.tool_call_id || !body.action || !body.skill_id || !body.input_message) {
    return errorResponse('execution_id, tool_call_id, action, skill_id, and input_message are required', 400);
  }

  if (body.action !== 'approve' && body.action !== 'reject') {
    return errorResponse('action must be "approve" or "reject"', 400);
  }

  // Stream response via SSE
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        await executeStandaloneAgent(
          supabase,
          {
            skillId: body.skill_id,
            boardId: body.board_id,
            userId,
            inputMessage: body.input_message,
            executionId: body.execution_id,
            confirmedToolCallId: body.action === 'approve' ? body.tool_call_id : undefined,
            rejectedToolCallId: body.action === 'reject' ? body.tool_call_id : undefined,
          },
          {
            onToken: (text) => send('token', { text }),
            onComplete: (output) => {
              send('complete', { output_preview: output.slice(0, 500) });
              controller.close();
            },
            onError: (error) => {
              send('error', { error });
              controller.close();
            },
            onToolCall: (name, input) => {
              send('tool_call', { name, input });
            },
            onToolResult: (name, result, success) => {
              send('tool_result', { name, result: result.slice(0, 500), success });
            },
            onThinking: (summary) => {
              send('thinking', { summary });
            },
            onConfirmationNeeded: (toolCallId, name, input, message) => {
              send('confirm', {
                tool_call_id: toolCallId,
                name,
                input,
                message,
              });
            },
          }
        );
      } catch (err: any) {
        send('error', { error: err.message || 'Unknown error' });
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
