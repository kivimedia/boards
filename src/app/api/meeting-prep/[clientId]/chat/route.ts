import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { createAnthropicClient } from '@/lib/ai/providers';

export const maxDuration = 120;

interface Params { params: { clientId: string } }

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  let body: { message: string; session_id: string };
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }
  if (!body.message?.trim()) return errorResponse('message is required', 400);
  if (!body.session_id) return errorResponse('session_id is required', 400);

  const { supabase } = auth.ctx;

  // Load session
  const { data: session, error: fetchErr } = await supabase
    .from('meeting_prep_sessions')
    .select('*')
    .eq('id', body.session_id)
    .single();

  if (fetchErr || !session) return errorResponse('Session not found', 404);

  // Load client info
  const { data: client } = await supabase
    .from('clients')
    .select('name, company')
    .eq('id', params.clientId)
    .single();

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      try {
        const aiClient = await createAnthropicClient(supabase);
        if (!aiClient) {
          send('error', { error: 'AI not configured' });
          controller.close();
          return;
        }

        // Build context from tickets snapshot
        const ticketContext = (session.tickets_snapshot || [])
          .map((t: any) => `- ${t.title} [${t.status_label}]${t.due_date ? `, due ${t.due_date}` : ''}`)
          .join('\n');

        // Build chat history (last 30 messages)
        const chatHistory = (session.chat_messages || []).slice(-30);
        const messages = [
          ...chatHistory.map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          { role: 'user' as const, content: body.message.trim() },
        ];

        const systemPrompt = `You are a meeting assistant for a meeting with ${client?.name || 'the client'}${client?.company ? ` (${client.company})` : ''}.
Meeting: ${session.meeting_title || 'Client Meeting'}

You have full context on all current work for this client. Answer questions concisely and accurately based on the data below. If you don't have the information, say so clearly.

${session.executive_summary ? `Executive Summary: ${session.executive_summary}\n` : ''}
Current Tickets:
${ticketContext || 'No tickets found.'}

${session.last_update_id ? 'A weekly update was recently sent to the client.' : ''}`;

        const stream = aiClient.messages.stream({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: systemPrompt,
          messages,
        });

        let fullResponse = '';

        stream.on('text', (text: string) => {
          fullResponse += text;
          send('token', { text });
        });

        await stream.finalMessage();

        // Append messages to session
        const updatedMessages = [
          ...chatHistory,
          { role: 'user', content: body.message.trim(), timestamp: new Date().toISOString(), user_id: auth.ctx.userId },
          { role: 'assistant', content: fullResponse, timestamp: new Date().toISOString() },
        ];

        await supabase
          .from('meeting_prep_sessions')
          .update({ chat_messages: updatedMessages })
          .eq('id', body.session_id);

        send('done', { response: fullResponse.slice(0, 500) });
      } catch (err: any) {
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
