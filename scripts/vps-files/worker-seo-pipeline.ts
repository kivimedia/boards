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

interface BuildMessageOpts {
  feedback?: string;
  referenceImageUrls?: string[];
  previousPlan?: string;
  teamConfig?: SeoTeamConfig | null;
  sitemapUrls?: string[];
}

function buildUserMessage(phase: string, run: SeoPipelineRun, opts?: BuildMessageOpts): string {
  switch (phase) {
    case 'planning': {
      const siteName = opts?.teamConfig?.site_name || 'the target site';
      const siteUrl = opts?.teamConfig?.site_url || '';
      const parts = [
        'Create an SEO content plan and topic assignment for the next blog post.',
        '',
        `Site: ${siteUrl ? siteUrl.replace(/^https?:\/\//, '') : 'unknown'}${siteName ? ` (${siteName})` : ''}`,
        `Topic: "${run.topic}"`,
        run.silo ? `Preferred silo: "${run.silo}"` : 'Pick the best silo for this topic.',
        '',
        'No Slack events are available for this post. Focus on educational/product content if no events are referenced in the topic.',
      ];

      // Include actual site URLs for internal linking
      if (opts?.sitemapUrls && opts.sitemapUrls.length > 0) {
        parts.push('', '--- EXISTING SITE PAGES (use these for internal links) ---');
        parts.push('IMPORTANT: Only use URLs from this list for internal links. Do not invent URLs.');
        for (const url of opts.sitemapUrls) {
          parts.push(`- ${url}`);
        }
      }

      // Include feedback from previous review round
      if (opts?.previousPlan) {
        parts.push('', '--- PREVIOUS PLAN (needs revision) ---', opts.previousPlan);
      }
      if (opts?.feedback) {
        parts.push('', '--- REVIEWER FEEDBACK (address all points) ---', opts.feedback);
      }
      if (opts?.referenceImageUrls?.length) {
        parts.push('', '--- REFERENCE IMAGES ---');
        parts.push('The reviewer attached reference images. Incorporate visual direction from these in your plan.');
        opts.referenceImageUrls.forEach((url, i) => parts.push(`Image ${i + 1}: ${url}`));
      }

      parts.push('', 'Provide your assignment in the YAML format specified in your instructions.');
      return parts.join('\n');
    }

    case 'writing': {
      const outline = run.phase_results?.planning || '';
      const siteUrl = opts?.teamConfig?.site_url || '';
      const writeParts = [
        'Write a blog post based on this assignment:',
        '',
        outline,
        '',
        `Topic: "${run.topic}"`,
        siteUrl ? `Site: ${siteUrl.replace(/^https?:\/\//, '')}` : '',
        'Word count target: 1200-1500 words (regular post)',
        '',
        'Follow all writing rules, brand voice guidelines, and SEO requirements from your instructions.',
        'IMPORTANT: Never use em dashes (—) or en dashes (–) anywhere in the output. Use commas, periods, or rewrite the sentence instead.',
        'Mark protected zones around keyword placements, internal links, and factual claims.',
        'Output the complete blog post in markdown format with slug and meta_description at the top.',
      ];
      if (opts?.sitemapUrls && opts.sitemapUrls.length > 0) {
        writeParts.push('', '--- EXISTING SITE PAGES (use only these for internal links) ---');
        for (const url of opts.sitemapUrls) {
          writeParts.push(`- ${url}`);
        }
      }
      return writeParts.filter(Boolean).join('\n');
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
        'IMPORTANT: Never use em dashes (—) or en dashes (–) anywhere in the output. Replace any existing ones with commas, periods, or rewrite the sentence.',
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
        `Target site: ${opts?.teamConfig?.site_url?.replace(/^https?:\/\//, '') || 'WordPress'}`,
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
// Sitemap Fetcher — get existing URLs for internal linking
// ============================================================================

async function fetchSitemapUrls(siteUrl: string): Promise<string[]> {
  const base = siteUrl.replace(/\/$/, '');
  const urls: string[] = [];

  try {
    // Try common sitemap locations
    const sitemapUrls = [
      `${base}/sitemap.xml`,
      `${base}/sitemap_index.xml`,
      `${base}/wp-sitemap.xml`,
    ];

    let sitemapXml = '';
    for (const url of sitemapUrls) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          sitemapXml = await res.text();
          break;
        }
      } catch { continue; }
    }

    if (!sitemapXml) return [];

    // Check if this is a sitemap index (contains other sitemaps)
    const subSitemapMatches = sitemapXml.match(/<loc>(https?:\/\/[^<]+sitemap[^<]*\.xml[^<]*)<\/loc>/gi);
    if (subSitemapMatches && subSitemapMatches.length > 0) {
      // Fetch the first post sitemap (usually contains blog posts)
      for (const match of subSitemapMatches) {
        const subUrl = match.replace(/<\/?loc>/gi, '');
        if (subUrl.includes('post') || subUrl.includes('page') || subSitemapMatches.length <= 3) {
          try {
            const subRes = await fetch(subUrl, { signal: AbortSignal.timeout(10000) });
            if (subRes.ok) {
              const subXml = await subRes.text();
              const locMatches = subXml.match(/<loc>(https?:\/\/[^<]+)<\/loc>/gi) || [];
              for (const loc of locMatches) {
                urls.push(loc.replace(/<\/?loc>/gi, ''));
              }
            }
          } catch { continue; }
        }
        if (urls.length >= 200) break;
      }
    } else {
      // Direct sitemap with URLs
      const locMatches = sitemapXml.match(/<loc>(https?:\/\/[^<]+)<\/loc>/gi) || [];
      for (const loc of locMatches) {
        urls.push(loc.replace(/<\/?loc>/gi, ''));
      }
    }

    console.log(`[seo] Fetched ${urls.length} URLs from sitemap for ${base}`);
    return urls.slice(0, 200); // Cap at 200 to avoid prompt bloat
  } catch (err) {
    console.warn(`[seo] Failed to fetch sitemap for ${base}:`, err);
    return [];
  }
}

