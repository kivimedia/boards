import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { executeAgentSkill } from '@/lib/ai/agent-executor';

export const maxDuration = 120;

type Params = { params: { id: string; taskId: string } };

/**
 * POST /api/cards/[id]/agent-tasks/[taskId]/run
 * Triggers execution of a card agent task. Returns SSE stream.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const { supabase, userId } = auth.ctx;

    // Load the task
    const { data: task, error: taskError } = await supabase
      .from('card_agent_tasks')
      .select('*, skill:agent_skills(id, slug, name)')
      .eq('id', params.taskId)
      .single();

    if (taskError || !task) {
      return errorResponse('Task not found', 404);
    }

    if (task.status === 'running') {
      return errorResponse('Task is already running', 409);
    }

    // Find the board for this card
    const { data: placement } = await supabase
      .from('card_placements')
      .select('list:lists(board_id)')
      .eq('card_id', params.id)
      .limit(1)
      .single();

    const boardId = (placement?.list as any)?.board_id;

    // Find or create board agent
    let boardAgentId: string | undefined;
    if (boardId) {
      const { data: boardAgent } = await supabase
        .from('board_agents')
        .select('id')
        .eq('board_id', boardId)
        .eq('skill_id', task.skill_id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      boardAgentId = boardAgent?.id;
    }

    if (!boardAgentId && boardId) {
      const { data: newAgent } = await supabase
        .from('board_agents')
        .insert({
          board_id: boardId,
          skill_id: task.skill_id,
          created_by: userId,
        })
        .select('id')
        .single();
      boardAgentId = newAgent?.id;
    }

    if (!boardAgentId) {
      return errorResponse('Could not resolve board agent', 400);
    }

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: string) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        };

        const heartbeat = setInterval(() => {
          send('heartbeat', JSON.stringify({ ts: Date.now() }));
        }, 15000);

        try {
          await executeAgentSkill(
            supabase,
            {
              taskId: params.taskId,
              skillId: task.skill_id,
              boardAgentId,
              cardId: params.id,
              boardId: boardId ?? '',
              userId,
              inputPrompt: body.input_prompt ?? task.input_prompt,
            },
            {
              onToken: (text) => {
                send('token', JSON.stringify({ text }));
              },
              onComplete: (output) => {
                send('complete', JSON.stringify({
                  output_preview: output.slice(0, 500),
                  output_length: output.length,
                }));
              },
              onError: (error) => {
                send('error', JSON.stringify({ error }));
              },
            }
          );
        } catch (err: any) {
          send('error', JSON.stringify({ error: err.message }));
        } finally {
          clearInterval(heartbeat);
          send('done', '{}');
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}
