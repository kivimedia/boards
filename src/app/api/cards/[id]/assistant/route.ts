import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { createAnthropicClient } from '@/lib/ai/providers';
import { searchKnowledge } from '@/lib/ai/knowledge-indexer';

export const maxDuration = 60;

/**
 * POST /api/cards/[id]/assistant
 * AI assistant scoped to a single card's context.
 * Streams response via SSE.
 * Body: { query: string, boardId: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  let body: { query: string; boardId: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { query, boardId } = body;
  if (!query) return errorResponse('query is required');

  const client = await createAnthropicClient(supabase);
  if (!client) return errorResponse('AI not configured. Add an Anthropic key in Settings > AI Configuration.', 500);

  try {
    // Gather card context in parallel
    const [
      cardRes,
      boardRes,
      placementRes,
      labelsRes,
      assigneesRes,
      commentsRes,
      checklistsRes,
      attachmentsRes,
    ] = await Promise.all([
      supabase.from('cards').select('*').eq('id', params.id).single(),
      boardId
        ? supabase.from('boards').select('name, type').eq('id', boardId).single()
        : Promise.resolve({ data: null }),
      supabase
        .from('card_placements')
        .select('list:lists(name)')
        .eq('card_id', params.id)
        .eq('is_mirror', false)
        .single(),
      supabase
        .from('card_labels')
        .select('label:labels(name, color)')
        .eq('card_id', params.id),
      supabase
        .from('card_assignees')
        .select('user:profiles(display_name)')
        .eq('card_id', params.id),
      supabase
        .from('comments')
        .select('content, created_at, user:profiles(display_name)')
        .eq('card_id', params.id)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('checklists')
        .select('title, items:checklist_items(content, is_completed)')
        .eq('card_id', params.id),
      supabase
        .from('attachments')
        .select('file_name, file_type, created_at')
        .eq('card_id', params.id)
        .limit(50),
    ]);

    const card = cardRes.data;
    if (!card) return errorResponse('Card not found', 404);

    // Build context string
    let context = `Card: ${card.title}\n`;
    if (boardRes.data) context += `Board: ${boardRes.data.name}\n`;
    const listName = (placementRes.data?.list as any)?.name;
    if (listName) context += `List: ${listName}\n`;
    if (card.priority && card.priority !== 'none') context += `Priority: ${card.priority}\n`;
    if (card.due_date) context += `Due: ${card.due_date}\n`;
    if (card.start_date) context += `Start: ${card.start_date}\n`;

    const labelNames = (labelsRes.data || []).map((cl: any) => cl.label?.name).filter(Boolean);
    if (labelNames.length > 0) context += `Labels: ${labelNames.join(', ')}\n`;

    const assigneeNames = (assigneesRes.data || []).map((a: any) => a.user?.display_name).filter(Boolean);
    if (assigneeNames.length > 0) context += `Assignees: ${assigneeNames.join(', ')}\n`;

    if (card.description) {
      const desc = card.description.length > 2000 ? card.description.slice(0, 2000) + '...' : card.description;
      context += `\nDescription:\n${desc}\n`;
    }

    const comments = commentsRes.data || [];
    if (comments.length > 0) {
      context += `\nComments (${comments.length} most recent):\n`;
      for (const c of comments) {
        const who = (c as any).user?.display_name || 'Unknown';
        const date = new Date(c.created_at).toLocaleDateString();
        context += `- [${date}] ${who}: ${c.content}\n`;
      }
    }

    const checklists = checklistsRes.data || [];
    if (checklists.length > 0) {
      context += `\nChecklists:\n`;
      for (const cl of checklists) {
        const items = (cl as any).items || [];
        const done = items.filter((i: any) => i.is_completed).length;
        context += `  ${cl.title} (${done}/${items.length} done):\n`;
        for (const item of items.slice(0, 20)) {
          context += `    [${item.is_completed ? 'x' : ' '}] ${item.content}\n`;
        }
      }
    }

    const attachments = attachmentsRes.data || [];
    if (attachments.length > 0) {
      context += `\nAttachments (${attachments.length}):\n`;
      for (const a of attachments.slice(0, 20)) {
        context += `- ${a.file_name} (${a.file_type || 'unknown type'})\n`;
      }
    }

    context += `\nCreated: ${card.created_at}\nUpdated: ${card.updated_at}\n`;

    // Enrich with board summary and related cards from knowledge base
    if (boardId) {
      try {
        // Board summary for broader context
        const { data: boardSummary } = await supabase
          .from('board_summaries')
          .select('summary_text')
          .eq('board_id', boardId)
          .single();
        if (boardSummary?.summary_text) {
          context += `\n=== Board Overview ===\n${boardSummary.summary_text}\n`;
        }

        // Related cards via semantic search
        const cardText = `${card.title} ${card.description || ''}`.slice(0, 500);
        const related = await searchKnowledge(supabase, cardText, {
          boardId,
          limit: 5,
          threshold: 0.6,
          excludeSourceId: params.id,
          sourceTypes: ['card'],
        });
        if (related.length > 0) {
          context += `\n=== Related Cards on This Board ===\n`;
          for (const r of related) {
            context += `- ${r.title}: ${r.content.slice(0, 300)}\n`;
          }
        }
      } catch {
        // Best-effort enrichment
      }
    }

    const systemPrompt = `You are a helpful card assistant for a project management tool called Kivi Media. You have DEEP context about this specific card including its full title, description, ALL comments (not truncated), checklists, attachments, labels, and assignees. You also have the board overview and related cards for broader context.

Answer the user's question about this card concisely and helpfully. You can:
- Summarize the card's status, progress, and activity
- Answer questions about comments, checklists, or attachments
- Reference specific links, URLs, or files mentioned in comments or descriptions
- Suggest next steps or improvements
- Help draft comment replies or descriptions
- Analyze the card's history and progress
- Relate this card to other work on the board

You MUST respond with a valid JSON object:
{
  "response": "Your answer. Use bullet points (- ) for lists. Keep under 300 words.",
  "suggested_questions": ["Follow-up 1", "Follow-up 2", "Follow-up 3"]
}

Make suggested questions specific to this card's actual content.
IMPORTANT: Your entire response must be valid JSON.`;

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          let fullOutput = '';

          const stream = client.messages.stream({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2048,
            system: systemPrompt,
            messages: [
              {
                role: 'user',
                content: `Here is the card data:\n\n${context}\n\nUser question: ${query}`,
              },
              { role: 'assistant', content: '{' },
            ],
          });

          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              (event.delta as any).type === 'text_delta'
            ) {
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
            parsed = { response: fullJson, suggested_questions: [] };
          }

          const result = {
            response: typeof parsed.response === 'string' ? parsed.response : fullJson,
            suggested_questions: Array.isArray(parsed.suggested_questions)
              ? parsed.suggested_questions.filter((q: any) => typeof q === 'string').slice(0, 3)
              : [],
          };

          controller.enqueue(
            encoder.encode(`event: done\ndata: ${JSON.stringify(result)}\n\n`)
          );
          controller.close();
        } catch (err: any) {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ error: err.message || 'AI error' })}\n\n`
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
  } catch (err: any) {
    console.error('[card-assistant] Error:', err);
    return errorResponse(err.message || 'AI error', 500);
  }
}
