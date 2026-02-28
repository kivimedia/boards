import { Job } from 'bullmq';
import { supabase } from '../lib/supabase.js';
import { getAnthropicClient } from '../lib/anthropic.js';
import { markJobRunning, markJobPaused, markJobComplete, markJobFailed, updateJobProgress } from '../lib/job-reporter.js';
import { runPhase, PHASE_ORDER, getTeamConfig } from '../shared/seo-pipeline.js';
import { PHASE_SYSTEM_PROMPTS, PHASE_MODELS } from '../shared/seo-prompts.js';
import type { SeoPipelineRun, SeoTeamConfig } from '../shared/types.js';

// ============================================================================
// User Message Builders (contextual prompts per phase)
// ============================================================================

function buildUserMessage(phase: string, run: SeoPipelineRun): string {
  switch (phase) {
    case 'planning':
      return [
        'Create an SEO content plan and topic assignment for the next blog post.',
        '',
        'Site: orlandostagerental.com (Stages Plus)',
        `Topic: "${run.topic}"`,
        run.silo ? `Preferred silo: "${run.silo}"` : 'Pick the best silo for this topic.',
        '',
        'No Slack events are available for this post. Focus on educational/product content if no events are referenced in the topic.',
        '',
        'Provide your assignment in the YAML format specified in your instructions.',
      ].join('\n');

    case 'writing': {
      const outline = run.phase_results?.planning || '';
      return [
        'Write a blog post based on this assignment:',
        '',
        outline,
        '',
        `Topic: "${run.topic}"`,
        'Word count target: 1200-1500 words (regular post)',
        '',
        'Follow all writing rules, brand voice guidelines, and SEO requirements from your instructions.',
        'Mark protected zones around keyword placements, internal links, and factual claims.',
        'Output the complete blog post in markdown format with slug and meta_description at the top.',
      ].join('\n');
    }

    case 'qc': {
      const content = run.phase_results?.writing || run.phase_results?.humanizing || '';
      return [
        'Review this blog post draft for quality. Score it using your 5-dimension rubric (100 points total).',
        '',
        `Topic: "${run.topic}"`,
        '',
        'Draft:',
        content,
        '',
        'Provide your review in the YAML format specified in your instructions.',
      ].join('\n');
    }

    case 'humanizing': {
      const content = run.phase_results?.writing || '';
      const qcFeedback = run.phase_results?.qc || '';
      return [
        'Humanize this blog post draft. The draft has passed QC but needs the AI edges smoothed out.',
        '',
        'QC Feedback:',
        qcFeedback,
        '',
        'Draft to humanize:',
        content,
        '',
        'Follow your 5-pass humanization checklist. Respect all Protected Zones (<!-- PROTECTED --> tags).',
        'Return the humanized post with your change log as specified in your instructions.',
      ].join('\n');
    }

    case 'scoring': {
      const content = run.phase_results?.humanizing || run.phase_results?.writing || '';
      return [
        'Perform the final value scoring on this post. This is the last automated check before human approval.',
        '',
        `Topic: "${run.topic}"`,
        run.silo ? `Silo: "${run.silo}"` : '',
        '',
        'Post to score:',
        content,
        '',
        'Score using your 4-dimension rubric (100 points total).',
        'Return your assessment in the YAML format specified in your instructions.',
      ].join('\n');
    }

    case 'publishing': {
      const content = run.phase_results?.humanizing || run.phase_results?.writing || '';
      return [
        'Prepare this approved blog post for WordPress publication.',
        '',
        `Topic: "${run.topic}"`,
        'Target site: orlandostagerental.com',
        '',
        'Post content:',
        content,
        '',
        'Format the content for WordPress with:',
        '1. SEO-optimized title tag (60 chars max)',
        '2. Meta description (155 chars max)',
        '3. Article in clean HTML format',
        '4. Suggested categories and tags',
        '5. Suggested slug',
      ].join('\n');
    }

    case 'visual_qa': {
      const publishResult = run.phase_results?.publishing || '';
      return [
        'Review the published WordPress post for visual quality.',
        '',
        publishResult,
        '',
        'Score using your 5-category rubric (100 points total).',
        'Provide your review in the YAML format specified in your instructions.',
        '',
        'Note: This is a text-based review of the post structure and formatting.',
        'Evaluate HTML/block structure, heading hierarchy, and formatting quality.',
      ].join('\n');
    }

    default:
      return `Process phase "${phase}" for topic: "${run.topic}"`;
  }
}

