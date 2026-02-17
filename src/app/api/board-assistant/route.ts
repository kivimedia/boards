import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import Anthropic from '@anthropic-ai/sdk';
import type { BoardChartData } from '@/lib/types';
import { gatherBoardContext, boardContextToText } from '@/lib/board-context';

export const maxDuration = 60;

const VALID_CHART_TYPES = ['bar', 'pie', 'line'] as const;

/**
 * Validates and normalizes chart_data from AI response.
 * Returns null if data is invalid or missing.
 */
export function validateChartData(raw: unknown): BoardChartData | null {
  if (!raw || typeof raw !== 'object') return null;

  const obj = raw as Record<string, unknown>;

  // Validate chartType
  if (!obj.chartType || !VALID_CHART_TYPES.includes(obj.chartType as any)) return null;

  // Validate title
  if (typeof obj.title !== 'string' || !obj.title.trim()) return null;

  // Validate data array
  if (!Array.isArray(obj.data) || obj.data.length < 2 || obj.data.length > 12) return null;

  const validatedData: BoardChartData['data'] = [];
  for (const item of obj.data) {
    if (!item || typeof item !== 'object') return null;
    const point = item as Record<string, unknown>;
    if (typeof point.label !== 'string' || !point.label.trim()) return null;
    if (typeof point.value !== 'number' || !isFinite(point.value) || point.value < 0) return null;

    validatedData.push({
      label: point.label.trim().slice(0, 40),
      value: Math.round(point.value * 100) / 100,
      ...(typeof point.color === 'string' && point.color.trim() ? { color: point.color.trim() } : {}),
    });
  }

  return {
    chartType: obj.chartType as BoardChartData['chartType'],
    title: (obj.title as string).trim().slice(0, 80),
    data: validatedData,
    ...(typeof obj.valueLabel === 'string' && obj.valueLabel.trim() ? { valueLabel: obj.valueLabel.trim().slice(0, 30) } : {}),
    ...(typeof obj.trend === 'string' && obj.trend.trim() ? { trend: obj.trend.trim().slice(0, 60) } : {}),
  };
}

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

    const context = boardContextToText(boardCtx);

    // Call Claude API
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return errorResponse('AI assistant not configured (missing API key)', 500);
    }

    const categoriesStr = BOARD_CATEGORIES.map(c => `- "${c.id}": ${c.description}`).join('\n');

    const systemPrompt = `You are a helpful board assistant for a project management tool called KM Boards. You have full read access to the current board's data including all cards, lists, assignments, due dates, labels, and team members.

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

    const client = new Anthropic({ apiKey });

    // SSE streaming
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
