import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { createAnthropicClient } from '@/lib/ai/providers';

export const maxDuration = 60;

/**
 * POST /api/global-assistant
 * AI-powered global assistant that answers questions across all boards.
 * Streams response via SSE with structured metadata on completion.
 * Body: { query: string }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: { query: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  if (!body.query?.trim()) {
    return errorResponse('query is required');
  }

  const client = await createAnthropicClient(supabase);
  if (!client) {
    return errorResponse('AI assistant not configured. Add your Anthropic API key in Settings > AI.', 500);
  }

  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    // Gather cross-board context in parallel
    const [boardsRes, recentCardsRes, overdueRes, dueWeekRes, membersRes] = await Promise.all([
      supabase.from('boards').select('id, name, type').eq('is_archived', false).order('created_at'),
      supabase
        .from('cards')
        .select('id, title, description, priority, due_date, created_at, card_placements(lists(name, boards(name)))')
        .order('updated_at', { ascending: false })
        .limit(50),
      supabase
        .from('card_assignees')
        .select('card_id, cards!inner(id, title, due_date, priority)')
        .eq('user_id', userId)
        .lt('cards.due_date', todayStr)
        .not('cards.due_date', 'is', null),
      supabase
        .from('card_assignees')
        .select('card_id, cards!inner(id, title, due_date)')
        .eq('user_id', userId)
        .gte('cards.due_date', todayStr)
        .lt('cards.due_date', weekEndStr),
      supabase.from('profiles').select('id, display_name, role').limit(30),
    ]);

    const boards = boardsRes.data || [];
    const recentCards = recentCardsRes.data || [];
    const overdueCards = overdueRes.data || [];
    const dueThisWeek = dueWeekRes.data || [];
    const members = membersRes.data || [];

    // Build context text
    const lines: string[] = [];
    lines.push(`Today: ${todayStr}`);
    lines.push(`\nBoards (${boards.length}):`);
    for (const b of boards) {
      lines.push(`- ${b.name} (${b.type})`);
    }

    lines.push(`\nTeam members (${members.length}):`);
    for (const m of members) {
      lines.push(`- ${m.display_name}${m.role ? ` (${m.role})` : ''}`);
    }

    lines.push(`\nOverdue cards assigned to you (${overdueCards.length}):`);
    for (const c of overdueCards.slice(0, 15)) {
      const card = (c as any).cards;
      lines.push(`- "${card.title}" (due: ${card.due_date}, priority: ${card.priority || 'none'})`);
    }

    lines.push(`\nDue this week (${dueThisWeek.length}):`);
    for (const c of dueThisWeek.slice(0, 15)) {
      const card = (c as any).cards;
      lines.push(`- "${card.title}" (due: ${card.due_date})`);
    }

    lines.push(`\nRecent cards across boards (${recentCards.length}):`);
    for (const card of recentCards.slice(0, 30)) {
      const placement = (card as any).card_placements?.[0];
      const boardName = placement?.lists?.boards?.name || 'Unknown board';
      const listName = placement?.lists?.name || '';
      lines.push(`- "${card.title}" in ${boardName}${listName ? ` > ${listName}` : ''} (priority: ${card.priority || 'none'}${card.due_date ? `, due: ${card.due_date}` : ''})`);
    }

    const context = lines.join('\n');

    const systemPrompt = `You are a helpful project management assistant for KM Boards. You have access to the user's boards, cards, assignments, and team data across ALL their boards.

Answer the user's question based on the data provided. Be concise and specific. Use the actual data to provide accurate answers.

You MUST respond with a valid JSON object with this exact structure:
{
  "response": "Your answer here. Use bullet points (- ) for lists. Keep under 300 words.",
  "thinking": "Brief 1-2 sentence reasoning.",
  "user_mood": "One of: positive, neutral, negative, curious, frustrated, confused",
  "suggested_questions": ["Follow-up 1", "Follow-up 2", "Follow-up 3"]
}

Rules:
- Answer from the data. If data is insufficient, say so clearly.
- Always provide exactly 3 relevant follow-up questions based on the actual data.
- Detect mood from the question phrasing.
- Your entire response must be valid JSON. No text before or after the JSON.`;

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          let fullOutput = '';

          const stream = client.messages.stream({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: systemPrompt,
            messages: [
              {
                role: 'user',
                content: `Here is your workspace data:\n\n${context}\n\nUser question: ${body.query.trim()}`,
              },
              {
                role: 'assistant',
                content: '{',
              },
            ],
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

          const fullJson = '{' + fullOutput;
          let parsed: any;
          try {
            parsed = JSON.parse(fullJson);
          } catch {
            parsed = {
              response: fullJson,
              thinking: '',
              user_mood: 'neutral',
              suggested_questions: [],
            };
          }

          const result = {
            response: typeof parsed.response === 'string' ? parsed.response : fullJson,
            user_mood: ['positive', 'neutral', 'negative', 'curious', 'frustrated', 'confused'].includes(parsed.user_mood)
              ? parsed.user_mood
              : 'neutral',
            suggested_questions: Array.isArray(parsed.suggested_questions)
              ? parsed.suggested_questions.filter((q: any) => typeof q === 'string').slice(0, 3)
              : [],
            matched_categories: ['general'] as string[],
            redirect_to_owner: { should_redirect: false },
          };

          controller.enqueue(
            encoder.encode(`event: done\ndata: ${JSON.stringify(result)}\n\n`)
          );
          controller.close();
        } catch (err: any) {
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ error: err.message || 'AI assistant error' })}\n\n`)
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
  } catch (err: any) {
    console.error('[global-assistant] Error:', err);
    return errorResponse(err.message || 'AI assistant error', 500);
  }
}
