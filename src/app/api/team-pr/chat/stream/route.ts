import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { createAnthropicClient } from '@/lib/ai/providers';
import type { PRRun, PRClient } from '@/lib/types';

export const maxDuration = 120;

interface PRChatBody {
  message: string;
  runId?: string;
  clientId?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

const PR_SYSTEM_PROMPT = `You are the PR Orchestrator Assistant for KM Boards - an AI-powered agency management platform. You help the user understand and manage the PR outreach pipeline.

## Pipeline Stages
The PR pipeline runs in this order:
1. **Research** - Discover relevant media outlets via Tavily, YouTube Data API, and Exa. Score each for relevance.
2. **Gate A** - Human reviews discovered outlets. Can exclude irrelevant ones before proceeding.
3. **Verification** - Verify contact info using Hunter.io, web scraping. Find editor/journalist emails with confidence scores.
4. **Gate B** - Human reviews verified contacts. Can exclude outlets with low confidence contacts.
5. **QA Loop** - Quality check on outlets: activity, editorial standards, exclusion list, content relevance.
6. **Gate C** - Human reviews QA results. Final filter before email generation.
7. **Email Generation** - Craft personalized pitch emails using client brand voice, tone rules, and pitch angles.
8. **Completed** - All emails generated and ready for review/sending.

## Team Agents
- **PR Orchestrator** - Coordinates the pipeline, manages gates, handles errors
- **Research Agent** - Discovers outlets using multi-source search
- **Verification Agent** - Verifies contacts via Hunter.io
- **QA Agent** - Quality checks on outlets
- **Email Writer** - Crafts personalized pitch emails

## Your Capabilities
- Explain what's happening at any stage of a PR run
- Help with gate approval decisions (approve, exclude outlets, cancel)
- Advise on client configuration (brand voice, pitch angles, territories)
- Suggest improvements to outreach strategy
- Interpret cost breakdowns and efficiency metrics
- Answer general PR and media outreach questions
- Help refine target markets, pitch angles, and tone rules

## Guidelines
- Be concise and actionable
- When discussing a specific run, reference its client, territory, status, and stats
- If the user asks about data not in the provided context, say so
- Use markdown formatting for readability
- Never fabricate data about runs, outlets, or costs - only reference what's in the context`;

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  let body: PRChatBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { message, runId, clientId, history } = body;
  const { supabase } = auth.ctx;

  if (!message?.trim()) return errorResponse('message is required');

  const encoder = new TextEncoder();

