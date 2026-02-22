import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { getSkill } from '@/lib/agent-engine';
import { executeAgentConversation } from '@/lib/ai/agent-executor';
import { shouldIncludeWebSearch } from '@/lib/ai/agent-tools';

export const maxDuration = 300;

/**
 * GET /api/agents/sessions
 * List current user's recent agent sessions (for tab restoration on page load).
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const { data, error } = await supabase
    .from('agent_sessions')
    .select('*, skill:agent_skills(id, name, slug, icon, category, quality_tier)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) return errorResponse(error.message, 500);

  // Mark any stale 'running' sessions as idle (server-side agent died on page nav)
  const stale = (data || []).filter((s: any) => s.status === 'running');
  if (stale.length > 0) {
    await supabase
      .from('agent_sessions')
      .update({ status: 'idle' })
      .in('id', stale.map((s: any) => s.id));
    for (const s of stale) s.status = 'idle';
  }

  return NextResponse.json({ data: data || [] });
}

/**
 * POST /api/agents/sessions
 * Create a new session and run the first turn. Returns SSE stream.
 * Body: { skill_id, input_message, board_id? }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: { skill_id: string; input_message: string; board_id?: string };
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }

  if (!body.skill_id || !body.input_message?.trim()) {
    return errorResponse('skill_id and input_message are required', 400);
  }

  const skill = await getSkill(supabase, body.skill_id);
  if (!skill) return errorResponse('Skill not found', 404);

  // Build system prompt
  let systemPrompt = skill.system_prompt;
  const hasTools = (skill.supported_tools?.length ?? 0) > 0;
  if (hasTools) {
    systemPrompt += '\n\nYou have tools available. Use them to gather information and take actions. Use the think tool to reason through complex problems before acting.';
  }

  // Auto-generate title from first ~50 chars of input
  const title = body.input_message.trim().slice(0, 50) + (body.input_message.trim().length > 50 ? '...' : '');

  // Create session
  const { data: session, error: insertErr } = await supabase
    .from('agent_sessions')
    .insert({
      user_id: userId,
      skill_id: body.skill_id,
      board_id: body.board_id || null,
      title,
      system_prompt: systemPrompt,
      status: 'running',
    })
    .select('*')
    .single();

  if (insertErr || !session) return errorResponse(insertErr?.message || 'Failed to create session', 500);

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { /* client disconnected */ }
      };

      // Emit session ID first so client can create the tab
      send('session', { session_id: session.id, title, skill_name: skill.name, skill_icon: skill.icon });

      try {
        const result = await executeAgentConversation(supabase, {
          skillId: body.skill_id,
          boardId: body.board_id,
          userId,
          systemPrompt,
          messageHistory: [],
          newUserMessage: body.input_message.trim(),
        }, {
          onToken: (text) => send('token', { text }),
          onComplete: () => {},
          onError: (error) => send('error', { error }),
          onToolCall: (name, input) => send('tool_call', { name, input }),
          onToolResult: (name, result, success) => send('tool_result', { name, result: result.slice(0, 500), success }),
          onThinking: (summary) => send('thinking', { summary }),
        });

        // Persist conversation state
        await supabase.from('agent_sessions').update({
          message_history: result.updatedMessageHistory,
          total_input_tokens: result.inputTokens,
          total_output_tokens: result.outputTokens,
          total_cost_usd: result.costUsd,
          turn_count: 1,
          tool_call_count: result.toolCallCount,
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
