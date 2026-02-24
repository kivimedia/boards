import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { runWebResearch } from '@/lib/ai/web-research';
import type { WebResearchTaskType } from '@/lib/types';

export const maxDuration = 300;

/**
 * POST /api/web-research
 * Create a web research session and stream execution via SSE.
 *
 * Body: {
 *   task_type: WebResearchTaskType;
 *   input_prompt: string;
 *   input_urls?: string[];
 *   domain_allowlist?: string[];
 *   board_id?: string;
 *   card_id?: string;
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: {
    task_type: WebResearchTaskType;
    input_prompt: string;
    input_urls?: string[];
    domain_allowlist?: string[];
    board_id?: string;
    card_id?: string;
  };

  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.task_type || !body.input_prompt) {
    return errorResponse('task_type and input_prompt are required', 400);
  }

  const validTypes: WebResearchTaskType[] = [
    'url_import', 'competitor_research', 'link_health',
    'content_extraction', 'social_proof', 'general',
  ];
  if (!validTypes.includes(body.task_type)) {
    return errorResponse(`Invalid task_type. Must be one of: ${validTypes.join(', ')}`, 400);
  }

  // Board membership check if board_id provided
  if (body.board_id) {
    const { data: member } = await supabase
      .from('board_members')
      .select('id')
      .eq('board_id', body.board_id)
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (!member) {
      return errorResponse('Not a member of this board', 403);
    }
  }

  // Create session record
  const { data: session, error: sessionError } = await supabase
    .from('web_research_sessions')
    .insert({
      board_id: body.board_id || null,
      card_id: body.card_id || null,
      user_id: userId,
      task_type: body.task_type,
      input_prompt: body.input_prompt,
      input_urls: body.input_urls || [],
      domain_allowlist: body.domain_allowlist || [],
    })
    .select('id')
    .single();

  if (sessionError || !session) {
    return errorResponse('Failed to create research session', 500);
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

      // Send session ID immediately
      send('session', { session_id: session.id });

      try {
        await runWebResearch(
          supabase,
          {
            sessionId: session.id,
            taskType: body.task_type,
            inputPrompt: body.input_prompt,
            inputUrls: body.input_urls || [],
            domainAllowlist: body.domain_allowlist || [],
            boardId: body.board_id,
            cardId: body.card_id,
            userId,
          },
          {
            onToken: (text) => send('token', { text }),
            onProgress: (iteration, max) => send('progress', { iteration, max_iterations: max }),
            onToolCall: (name, input) => send('tool_call', { name, input }),
            onToolResult: (name, result, success) => send('tool_result', { name, result, success }),
            onScreenshot: (url, screenshotUrl) => send('screenshot', { url, screenshot_url: screenshotUrl }),
            onComplete: (output) => {
              send('complete', { output_preview: output.slice(0, 500), session_id: session.id });
              controller.close();
            },
            onError: (error) => {
              send('error', { error, session_id: session.id });
              controller.close();
            },
          }
        );
      } catch (err: any) {
        send('error', { error: err.message || 'Unknown error', session_id: session.id });
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

/**
 * GET /api/web-research?board_id=xxx
 * List recent research sessions.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const boardId = request.nextUrl.searchParams.get('board_id');

  let query = supabase
    .from('web_research_sessions')
    .select('id, task_type, input_prompt, status, pages_visited, screenshots_taken, total_cost_usd, duration_ms, created_at, completed_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (boardId) {
    query = query.eq('board_id', boardId);
  }

  const { data, error } = await query;
  if (error) return errorResponse('Failed to list sessions', 500);

  return Response.json({ data });
}