  const emitEvent = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    eventName: string,
    data: Record<string, unknown>
  ) => {
    controller.enqueue(
      encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`)
    );
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const client = await createAnthropicClient(supabase);
        if (!client) {
          emitEvent(controller, 'error', { type: 'error', error: 'Anthropic API key not configured' });
          controller.close();
          return;
        }

        // Build context
        let runContext = '';

        if (runId) {
          try {
            const { data: run } = await supabase
              .from('pr_runs')
              .select('*, client:pr_clients(*), territory:pr_territories(*)')
              .eq('id', runId)
              .single() as { data: PRRun | null; error: unknown };

            if (run) {
              runContext += `\n## Current Run Context\n`;
              runContext += `- **Client**: ${run.client?.name || run.client_id}\n`;
              if (run.territory) runContext += `- **Territory**: ${run.territory.name} (${run.territory.language})\n`;
              runContext += `- **Status**: ${run.status}\n`;
              runContext += `- **Outlets Discovered**: ${run.outlets_discovered}\n`;
              runContext += `- **Outlets Verified**: ${run.outlets_verified}\n`;
              runContext += `- **Outlets QA Passed**: ${run.outlets_qa_passed}\n`;
              runContext += `- **Emails Generated**: ${run.emails_generated}\n`;
              runContext += `- **Emails Approved**: ${run.emails_approved}\n`;
              runContext += `- **Total Cost**: $${run.total_cost_usd.toFixed(4)}\n`;
              runContext += `- **Created**: ${run.created_at}\n`;

              if (run.error_log && Array.isArray(run.error_log) && run.error_log.length > 0) {
                runContext += `\n### Recent Errors\n`;
                for (const err of (run.error_log as Array<{ stage?: string; error?: string; timestamp?: string }>).slice(-5)) {
                  runContext += `- [${err.stage || 'unknown'}] ${err.error || 'unknown error'} (${err.timestamp || ''})\n`;
                }
              }

              if (run.stage_results && Object.keys(run.stage_results).length > 0) {
                runContext += `\n### Stage Results\n`;
                for (const [stage, result] of Object.entries(run.stage_results)) {
                  const text = typeof result === 'string' ? result : JSON.stringify(result);
                  const preview = text.length > 500 ? text.slice(0, 500) + '...' : text;
                  runContext += `\n#### ${stage}\n\`\`\`\n${preview}\n\`\`\`\n`;
                }
              }
            }
          } catch {
            runContext = '\n(Could not load run details)\n';
          }
        }

        if (clientId) {
          try {
            const { data: prClient } = await supabase
              .from('pr_clients')
              .select('*')
              .eq('id', clientId)
              .single() as { data: PRClient | null; error: unknown };

            if (prClient) {
              runContext += `\n## Client Context\n`;
              runContext += `- **Name**: ${prClient.name}\n`;
              if (prClient.company) runContext += `- **Company**: ${prClient.company}\n`;
              if (prClient.industry) runContext += `- **Industry**: ${prClient.industry}\n`;
              if (prClient.target_markets?.length) runContext += `- **Target Markets**: ${prClient.target_markets.join(', ')}\n`;
              if (prClient.pitch_angles?.length) {
                runContext += `\n### Pitch Angles\n`;
                for (const angle of prClient.pitch_angles) {
                  runContext += `- **${angle.angle_name}**: ${angle.description}\n`;
                }
              }
            }
          } catch {
            // Non-fatal
          }
        }

        // Also fetch recent runs summary if no specific run
        if (!runId) {
          try {
            const { data: recentRuns } = await supabase
              .from('pr_runs')
              .select('id, status, client_id, outlets_discovered, emails_generated, total_cost_usd, created_at, client:pr_clients(name)')
              .order('created_at', { ascending: false })
              .limit(10) as { data: Array<PRRun & { client: { name: string } | null }> | null; error: unknown };

            if (recentRuns && recentRuns.length > 0) {
              runContext += `\n## Recent Runs (last 10)\n`;
              for (const r of recentRuns) {
                runContext += `- ${r.client?.name || r.client_id.slice(0, 8)} | ${r.status} | ${r.outlets_discovered} outlets | ${r.emails_generated} emails | $${r.total_cost_usd.toFixed(2)} | ${new Date(r.created_at).toLocaleDateString()}\n`;
              }
            }
          } catch {
            // Non-fatal
          }
        }

        const fullSystemPrompt = runContext
          ? `${PR_SYSTEM_PROMPT}\n${runContext}`
          : PR_SYSTEM_PROMPT;

        const messages: Anthropic.MessageParam[] = [];
        if (history && history.length > 0) {
          for (const msg of history) {
            messages.push({ role: msg.role, content: msg.content });
          }
        }
        messages.push({ role: 'user', content: message });

        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: fullSystemPrompt,
          messages,
          stream: true,
        });

        for await (const event of response) {
          if (event.type === 'content_block_delta') {
            const delta = event.delta;
            if ('text' in delta) {
              emitEvent(controller, 'token', {
                type: 'token',
                content: delta.text,
                text: delta.text,
              });
            }
          }
        }

        emitEvent(controller, 'complete', { type: 'done' });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown streaming error';
        emitEvent(controller, 'error', { type: 'error', error: errorMessage });
      } finally {
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
}
