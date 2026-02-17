import { SupabaseClient } from '@supabase/supabase-js';
import { createAnthropicClient } from './providers';
import { calculateCost, logUsage } from './cost-tracker';
import {
  createExecution,
  completeExecution,
  updateCardAgentTask,
  getSkill,
  getBoardAgent,
} from '../agent-engine';

// ============================================================================
// AGENT EXECUTOR — Runs a skill against a card's context
// ============================================================================

export interface ExecuteAgentParams {
  taskId: string;
  skillId: string;
  boardAgentId?: string;
  cardId: string;
  boardId: string;
  userId: string;
  inputPrompt?: string;
}

export interface ExecuteAgentCallbacks {
  onToken: (text: string) => void;
  onComplete: (output: string) => void;
  onError: (error: string) => void;
}

/**
 * Build context about a card to feed to the agent.
 */
async function buildCardContext(
  supabase: SupabaseClient,
  cardId: string
): Promise<{ contextText: string; contextJson: Record<string, unknown> }> {
  const { data: card } = await supabase
    .from('cards')
    .select('id, title, description, priority, due_date, created_at')
    .eq('id', cardId)
    .single();

  const { data: labels } = await supabase
    .from('card_labels')
    .select('label:labels(name, color)')
    .eq('card_id', cardId);

  const { data: comments } = await supabase
    .from('comments')
    .select('content, created_at, profile:profiles(display_name)')
    .eq('card_id', cardId)
    .order('created_at', { ascending: false })
    .limit(10);

  const { data: checklists } = await supabase
    .from('checklists')
    .select('title, items:checklist_items(title, is_completed)')
    .eq('card_id', cardId);

  const { data: brief } = await supabase
    .from('briefs')
    .select('content, brief_type')
    .eq('card_id', cardId)
    .limit(1)
    .maybeSingle();

  const { data: customFields } = await supabase
    .from('card_custom_field_values')
    .select('value, field:custom_fields(name, field_type)')
    .eq('card_id', cardId);

  const contextJson: Record<string, unknown> = {
    card,
    labels: labels?.map((l: any) => l.label?.name).filter(Boolean) ?? [],
    comments: comments?.map((c: any) => ({
      by: c.profile?.display_name,
      content: c.content,
      at: c.created_at,
    })) ?? [],
    checklists: checklists?.map((cl: any) => ({
      title: cl.title,
      items: cl.items?.map((i: any) => `${i.is_completed ? '[x]' : '[ ]'} ${i.title}`),
    })) ?? [],
    brief: brief?.content ?? null,
    customFields: customFields?.map((cf: any) => ({
      name: cf.field?.name,
      value: cf.value,
    })) ?? [],
  };

  const parts: string[] = [];
  parts.push(`# Card: ${card?.title ?? 'Untitled'}`);
  if (card?.description) parts.push(`\n## Description\n${card.description}`);
  if (card?.priority && card.priority !== 'none') parts.push(`\nPriority: ${card.priority}`);
  if (card?.due_date) parts.push(`Due: ${card.due_date}`);

  const labelNames = labels?.map((l: any) => l.label?.name).filter(Boolean) ?? [];
  if (labelNames.length) parts.push(`\nLabels: ${labelNames.join(', ')}`);

  if (brief?.content) parts.push(`\n## Brief\n${brief.content}`);

  if (checklists?.length) {
    for (const cl of checklists as any[]) {
      parts.push(`\n## Checklist: ${cl.title}`);
      for (const item of cl.items ?? []) {
        parts.push(`${item.is_completed ? '- [x]' : '- [ ]'} ${item.title}`);
      }
    }
  }

  if (customFields?.length) {
    parts.push('\n## Custom Fields');
    for (const cf of customFields as any[]) {
      if (cf.field?.name) parts.push(`- ${cf.field.name}: ${cf.value}`);
    }
  }

  if (comments?.length) {
    parts.push('\n## Recent Comments');
    for (const c of (comments as any[]).reverse()) {
      parts.push(`- ${c.profile?.display_name ?? 'Unknown'}: ${c.content}`);
    }
  }

  return { contextText: parts.join('\n'), contextJson };
}

