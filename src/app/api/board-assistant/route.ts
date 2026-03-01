import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { gatherBoardContext, boardContextToText } from '@/lib/board-context';
import { validateChartData } from '@/lib/ai/chart-validator';
import { createAnthropicClient } from '@/lib/ai/providers';
import { searchKnowledge } from '@/lib/ai/knowledge-indexer';
import { searchCards, extractSearchFromUrl } from '@/lib/search';

export const maxDuration = 60;

const BOARD_CATEGORIES = [
  { id: 'workload', description: 'questions about who is doing what, capacity, task distribution' },
  { id: 'deadlines', description: 'due dates, overdue items, timeline questions' },
  { id: 'assignments', description: 'task ownership, reassignment, who is responsible' },
  { id: 'progress', description: 'completion rates, status updates, how things are going' },
  { id: 'blocked', description: 'blockers, stuck items, impediments' },
  { id: 'general', description: 'board structure, settings, labels, general questions' },
];

/**
 * POST /api/board-assistant
 * AI-powered board assistant that answers questions about the current board.
 * Streams response via SSE with structured metadata on completion.
 * Body: { query: string, board_id: string }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  let body: { query: string; board_id: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { query, board_id } = body;
  if (!query || !board_id) {
    return errorResponse('query and board_id are required');
  }

  try {
    // Gather board context using shared helper
    const boardCtx = await gatherBoardContext(supabase, board_id);
    if (!boardCtx) {
      return errorResponse('Board not found', 404);
    }

    const boardText = boardContextToText(boardCtx);

    // Resolve the actual search query (extract from URL if applicable)
    const urlExtracted = extractSearchFromUrl(query);
    const searchQuery = urlExtracted || query;

    // Hybrid search: semantic + keyword in parallel
    let hybridContext = '';
    try {
      const [semanticResults, keywordResults] = await Promise.all([
        searchKnowledge(supabase, searchQuery, {
          boardId: board_id,
          limit: 15,
          threshold: 0.45,
          sourceTypes: ['card'],
        }).catch(() => []),
        searchCards(supabase, searchQuery, 10, board_id).catch(() => []),
      ]);

      const parts: string[] = [];

      if (semanticResults.length > 0) {
        parts.push(`\n=== Most Relevant Cards (semantic match) ===\n`);
        for (const r of semanticResults) {
          parts.push(`### ${r.title} (relevance: ${(r.similarity * 100).toFixed(0)}%)\n${r.content}`);
        }
      }

      // Add keyword-only matches (not already in semantic results)
      const semanticIds = new Set(semanticResults.map((r) => r.source_id));
      const keywordOnly = keywordResults.filter((r) => !semanticIds.has(r.id));
      if (keywordOnly.length > 0) {
        parts.push(`\n=== Additional Cards (keyword match) ===\n`);
        for (const r of keywordOnly) {
          parts.push(`### ${r.title}\n${r.subtitle || ''}`);
        }
      }

      if (urlExtracted) {
        parts.push(`\n(Note: user pasted a URL. Extracted search terms: "${urlExtracted}")\n`);
      }

      hybridContext = parts.join('\n\n');
    } catch {
      // Hybrid search is best-effort - continue without it
    }

    const context = hybridContext + boardText;

    // Call Claude API using stored key from settings
    const client = await createAnthropicClient(supabase);
    if (!client) {
      return errorResponse('AI assistant not configured. Add your Anthropic API key in Settings > AI.', 500);
    }

    const categoriesStr = BOARD_CATEGORIES.map(c => `- "${c.id}": ${c.description}`).join('\n');

    const systemPrompt = `You are a helpful board assistant for a project management tool called Kivi Media. You have full read access to the current board's data including ALL card titles, descriptions, comments, checklists, assignments, due dates, labels, and team members.

You have read through every single ticket on this board. You know the content of every card description and every comment. When users ask about specific topics, links, files, or details - search through the card descriptions and comments to find the answer. If a card description or comment contains a link (Figma, Google Doc, URL, etc.), include it in your response.

Answer the user's question based on the board data provided. Be concise and specific. Use the actual data to provide accurate answers.

You MUST respond with a valid JSON object with this exact structure:
{
  "response": "Your answer here. Use bullet points (- ) for lists. Keep under 300 words.",
  "thinking": "Brief 1-2 sentence reasoning about what the user is asking.",
  "user_mood": "One of: positive, neutral, negative, curious, frustrated, confused",
  "suggested_questions": ["Follow-up question 1", "Follow-up question 2", "Follow-up question 3"],
  "matched_categories": ["category1", "category2"],
  "redirect_to_owner": { "should_redirect": false },
  "chart_data": null
}

Available categories for matched_categories:
${categoriesStr}

Rules for chart_data:
- Include chart_data ONLY for analytical/comparative questions (e.g. "show workload distribution", "how many cards per list", "priority breakdown").
- Do NOT include chart_data for factual or lookup questions (e.g. "what tasks are overdue", "who is assigned to X").
- Set chart_data to null when no chart is appropriate.
- When including chart_data, use this structure:
  {
    "chartType": "bar" | "pie" | "line",
    "title": "Chart title (short, descriptive)",
    "data": [{ "label": "Item name", "value": 5 }, ...],
    "valueLabel": "cards" (optional, unit label),
    "trend": "+3 this week" (optional, trend text)
  }
- Chart type rules:
  - "bar": Use for comparisons (cards per list, per assignee, per priority level)
  - "pie": Use for distributions/proportions (workload share, priority mix, label spread)
  - "line": Use ONLY when ordered temporal data with 3+ points exists (e.g. cards created per day)
- Data must have 2-12 items. If more than 12 categories exist, group the smallest into "Other".
- Values must be non-negative numbers.
- Do NOT assign colors in data items; the UI handles colors automatically.

Rules for redirect_to_owner:
- Set should_redirect to true ONLY when you cannot answer the question from the board data (e.g. questions about budget, strategy, permissions, or things not visible in the data)
- Include a reason when redirecting, e.g. { "should_redirect": true, "reason": "Budget information is not available in board data" }

Rules for suggested_questions:
- Always provide exactly 3 follow-up questions that are relevant to the user's original question and the board data
- Questions should be specific to this board's actual content (reference real lists, people, or card topics)

Rules for user_mood:
- Detect mood from the question phrasing. "Why isn't this done?" = frustrated. "What's the status?" = curious. "Great work on..." = positive.

IMPORTANT: Your entire response must be valid JSON. Do not include any text before or after the JSON object.`;

    // SSE streaming
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
                content: `Here is the current board data:\n\n${context}\n\nUser question: ${query}`,
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

          // Reconstruct full JSON (we prefilled with "{")
          const fullJson = '{' + fullOutput;

          let parsed: any;
          try {
            parsed = JSON.parse(fullJson);
          } catch {
            // If JSON parsing fails, return the raw text as the response
            parsed = {
              response: fullJson,
              thinking: '',
              user_mood: 'neutral',
              suggested_questions: [],
              matched_categories: ['general'],
              redirect_to_owner: { should_redirect: false },
            };
          }

          // Validate and normalize
          const validatedChart = validateChartData(parsed.chart_data);

          const result: Record<string, unknown> = {
            response: typeof parsed.response === 'string' ? parsed.response : fullJson,
            thinking: typeof parsed.thinking === 'string' ? parsed.thinking : '',
            user_mood: ['positive', 'neutral', 'negative', 'curious', 'frustrated', 'confused'].includes(parsed.user_mood)
              ? parsed.user_mood
              : 'neutral',
            suggested_questions: Array.isArray(parsed.suggested_questions)
              ? parsed.suggested_questions.filter((q: any) => typeof q === 'string').slice(0, 3)
              : [],
            matched_categories: Array.isArray(parsed.matched_categories)
              ? parsed.matched_categories.filter((c: any) => typeof c === 'string').slice(0, 3)
              : ['general'],
            redirect_to_owner: parsed.redirect_to_owner && typeof parsed.redirect_to_owner === 'object'
              ? {
                  should_redirect: !!parsed.redirect_to_owner.should_redirect,
                  reason: parsed.redirect_to_owner.reason || undefined,
                }
              : { should_redirect: false },
          };

          if (validatedChart) {
            result.chart_data = validatedChart;
          }

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
    console.error('[board-assistant] Error:', err);
    return errorResponse(err.message || 'AI assistant error', 500);
  }
}
