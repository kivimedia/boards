import { SupabaseClient } from '@supabase/supabase-js';
import { listSkills, getSkillBySlug } from '../agent-engine';
import type { AgentSkill, SkillChainPlan, SkillChainStep, MultiTurnExecutionCallbacks } from '../types';
import { createAnthropicClient } from './providers';
import { calculateCost } from './cost-tracker';

// ============================================================================
// SKILL CHAIN ENGINE
// Resolves and executes dependency graphs between skills
// ============================================================================

/**
 * Topological sort of skill dependency graph.
 * Returns ordered list of skills to execute, with the target skill last.
 */
export function topologicalSort(
  allSkills: AgentSkill[],
  targetSlug: string
): AgentSkill[] {
  const slugMap = new Map<string, AgentSkill>();
  for (const s of allSkills) slugMap.set(s.slug, s);

  const target = slugMap.get(targetSlug);
  if (!target) throw new Error(`Target skill "${targetSlug}" not found`);

  // Collect all dependencies recursively
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const order: AgentSkill[] = [];

  function visit(slug: string) {
    if (visited.has(slug)) return;
    if (visiting.has(slug)) {
      throw new Error(`Circular dependency detected involving "${slug}"`);
    }

    visiting.add(slug);
    const skill = slugMap.get(slug);
    if (skill) {
      for (const dep of skill.depends_on ?? []) {
        if (slugMap.has(dep)) {
          visit(dep);
        }
      }
      visited.add(slug);
      visiting.delete(slug);
      order.push(skill);
    } else {
      visited.add(slug);
      visiting.delete(slug);
    }
  }

  visit(targetSlug);
  return order;
}

/**
 * Resolve the full dependency chain for a skill.
 * Returns a SkillChainPlan with ordered steps.
 */
export async function resolveSkillChain(
  supabase: SupabaseClient,
  targetSkillSlug: string
): Promise<SkillChainPlan> {
  const allSkills = await listSkills(supabase, { is_active: true });
  const ordered = topologicalSort(allSkills, targetSkillSlug);

  const chainId = crypto.randomUUID();
  const steps: SkillChainStep[] = ordered.map((skill, i) => ({
    skill_slug: skill.slug,
    skill_name: skill.name,
    order: i,
    status: 'pending',
  }));

  return {
    chain_id: chainId,
    target_skill: targetSkillSlug,
    steps,
    total_steps: steps.length,
  };
}

/**
 * Compress a skill's output for passing as context to the next skill.
 * Uses Claude Haiku for fast, cheap summarization.
 */
export async function compressSkillOutput(
  supabase: SupabaseClient,
  output: string,
  maxTokens = 500
): Promise<string> {
  if (output.length < 1000) return output; // Already short enough

  const client = await createAnthropicClient(supabase);
  if (!client) return output.slice(0, 2000); // Fallback: just truncate

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{
        role: 'user',
        content: `Summarize the following output from an AI skill. Keep the key facts, decisions, and outputs. Be concise.\n\n${output.slice(0, 8000)}`,
      }],
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as any).text)
      .join('');

    return text || output.slice(0, 2000);
  } catch {
    return output.slice(0, 2000);
  }
}

/**
 * Execute a full skill chain, running skills in dependency order.
 * Each skill receives compressed output from its dependencies as context.
 */
export async function executeSkillChain(
  supabase: SupabaseClient,
  params: {
    targetSkillSlug: string;
    boardId?: string;
    cardId?: string;
    userId: string;
    inputPrompt: string;
  },
  callbacks: MultiTurnExecutionCallbacks
): Promise<void> {
  const { targetSkillSlug, userId, inputPrompt } = params;

  // 1. Resolve chain
  const plan = await resolveSkillChain(supabase, targetSkillSlug);

  if (plan.steps.length <= 1) {
    // No dependencies, just run the target skill directly
    // The caller should handle this case by running executeAgentSkill directly
    return;
  }

  // 2. Execute skills in order
  const client = await createAnthropicClient(supabase);
  if (!client) throw new Error('Anthropic API key not configured');

  const modelId = 'claude-sonnet-4-5-20250929';
  const chainOutputs = new Map<string, string>();

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    callbacks.onChainStep?.(i, step.skill_name, 'running');

    const skill = await getSkillBySlug(supabase, step.skill_slug);
    if (!skill) {
      step.status = 'skipped';
      callbacks.onChainStep?.(i, step.skill_name, 'skipped');
      continue;
    }

    // Build context from dependencies
    const depContext: string[] = [];
    for (const dep of skill.depends_on ?? []) {
      const depOutput = chainOutputs.get(dep);
      if (depOutput) {
        depContext.push(`## Output from ${dep}:\n${depOutput}`);
      }
    }

    const contextSection = depContext.length > 0
      ? `\n\n## Context from previous skills:\n${depContext.join('\n\n')}`
      : '';

    const isLastStep = i === plan.steps.length - 1;
    const userMessage = isLastStep
      ? `${inputPrompt}${contextSection}`
      : `Generate a brief, focused output for this skill. This will be passed as context to downstream skills.\n\nUser goal: ${inputPrompt}${contextSection}`;

    try {
      let fullOutput = '';
      const stream = client.messages.stream({
        model: modelId,
        max_tokens: Math.min(skill.estimated_tokens * 2, 8192),
        system: skill.system_prompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && (event.delta as any).type === 'text_delta') {
          const text = (event.delta as any).text;
          fullOutput += text;
          if (isLastStep) callbacks.onToken(text); // Only stream the final skill's output
        }
      }

      // Compress output for downstream skills (unless this is the last step)
      if (!isLastStep) {
        const compressed = await compressSkillOutput(supabase, fullOutput);
        chainOutputs.set(step.skill_slug, compressed);
      } else {
        chainOutputs.set(step.skill_slug, fullOutput);
      }

      step.status = 'completed';
      step.output_summary = fullOutput.slice(0, 200);
      callbacks.onChainStep?.(i, step.skill_name, 'completed');
    } catch (err) {
      step.status = 'failed';
      callbacks.onChainStep?.(i, step.skill_name, 'failed');
      // Continue with remaining skills even if one fails
    }
  }

  const finalOutput = chainOutputs.get(targetSkillSlug);
  if (finalOutput) {
    callbacks.onComplete(finalOutput);
  } else {
    callbacks.onError('Chain completed but target skill produced no output');
  }
}