/**
 * Execute an agent skill against a card, streaming the output.
 */
export async function executeAgentSkill(
  supabase: SupabaseClient,
  params: ExecuteAgentParams,
  callbacks: ExecuteAgentCallbacks
): Promise<void> {
  const startTime = Date.now();
  let executionId: string | null = null;

  try {
    // 1. Load the skill
    const skill = await getSkill(supabase, params.skillId);
    if (!skill) throw new Error('Skill not found');

    // 2. Load board agent if provided
    let boardAgent = null;
    if (params.boardAgentId) {
      boardAgent = await getBoardAgent(supabase, params.boardAgentId);
    }

    // 3. Build card context
    const { contextText, contextJson } = await buildCardContext(supabase, params.cardId);

    // 4. Build the user message
    let userMessage = contextText;
    if (params.inputPrompt) {
      userMessage += `\n\n## Additional Instructions\n${params.inputPrompt}`;
    }

    // 5. Build system prompt (skill prompt + board-level additions)
    let systemPrompt = skill.system_prompt;
    if (boardAgent?.custom_prompt_additions) {
      systemPrompt += `\n\n## Board-Specific Context\n${boardAgent.custom_prompt_additions}`;
    }

    // 6. Create execution record
    const execution = await createExecution(supabase, {
      board_agent_id: params.boardAgentId!,
      skill_id: params.skillId,
      board_id: params.boardId,
      card_id: params.cardId,
      user_id: params.userId,
      trigger_type: 'manual',
      input_message: userMessage,
      input_context: contextJson,
    });
    executionId = execution.id;

    // 7. Update task status to running
    await updateCardAgentTask(supabase, params.taskId, {
      status: 'running',
      execution_id: executionId,
    });

    // 8. Create Anthropic client
    const client = await createAnthropicClient(supabase);
    if (!client) throw new Error('Anthropic API key not configured. Go to Settings > AI Keys to add one.');

    // 9. Determine model
    const modelId = 'claude-sonnet-4-5-20250929';

    // 10. Stream the response
    let fullOutput = '';
    const stream = client.messages.stream({
      model: modelId,
      max_tokens: Math.min(skill.estimated_tokens * 2, 8192),
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && (event.delta as any).type === 'text_delta') {
        fullOutput += (event.delta as any).text;
        callbacks.onToken((event.delta as any).text);
      }
    }

    const finalMessage = await stream.finalMessage();
    const inputTokens = finalMessage.usage.input_tokens;
    const outputTokens = finalMessage.usage.output_tokens;
    const costUsd = calculateCost('anthropic', modelId, inputTokens, outputTokens);
    const durationMs = Date.now() - startTime;

    // 11. Complete execution record
    await completeExecution(supabase, executionId, {
      status: 'success',
      output_response: fullOutput,
      model_used: modelId,
      iterations_used: 1,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      duration_ms: durationMs,
    });

    // 12. Update the task with output
    const preview = fullOutput.slice(0, 500);
    await updateCardAgentTask(supabase, params.taskId, {
      status: 'completed',
      output_preview: preview,
      output_full: fullOutput,
      completed_at: new Date().toISOString(),
    });

    // 13. Log usage
    await logUsage(supabase, {
      userId: params.userId,
      boardId: params.boardId,
      cardId: params.cardId,
      activity: 'agent_execution',
      provider: 'anthropic',
      modelId,
      inputTokens,
      outputTokens,
      latencyMs: durationMs,
      status: 'success',
      metadata: { skill_slug: skill.slug, task_id: params.taskId },
    });

    callbacks.onComplete(fullOutput);
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err.message ?? 'Unknown error';

    if (executionId) {
      await completeExecution(supabase, executionId, {
        status: 'failed',
        error_message: errorMsg,
        duration_ms: durationMs,
      }).catch(() => {});
    }

    await updateCardAgentTask(supabase, params.taskId, {
      status: 'failed',
    }).catch(() => {});

    callbacks.onError(errorMsg);
  }
}
