import { Job } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../lib/supabase.js';
import { getAnthropicClient } from '../lib/anthropic.js';
import { updateJobProgress, markJobRunning, markJobComplete, markJobFailed, markJobPaused } from '../lib/job-reporter.js';
import { loadSkillBySlug, calculateCost } from '../shared/agent-helpers.js';

// ============================================================================
// GENERIC TEAM WORKER
// Reads phase definitions from agent_team_templates and executes them
// Reuses the runPhase pattern from seo-pipeline.ts but is template-driven
// ============================================================================

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

export interface AgentTeamJobData {
  vps_job_id: string;
  team_run_id: string;
  resume_from_phase?: number;
}

interface TemplatePhase {
  name: string;
  skill_slug: string | null;
  model: string | null;
  is_gate: boolean;
  gate_type?: string;
  gate_label?: string;
  config?: Record<string, unknown>;
}

export async function processAgentTeamJob(
  job: Job<AgentTeamJobData>
): Promise<void> {
  const { vps_job_id, team_run_id, resume_from_phase } = job.data;
  const startTime = Date.now();

  console.log(`[agent-team] Processing job ${vps_job_id}, run ${team_run_id}`);

  try {
    await markJobRunning(vps_job_id);

    // 1. Load the team run and template
    const { data: teamRun, error: runErr } = await supabase
      .from('agent_team_runs')
      .select('*, template:agent_team_templates(*)')
      .eq('id', team_run_id)
      .single();

    if (runErr || !teamRun) {
      throw new Error(`Team run ${team_run_id} not found: ${runErr?.message}`);
    }

    const template = teamRun.template;
    if (!template) throw new Error('Template not found for team run');

    const phases: TemplatePhase[] = template.phases as TemplatePhase[];
    if (!phases?.length) throw new Error('Template has no phases defined');

    // Load site config if present (for WP credentials, site URL, etc.)
    let siteConfig: Record<string, unknown> | null = null;
    if (teamRun.site_config_id) {
      const { data: cfg } = await supabase
        .from('seo_team_configs')
        .select('*')
        .eq('id', teamRun.site_config_id)
        .single();
      if (cfg) {
        siteConfig = cfg;
        console.log(`[agent-team] Loaded site config: ${cfg.site_name} (${cfg.site_url})`);
      }
    }

    const startPhase = resume_from_phase ?? 0;
    const client = getAnthropicClient();
    const phaseResults = { ...(teamRun.phase_results as Record<string, unknown>) };
    const artifacts = { ...(teamRun.artifacts as Record<string, unknown>) };
    let totalCost = teamRun.total_cost_usd || 0;

    // 2. Execute phases
    for (let i = startPhase; i < phases.length; i++) {
      const phase = phases[i];

      // Update run status
      await supabase
        .from('agent_team_runs')
        .update({
          current_phase: i,
          status: phase.is_gate ? `awaiting_${phase.name}` : phase.name,
          updated_at: new Date().toISOString(),
        })
        .eq('id', team_run_id);

      await updateJobProgress(vps_job_id, {
        progress_message: `Phase ${i + 1}/${phases.length}: ${phase.name}`,
        progress_data: {
          current_phase: i,
          total_phases: phases.length,
          phase_name: phase.name,
          phase_results: phaseResults,
        },
      });

      console.log(`[agent-team] Phase ${i + 1}/${phases.length}: ${phase.name} (gate: ${phase.is_gate})`);

      // Gate phase - pause and wait for decision
      if (phase.is_gate) {
        await markJobPaused(vps_job_id, `Awaiting ${phase.gate_label || phase.name} approval`);

        await supabase
          .from('agent_team_runs')
          .update({
            status: `awaiting_${phase.name}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', team_run_id);

        console.log(`[agent-team] Paused at gate: ${phase.name}`);
        return; // Will be resumed by gate watcher
      }

      // Skill phase - load skill and run
      if (!phase.skill_slug) {
        console.warn(`[agent-team] Phase ${phase.name} has no skill_slug, skipping`);
        phaseResults[phase.name] = { skipped: true };
        continue;
      }

      const skill = await loadSkillBySlug(supabase, phase.skill_slug);
      if (!skill) {
        console.warn(`[agent-team] Skill ${phase.skill_slug} not found, skipping phase ${phase.name}`);
        phaseResults[phase.name] = { skipped: true, reason: 'Skill not found' };
        continue;
      }

      // Build prompt context from input_data + previous phase results
      const inputData = teamRun.input_data as Record<string, unknown>;
      const contextParts: string[] = [];

      if (inputData) {
        contextParts.push(`## Input Data\n${JSON.stringify(inputData, null, 2)}`);
      }

      // Include site config for phases that need it (publishing, etc.)
      if (siteConfig) {
        const siteInfo: Record<string, unknown> = {
          site_name: siteConfig.site_name,
          site_url: siteConfig.site_url,
        };
        // Only include credentials for publishing-related phases
        if (phase.name.includes('publish') || phase.skill_slug?.includes('publisher')) {
          siteInfo.wp_credentials = siteConfig.wp_credentials;
          siteInfo.wp_api_endpoint = (siteConfig.config as Record<string, unknown>)?.wp_api_endpoint;
        }
        contextParts.push(`## Target Site\n${JSON.stringify(siteInfo, null, 2)}`);
      }

      // Include relevant previous phase outputs
      for (const [phaseName, result] of Object.entries(phaseResults)) {
        const r = result as Record<string, unknown>;
        if (r.output) {
          contextParts.push(`## Output from ${phaseName}\n${String(r.output).slice(0, 4000)}`);
        }
      }

      // Include artifacts
      if (Object.keys(artifacts).length > 0) {
        contextParts.push(`## Current Artifacts\n${JSON.stringify(artifacts, null, 2)}`);
      }

      const userMessage = contextParts.join('\n\n');
      const model = phase.model || template.default_config?.default_model || DEFAULT_MODEL;

      try {
        const response = await client.messages.create({
          model,
          max_tokens: Math.min(skill.estimated_tokens * 2, 8192),
          system: skill.system_prompt,
          messages: [{ role: 'user', content: userMessage }],
        });

        let output = '';
        for (const block of response.content) {
          if (block.type === 'text') output += block.text;
        }

        const phaseCost = calculateCost(model, response.usage.input_tokens, response.usage.output_tokens);
        totalCost += phaseCost;

        phaseResults[phase.name] = {
          output,
          cost_usd: phaseCost,
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          model,
          duration_ms: Date.now() - startTime,
        };

        // Try to extract artifacts from the output (JSON blocks)
        try {
          const artifactMatch = output.match(/```json\n([\s\S]*?)\n```/);
          if (artifactMatch) {
            const parsed = JSON.parse(artifactMatch[1]);
            Object.assign(artifacts, parsed);
          }
        } catch {
          // Not all outputs have JSON artifacts
        }

        // Save progress
        await supabase
          .from('agent_team_runs')
          .update({
            phase_results: phaseResults,
            artifacts,
            total_cost_usd: totalCost,
            updated_at: new Date().toISOString(),
          })
          .eq('id', team_run_id);

        console.log(`[agent-team] Phase ${phase.name} complete, $${phaseCost.toFixed(4)}`);

      } catch (err: any) {
        phaseResults[phase.name] = { error: err.message };

        await supabase
          .from('agent_team_runs')
          .update({
            phase_results: phaseResults,
            error_message: `Phase ${phase.name} failed: ${err.message}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', team_run_id);

        console.error(`[agent-team] Phase ${phase.name} failed:`, err.message);
        // Continue to next phase instead of failing the whole run
      }
    }

    // 3. Complete
    const durationMs = Date.now() - startTime;

    await supabase
      .from('agent_team_runs')
      .update({
        status: 'completed',
        total_cost_usd: totalCost,
        phase_results: phaseResults,
        artifacts,
        updated_at: new Date().toISOString(),
      })
      .eq('id', team_run_id);

    await markJobComplete(vps_job_id, {
      team_run_id,
      template_slug: template.slug,
      total_phases: phases.length,
      total_cost_usd: totalCost,
      duration_ms: durationMs,
      artifacts,
    });

    console.log(`[agent-team] Run ${team_run_id} completed, $${totalCost.toFixed(4)}, ${durationMs}ms`);

  } catch (err: any) {
    const errorMsg = err.message ?? 'Unknown error';
    console.error(`[agent-team] Job ${vps_job_id} failed:`, errorMsg);

    await supabase
      .from('agent_team_runs')
      .update({ status: 'failed', error_message: errorMsg, updated_at: new Date().toISOString() })
      .eq('id', team_run_id);

    await markJobFailed(vps_job_id, errorMsg);
  }
}