// ============================================================================
// WordPress Draft Publishing
// ============================================================================

export interface SeoJobData {
  vps_job_id: string;
  pipeline_run_id: string;
  resume_from_phase: number;
}

interface WpPublishResult {
  success: boolean;
  post_id?: number;
  edit_url?: string;
  preview_url?: string;
  error?: string;
}

async function publishToWordPress(
  teamConfig: SeoTeamConfig,
  aiOutput: string,
  topic: string
): Promise<WpPublishResult> {
  const apiEndpoint = teamConfig.config?.wp_api_endpoint;
  const apiToken = teamConfig.config?.wp_api_token;

  if (!apiEndpoint || !apiToken) {
    console.warn('[wp] No WP API endpoint/token in team config, skipping real publish');
    return { success: false, error: 'No WordPress API credentials configured' };
  }

  // Parse the AI publishing output to extract title, content, meta description
  let title = topic;
  let content = aiOutput;
  let metaDescription = '';
  let slug = '';

  // Try to extract structured parts from AI output
  const titleMatch = aiOutput.match(/(?:title\s*(?:tag)?)\s*[:=]\s*["']?(.+?)["']?\s*$/im);
  if (titleMatch) title = titleMatch[1].trim();

  const metaMatch = aiOutput.match(/(?:meta\s*description)\s*[:=]\s*["']?(.+?)["']?\s*$/im);
  if (metaMatch) metaDescription = metaMatch[1].trim();

  // Extract HTML content block (between ```html ... ``` or after "Article:" / "Content:")
  const htmlBlockMatch = aiOutput.match(/```html\s*\n([\s\S]*?)\n```/);
  if (htmlBlockMatch) {
    content = htmlBlockMatch[1].trim();
  } else {
    // Try to find content after a heading like "Article" or "HTML"
    const contentSectionMatch = aiOutput.match(/(?:article|content|html)[:\s]*\n([\s\S]+?)(?=\n(?:suggested|categories|tags)[:\s]|\n```|$)/i);
    if (contentSectionMatch) {
      content = contentSectionMatch[1].trim();
    }
  }

  // Generate slug from title
  slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const url = `${apiEndpoint}?token=${encodeURIComponent(apiToken)}`;

  console.log(`[wp] Publishing draft: "${title}" to ${apiEndpoint}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      content,
      slug,
      meta_description: metaDescription,
      excerpt: metaDescription || title,
    }),
  });

  const result = await response.json() as WpPublishResult;

  if (!response.ok || !result.success) {
    console.error(`[wp] Publish failed:`, result.error || response.statusText);
    return { success: false, error: result.error || `HTTP ${response.status}` };
  }

  console.log(`[wp] Draft created: post_id=${result.post_id}, edit_url=${result.edit_url}`);
  return result;
}

// ============================================================================
// Main Pipeline Processor
// ============================================================================

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

      // Get full system prompt for this phase (loaded from SKILL.md files)
      const systemPrompt = PHASE_SYSTEM_PROMPTS[phase];
      if (!systemPrompt) {
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
        systemPrompt,
        userMessage: buildUserMessage(phase, runForPrompt),
        model: PHASE_MODELS[phase],
        agentName: `seo_${phase}`,
        anthropicClient: anthropic,
      });

      totalCost += result.agentResult.costUsd;
      totalTokens += result.agentResult.inputTokens + result.agentResult.outputTokens;

      // After publishing AI phase, actually publish to WordPress as draft
      if (phase === 'publishing' && teamConfig) {
        await updateJobProgress(vps_job_id, {
          progress_message: 'Publishing draft to WordPress...',
        });

        const wpResult = await publishToWordPress(
          teamConfig,
          result.agentResult.text,
          runForPrompt.topic
        );

        if (wpResult.success) {
          // Store WP post info in pipeline run artifacts
          await supabase
            .from('seo_pipeline_runs')
            .update({
              artifacts: {
                ...(runForPrompt.artifacts || {}),
                publishing: {
                  ...(runForPrompt.artifacts?.publishing || {}),
                  wp_post_id: wpResult.post_id,
                  wp_edit_url: wpResult.edit_url,
                  wp_preview_url: wpResult.preview_url,
                },
              },
              updated_at: new Date().toISOString(),
            })
            .eq('id', pipeline_run_id);

          console.log(`[seo] WordPress draft created: post ${wpResult.post_id}`);
        } else {
          console.warn(`[seo] WordPress publish failed: ${wpResult.error} - continuing pipeline`);
        }
      }

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
