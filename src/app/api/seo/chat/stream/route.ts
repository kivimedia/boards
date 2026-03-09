import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { createAnthropicClient } from '@/lib/ai/providers';
import type { SeoPipelineRun, SeoAgentCall } from '@/lib/types';

export const maxDuration = 120;

interface SeoChatBody {
  message: string;
  runId?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

const SEO_SYSTEM_PROMPT = `You are the SEO Orchestrator Assistant for KM Boards - an AI-powered agency management platform. You help the user understand and manage the SEO content pipeline.

## Pipeline Phases
The SEO pipeline has 11 phases in order:
1. **Planning** - Topic research, outline, keyword strategy
2. **Plan Review** - Human approval of the content plan
3. **Writing** - Full article draft from the approved outline (includes [IMAGE: ...] placeholders)
4. **Image Sourcing** - Extracts image requests from writing, sends to Slack, waits for team uploads
5. **QC** - Quality check scoring (readability, SEO, accuracy)
6. **Humanizing** - Rewrite to sound natural, remove AI patterns
7. **Scoring** - Value score (uniqueness, depth, actionability)
8. **Gate 1** - Human approval checkpoint before publishing
9. **Publishing** - Push to WordPress via REST API
10. **Visual QA** - Screenshot and visual regression check
11. **Gate 2** - Final human sign-off on the published post

## Your Capabilities
- Explain what's happening at any phase of a pipeline run
- Help interpret content plans, QC scores, and agent outputs
- Suggest improvements to content, keywords, or outlines
- Advise on approve/revise/scrap decisions at gates
- Explain errors or why a run might be stuck
- Answer general SEO strategy questions
- Help refine topics, silos, and content calendars

## Guidelines
- Be concise and actionable
- When discussing a specific run, reference its topic, status, and scores
- If the user asks about something not in the provided context, say so
- Use markdown formatting for readability
- Never fabricate data about runs or scores - only reference what's in the context`;

/**
 * POST /api/seo/chat/stream
 * Stream an SEO orchestrator chat response via Server-Sent Events.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  let body: SeoChatBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { message, runId, history } = body;
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
        // 1. Get Anthropic client
        const client = await createAnthropicClient(supabase);
        if (!client) {
          emitEvent(controller, 'error', { type: 'error', error: 'Anthropic API key not configured' });
          controller.close();
          return;
        }

        // 2. Build context from run data if runId provided
        let runContext = '';
        if (runId) {
          try {
            const { data: run } = await supabase
              .from('seo_pipeline_runs')
              .select('*, team_config:seo_team_configs(id, site_name, site_url, client_id)')
              .eq('id', runId)
              .single() as { data: SeoPipelineRun & { team_config?: { id: string; site_name: string; site_url: string; client_id: string } } | null; error: unknown };

            if (run) {
              runContext += `\n## Current Run Context\n`;
              runContext += `- **Topic**: ${run.topic || 'N/A'}\n`;
              runContext += `- **Silo**: ${run.silo || 'N/A'}\n`;
              runContext += `- **Status**: ${run.status}\n`;
              runContext += `- **Current Phase**: ${run.current_phase}\n`;
              if (run.team_config) {
                runContext += `- **Site**: ${run.team_config.site_name} (${run.team_config.site_url})\n`;
              }
              runContext += `- **Total Cost**: $${(run.total_cost_usd || 0).toFixed(4)}\n`;
              if (run.qc_score != null) runContext += `- **QC Score**: ${run.qc_score}\n`;
              if (run.value_score != null) runContext += `- **Value Score**: ${run.value_score}\n`;
              if (run.visual_qa_score != null) runContext += `- **Visual QA Score**: ${run.visual_qa_score}\n`;
              if (run.gate1_decision) runContext += `- **Gate 1 Decision**: ${run.gate1_decision}${run.gate1_feedback ? ` - "${run.gate1_feedback}"` : ''}\n`;
              if (run.gate2_decision) runContext += `- **Gate 2 Decision**: ${run.gate2_decision}${run.gate2_feedback ? ` - "${run.gate2_feedback}"` : ''}\n`;
              if (run.plan_review_decision) runContext += `- **Plan Review**: ${run.plan_review_decision} (round ${run.plan_review_round})${run.plan_review_feedback ? ` - "${run.plan_review_feedback}"` : ''}\n`;
              if (run.wp_preview_url) runContext += `- **WP Preview**: ${run.wp_preview_url}\n`;
              if (run.wp_live_url) runContext += `- **WP Live**: ${run.wp_live_url}\n`;

              // Phase results summary
              const phaseResults = run.phase_results || {};
              const phaseKeys = Object.keys(phaseResults);
              if (phaseKeys.length > 0) {
                runContext += `\n### Phase Results Available\n`;
                for (const pk of phaseKeys) {
                  const pr = phaseResults[pk] as Record<string, unknown> | undefined;
                  if (pr) {
                    const text = (pr.text || pr.output || '') as string;
                    const preview = text.length > 800 ? text.slice(0, 800) + '...' : text;
                    if (preview) {
                      runContext += `\n#### ${pk}\n\`\`\`\n${preview}\n\`\`\`\n`;
                    }
                  }
                }
              }

              // Content preview
              const content = run.humanized_content || run.final_content;
              if (content) {
                const preview = content.length > 1500 ? content.slice(0, 1500) + '...(truncated)' : content;
                runContext += `\n### Article Content\n\`\`\`\n${preview}\n\`\`\`\n`;
              }

              // Error log
              if (run.error_log && run.error_log.length > 0) {
                runContext += `\n### Errors\n`;
                for (const err of run.error_log.slice(-5)) {
                  runContext += `- [${err.phase}] ${err.error} (${err.timestamp})\n`;
                }
              }
            }

            // Agent calls summary
            const { data: calls } = await supabase
              .from('seo_agent_calls')
              .select('agent_name, phase, model_used, input_tokens, output_tokens, cost_usd, duration_ms, status, error_message, iteration')
              .eq('pipeline_run_id', runId)
              .order('created_at', { ascending: true }) as { data: SeoAgentCall[] | null; error: unknown };

            if (calls && calls.length > 0) {
              runContext += `\n### Agent Calls (${calls.length} total)\n`;
              for (const c of calls) {
                runContext += `- ${c.agent_name} [${c.phase}] iter${c.iteration}: ${c.status === 'success' ? 'OK' : 'FAIL'} - ${c.input_tokens + c.output_tokens} tokens, $${c.cost_usd.toFixed(4)}${c.error_message ? ` - Error: ${c.error_message}` : ''}\n`;
              }
            }
          } catch (err) {
            // Non-fatal: proceed without run context
            runContext = '\n(Could not load run details)\n';
          }
        }

        const fullSystemPrompt = runContext
          ? `${SEO_SYSTEM_PROMPT}\n${runContext}`
          : SEO_SYSTEM_PROMPT;

        // 3. Build messages
        const messages: Anthropic.MessageParam[] = [];
        if (history && history.length > 0) {
          for (const msg of history) {
            messages.push({ role: msg.role, content: msg.content });
          }
        }
        messages.push({ role: 'user', content: message });

        // 4. Stream response
        const response = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: fullSystemPrompt,
          messages,
          stream: true,
        });

        let fullText = '';
        let inputTokens = 0;
        let outputTokens = 0;

        for await (const event of response) {
          if (event.type === 'content_block_delta') {
            const delta = event.delta;
            if ('text' in delta) {
              fullText += delta.text;
              emitEvent(controller, 'token', {
                type: 'token',
                content: delta.text,
                text: delta.text,
              });
            }
          } else if (event.type === 'message_delta') {
            if ('usage' in event && event.usage) {
              outputTokens = event.usage.output_tokens || 0;
            }
          } else if (event.type === 'message_start') {
            if (event.message?.usage) {
              inputTokens = event.message.usage.input_tokens || 0;
            }
          }
        }

        emitEvent(controller, 'complete', {
          type: 'done',
          inputTokens,
          outputTokens,
        });
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
