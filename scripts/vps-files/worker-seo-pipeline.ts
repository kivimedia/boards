import { Job } from 'bullmq';
import { supabase } from '../lib/supabase.js';
import { getAnthropicClient } from '../lib/anthropic.js';
import { markJobRunning, markJobPaused, markJobComplete, markJobFailed, updateJobProgress } from '../lib/job-reporter.js';
import { runPhase, PHASE_ORDER, getTeamConfig } from '../shared/seo-pipeline.js';
import type { SeoPipelineRun } from '../shared/types.js';

// Default prompts per phase (used when agent_skills table prompts are not available)
const PHASE_PROMPTS: Record<string, { system: string; buildUser: (run: SeoPipelineRun) => string }> = {
  planning: {
    system: 'You are an expert SEO strategist. Create a detailed content outline with keyword strategy, target audience analysis, and structured sections. Output as structured markdown.',
    buildUser: (run) => `Create a detailed SEO content plan for the topic: "${run.topic}"${run.silo ? ` in the content silo: "${run.silo}"` : ''}. Include target keywords, search intent, article structure with H2/H3 headings, and key points for each section.`,
  },
  writing: {
    system: 'You are an expert SEO content writer. Write high-quality, comprehensive blog articles that rank well in search engines while providing genuine value to readers.',
    buildUser: (run) => {
      const outline = run.phase_results?.planning || '';
      return `Write a complete, well-structured blog article based on this outline:\n\n${outline}\n\nTopic: "${run.topic}"\nRequirements: 1500-2500 words, natural tone, include target keywords organically, use proper heading hierarchy.`;
    },
  },
  qc: {
    system: 'You are a content quality analyst. Score content on readability, SEO optimization, accuracy, and engagement. Return a JSON object with scores and feedback.',
    buildUser: (run) => {
      const content = run.phase_results?.writing || '';
      return `Analyze this article for quality. Score each category 0-100 and provide specific feedback.\n\nArticle:\n${content}\n\nReturn JSON: {"qc_score": <overall 0-100>, "readability": <score>, "seo_optimization": <score>, "accuracy": <score>, "feedback": "<specific improvements>"}`;
    },
  },
  humanizing: {
    system: 'You are an expert editor who makes AI-written content sound natural and human. Remove repetitive patterns, vary sentence structure, add personality, and ensure the content reads like it was written by an experienced writer.',
    buildUser: (run) => {
      const content = run.phase_results?.writing || '';
      const qcFeedback = run.phase_results?.qc || '';
      return `Rewrite this article to sound more natural and human. Apply this QC feedback where applicable:\n\nQC Feedback:\n${qcFeedback}\n\nOriginal Article:\n${content}\n\nMake it engaging, varied in tone, and remove any AI-sounding patterns.`;
    },
  },
  scoring: {
    system: 'You are a content value assessor. Evaluate content uniqueness, depth, actionability, and overall value compared to existing content on similar topics. Return a JSON score.',
    buildUser: (run) => {
      const content = run.phase_results?.humanizing || run.phase_results?.writing || '';
      return `Score this article on value and uniqueness. Consider: Does it provide insights not found elsewhere? Is it actionable? Would a reader bookmark it?\n\nArticle:\n${content}\n\nReturn JSON: {"value_score": <0-100>, "uniqueness": <score>, "depth": <score>, "actionability": <score>, "assessment": "<brief assessment>"}`;
    },
  },
  publishing: {
    system: 'You are a WordPress publishing assistant. Format content for WordPress publication with proper HTML, meta descriptions, and SEO tags.',
    buildUser: (run) => {
      const content = run.phase_results?.humanizing || run.phase_results?.writing || '';
      return `Prepare this article for WordPress publication. Output:\n1. SEO-optimized title tag (60 chars max)\n2. Meta description (155 chars max)\n3. Article in clean HTML format\n4. Suggested categories and tags\n\nArticle:\n${content}`;
    },
  },
  visual_qa: {
    system: 'You are a visual QA reviewer. Analyze the published page for visual issues, broken formatting, and brand consistency.',
    buildUser: (run) => {
      const publishResult = run.phase_results?.publishing || '';
      return `Review the published content for visual quality:\n\n${publishResult}\n\nCheck for: formatting issues, heading hierarchy, image placement, readability, mobile-friendliness concerns. Return JSON: {"visual_qa_score": <0-100>, "issues": [], "recommendations": []}`;
    },
  },
};