// ============================================================================
// WordPress Draft Publishing
// ============================================================================

export interface SeoJobData {
  vps_job_id: string;
  pipeline_run_id: string;
  resume_from_phase: number;
  feedback?: string;
  reference_image_urls?: string[];
  regenerate?: boolean;
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
  const { vps_job_id, pipeline_run_id, resume_from_phase, feedback, reference_image_urls, regenerate } = job.data;

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

    // Fetch sitemap URLs for internal linking
    const sitemapUrls = teamConfig?.site_url
      ? await fetchSitemapUrls(teamConfig.site_url)
      : [];

    const anthropic = getAnthropicClient();
    const startPhase = resume_from_phase || 0;
    let totalCost = 0;
    let totalTokens = 0;

    for (let i = startPhase; i < PHASE_ORDER.length; i++) {
      const phase = PHASE_ORDER[i];

      // Gate phases - pause and exit
      if (phase === 'gate1' || phase === 'gate2' || phase === 'plan_review') {
        const gateLabel = phase === 'plan_review' ? 'plan review' : phase === 'gate1' ? 'gate 1' : 'gate 2';
        await markJobPaused(vps_job_id, `Waiting for ${gateLabel} approval`);
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

      // Build message opts - always include team config and sitemap URLs
      const messageOpts: BuildMessageOpts = {
        teamConfig,
        sitemapUrls,
      };

      // Inject feedback for planning regeneration
      if (phase === 'planning' && regenerate && feedback) {
        messageOpts.feedback = feedback;
        messageOpts.referenceImageUrls = reference_image_urls;
        messageOpts.previousPlan = runForPrompt.phase_results?.planning ? String(runForPrompt.phase_results.planning) : undefined;
      }

      const result = await runPhase(supabase, pipeline_run_id, phase, {
        systemPrompt,
        userMessage: buildUserMessage(phase, runForPrompt, messageOpts),
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
