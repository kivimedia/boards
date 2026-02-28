import { Job } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../lib/supabase.js';
import { getAnthropicClient } from '../lib/anthropic.js';
import { updateJobProgress, markJobRunning, markJobComplete, markJobFailed } from '../lib/job-reporter.js';
import { loadSkillBySlug, listActiveSkills, topologicalSort, calculateCost } from '../shared/agent-helpers.js';

// ============================================================================
// CHAIN AGENT WORKER
// VPS port of executeSkillChain from agent-chain.ts
// Runs skills in dependency order, compressing intermediate outputs
// ============================================================================

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

export interface AgentChainJobData {
  vps_job_id: string;
  target_skill_slug: string;
  board_id?: string;
  user_id: string;
  input_prompt: string;
}

interface ChainStep {
  skill_slug: string;
  skill_name: string;
  order: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  output_summary?: string;
  cost_usd?: number;
}

/**
 * Compress a skill's output using Haiku for fast, cheap summarization.
 */
async function compressSkillOutput(
  client: Anthropic,
  output: string,
  maxTokens = 500
): Promise<string> {
  if (output.length < 1000) return output;

  try {
    const response = await client.messages.create({
      model: HAIKU_MODEL,
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

export async function processAgentChainJob(
  job: Job<AgentChainJobData>
): Promise<void> {
  const data = job.data;
  const { vps_job_id, target_skill_slug, user_id, input_prompt } = data;
  const startTime = Date.now();

  console.log(`[agent-chain] Processing job ${vps_job_id}, target: ${target_skill_slug}`);

  try {
    await markJobRunning(vps_job_id);

    // 1. Resolve chain
    const allSkills = await listActiveSkills(supabase);
    const ordered = topologicalSort(allSkills, target_skill_slug);

    if (ordered.length === 0) {
      throw new Error(`No skills found for chain target "${target_skill_slug}"`);
    }

    const chainSteps: ChainStep[] = ordered.map((skill, i) => ({
      skill_slug: skill.slug,
      skill_name: skill.name,
      order: i,
      status: 'pending',
    }));

    // Update progress with chain plan
    await updateJobProgress(vps_job_id, {
      progress_data: {
        chain_steps: chainSteps,
        total_steps: chainSteps.length,
        current_step: 0,
      },
      progress_message: `Chain resolved: ${chainSteps.length} steps`,
    });

    console.log(`[agent-chain] Chain: ${chainSteps.map(s => s.skill_slug).join(' -> ')}`);

    // 2. Execute skills in order
    const client = getAnthropicClient();
    const chainOutputs = new Map<string, string>();
    let totalCostUsd = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let finalOutput = '';

    for (let i = 0; i < ordered.length; i++) {
      const skill = ordered[i];
      chainSteps[i].status = 'running';

      await updateJobProgress(vps_job_id, {
        progress_data: {
          chain_steps: chainSteps,
          total_steps: chainSteps.length,
          current_step: i + 1,
        },
        progress_message: `Running step ${i + 1}/${chainSteps.length}: ${skill.name}`,
      });

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

      const isLastStep = i === ordered.length - 1;
      const userMessage = isLastStep
        ? `${input_prompt}${contextSection}`
        : `Generate a brief, focused output for this skill. This will be passed as context to downstream skills.\n\nUser goal: ${input_prompt}${contextSection}`;

      try {
        const response = await client.messages.create({
          model: DEFAULT_MODEL,
          max_tokens: Math.min(skill.estimated_tokens * 2, 8192),
          system: skill.system_prompt,
          messages: [{ role: 'user', content: userMessage }],
        });

        totalInputTokens += response.usage.input_tokens;
        totalOutputTokens += response.usage.output_tokens;

        let stepOutput = '';
        for (const block of response.content) {
          if (block.type === 'text') stepOutput += block.text;
        }

        const stepCost = calculateCost(DEFAULT_MODEL, response.usage.input_tokens, response.usage.output_tokens);
        totalCostUsd += stepCost;

        // Compress output for downstream skills (unless last step)
        if (!isLastStep) {
          const compressed = await compressSkillOutput(client, stepOutput);
          chainOutputs.set(skill.slug, compressed);
        } else {
          chainOutputs.set(skill.slug, stepOutput);
          finalOutput = stepOutput;
        }

        chainSteps[i].status = 'completed';
        chainSteps[i].output_summary = stepOutput.slice(0, 200);
        chainSteps[i].cost_usd = stepCost;

        console.log(`[agent-chain] Step ${i + 1}/${ordered.length} (${skill.slug}) completed, $${stepCost.toFixed(4)}`);

      } catch (err: any) {
        chainSteps[i].status = 'failed';
        console.error(`[agent-chain] Step ${i + 1} (${skill.slug}) failed:`, err.message);

        // Update progress but continue with remaining steps
        await updateJobProgress(vps_job_id, {
          progress_data: {
            chain_steps: chainSteps,
            total_steps: chainSteps.length,
            current_step: i + 1,
            error: `Step ${skill.slug} failed: ${err.message}`,
          },
          progress_message: `Step ${i + 1} failed: ${skill.name}`,
        });
      }
    }

    // 3. Complete
    const durationMs = Date.now() - startTime;

    if (!finalOutput) {
      finalOutput = chainOutputs.get(target_skill_slug) || '';
    }

    await markJobComplete(vps_job_id, {
      full_output: finalOutput,
      chain_steps: chainSteps,
      target_skill: target_skill_slug,
      total_steps: chainSteps.length,
      completed_steps: chainSteps.filter(s => s.status === 'completed').length,
      failed_steps: chainSteps.filter(s => s.status === 'failed').length,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cost_usd: totalCostUsd,
      duration_ms: durationMs,
    });

    console.log(`[agent-chain] Job ${vps_job_id} completed: ${chainSteps.filter(s => s.status === 'completed').length}/${chainSteps.length} steps, $${totalCostUsd.toFixed(4)}`);

  } catch (err: any) {
    const errorMsg = err.message ?? 'Unknown error';
    console.error(`[agent-chain] Job ${vps_job_id} failed:`, errorMsg);
    await markJobFailed(vps_job_id, errorMsg);
  }
}