export interface SeoJobData {
  vps_job_id: string;
  pipeline_run_id: string;
  resume_from_phase: number;
}

export async function processSeoJob(job: Job<SeoJobData>): Promise<{ paused_at?: string; completed?: boolean }> {
  const { vps_job_id, pipeline_run_id, resume_from_phase } = job.data;

  console.log(`[seo] Processing job ${vps_job_id}, run ${pipeline_run_id}, from phase ${resume_from_phase}`);

  try {
    await markJobRunning(vps_job_id);

    // Fetch the pipeline run
    const { data: run, error: runErr } = await supabase
      .from('seo_pipeline_runs')
      .select('*')
      .eq('id', pipeline_run_id)
      .single();

    if (runErr || !run) {
      throw new Error(`Pipeline run not found: ${pipeline_run_id}`);
    }

    // Fetch team config
    const teamConfig = run.team_config_id
      ? await getTeamConfig(supabase, run.team_config_id)
      : null;

    const anthropic = getAnthropicClient();
    const startPhase = resume_from_phase || 0;
    let totalCost = 0;
    let totalTokens = 0;

    for (let i = startPhase; i < PHASE_ORDER.length; i++) {
      const phase = PHASE_ORDER[i];

      // Gate phases - pause and exit
      if (phase === 'gate1' || phase === 'gate2') {
        const gateNum = phase === 'gate1' ? '1' : '2';
        await markJobPaused(vps_job_id, `Waiting for gate ${gateNum} approval`);
        await updateJobProgress(vps_job_id, {
          current_step: i,
          total_steps: PHASE_ORDER.length,
          progress_message: `Paused at ${phase} - awaiting human approval`,
        });
        console.log(`[seo] Job ${vps_job_id} paused at ${phase}`);
        return { paused_at: phase };
      }

      // Report progress
      await updateJobProgress(vps_job_id, {
        current_step: i,
        total_steps: PHASE_ORDER.length,
        progress_message: `Running phase: ${phase}`,
      });

      console.log(`[seo] Running phase ${phase} for run ${pipeline_run_id}`);

      // Build phase config
      const phasePrompt = PHASE_PROMPTS[phase];
      if (!phasePrompt) {
        console.warn(`[seo] No prompt config for phase ${phase}, skipping`);
        continue;
      }

      // Re-fetch run to get latest phase_results
      const { data: currentRun } = await supabase
        .from('seo_pipeline_runs')
        .select('*')
        .eq('id', pipeline_run_id)
        .single();

      const runForPrompt = (currentRun || run) as SeoPipelineRun;

      const result = await runPhase(supabase, pipeline_run_id, phase, {
        systemPrompt: phasePrompt.system,
        userMessage: phasePrompt.buildUser(runForPrompt),
        agentName: `seo_${phase}`,
        anthropicClient: anthropic,
      });

      totalCost += result.agentResult.costUsd;
      totalTokens += result.agentResult.inputTokens + result.agentResult.outputTokens;

      await updateJobProgress(vps_job_id, {
        cost_usd: totalCost,
        tokens_used: totalTokens,
        progress_message: `Completed phase: ${phase}`,
      });

      console.log(`[seo] Phase ${phase} complete. Cost: $${result.agentResult.costUsd.toFixed(4)}`);
    }

    // All phases complete
    await markJobComplete(vps_job_id, {
      run_id: pipeline_run_id,
      total_cost: totalCost,
      total_tokens: totalTokens,
    });

    console.log(`[seo] Job ${vps_job_id} completed. Total cost: $${totalCost.toFixed(4)}`);
    return { completed: true };

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[seo] Job ${vps_job_id} failed:`, errorMessage);
    await markJobFailed(vps_job_id, errorMessage);
    throw err;
  }
}
