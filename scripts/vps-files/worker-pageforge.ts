import { Job } from 'bullmq';
import { supabase } from '../lib/supabase.js';
import { getAnthropicClient } from '../lib/anthropic.js';
import { updateJobProgress } from '../lib/job-reporter.js';
import {
  PAGEFORGE_PHASE_ORDER, GATE_PHASES,
  callPageForgeAgent, startPhaseRecord, completePhaseRecord, failPhaseRecord,
  updateBuildArtifacts, appendBuildError, getSystemPrompt, postBuildMessage,
} from '../shared/pageforge-pipeline.js';
import {
  createWpClient, wpTestConnection, wpCreatePage, wpUpdatePage,
  wpUploadMedia, wpIsPluginActive, wpUpdateYoast,
} from '../lib/wordpress-client.js';
import {
  createFigmaClient, figmaGetFile, figmaGetFileNodes, figmaGetImages,
  figmaDownloadImage, figmaExtractSections, figmaExtractColors,
  figmaExtractTypography, figmaTestConnection,
  type FigmaNode, type FigmaSection, type FigmaDesignTokens,
} from '../lib/figma-client.js';
import type { PageForgeSiteProfile, PageForgeBuild } from '../shared/types.js';
import { decryptFromHex } from '../lib/encryption.js';
import Anthropic from '@anthropic-ai/sdk';
import puppeteer from 'puppeteer';
import sharp from 'sharp';

// ============================================================================
// PAGEFORGE VPS WORKER
// Processes builds through the 15-phase pipeline with REAL agent logic.
// Each phase calls actual APIs (Figma, WordPress, Browserless) and AI.
// ============================================================================

// Per-phase auto-retry config: how many times to retry before giving up
const PHASE_MAX_RETRIES: Record<string, number> = {
  preflight: 1,
  auto_name: 2,
  figma_analysis: 2,
  section_classification: 2,
  markup_generation: 2,
  markup_validation: 1,
  deploy_draft: 2,
  image_optimization: 3, // most flaky due to Figma API timeouts
  vqa_capture: 2,
  vqa_comparison: 2,
  vqa_fix_loop: 1,
  functional_qa: 2,
  seo_config: 2,
  report_generation: 1,
  developer_review_gate: 0, // gates never retry
  am_signoff_gate: 0,
};

// Base delay in ms between retries (doubles each attempt)
const RETRY_BASE_DELAY_MS = 3000;

export interface PageForgeJobData {
  vps_job_id: string;
  build_id: string;
  site_profile_id?: string;
  resume_from_phase?: number;
  revision_feedback?: string;
}

export async function processPageForgeJob(job: Job<PageForgeJobData>): Promise<void> {
  const { vps_job_id, build_id, resume_from_phase } = job.data;
  const startPhaseIdx = resume_from_phase ?? 0;

  console.log(`[pageforge] Starting build ${build_id} from phase ${startPhaseIdx}`);

  await updateJobProgress(vps_job_id, {
    status: 'running',
    started_at: new Date().toISOString(),
    progress_message: 'PageForge build starting...',
  });

  await postBuildMessage(supabase, build_id,
    startPhaseIdx > 0
      ? `Resuming build from phase ${startPhaseIdx + 1}/${PAGEFORGE_PHASE_ORDER.length}`
      : 'Build started. Running through all phases...',
    undefined, 'system');

  // Fetch build + site profile
  const { data: build, error: buildError } = await supabase
    .from('pageforge_builds')
    .select('*, site_profile:pageforge_site_profiles(*)')
    .eq('id', build_id)
    .single();

  if (buildError || !build) {
    await updateJobProgress(vps_job_id, {
      status: 'failed', completed_at: new Date().toISOString(),
      progress_message: `Build not found: ${build_id}`,
    });
    return;
  }

  const siteProfile = build.site_profile as PageForgeSiteProfile;

  // Decrypt credentials - prefer _encrypted columns, fall back to plaintext (pre-migration data)
  const sp = siteProfile as Record<string, unknown>;
  if (sp.wp_app_password_encrypted) {
    siteProfile.wp_app_password = decryptFromHex(sp.wp_app_password_encrypted as string);
  }
  if (sp.figma_personal_token_encrypted) {
    siteProfile.figma_personal_token = decryptFromHex(sp.figma_personal_token_encrypted as string);
  }
  if (sp.wp_ssh_key_path_encrypted) {
    siteProfile.wp_ssh_key_path = decryptFromHex(sp.wp_ssh_key_path_encrypted as string);
  }

  const anthropic = getAnthropicClient();

  // Copy page_builder from site profile if build doesn't have one (or has default 'gutenberg')
  if (siteProfile.page_builder && siteProfile.page_builder !== 'gutenberg' && build.page_builder === 'gutenberg') {
    build.page_builder = siteProfile.page_builder;
    await supabase.from('pageforge_builds').update({ page_builder: siteProfile.page_builder }).eq('id', build_id);
    console.log(`[pageforge] Set page_builder to '${siteProfile.page_builder}' from site profile`);
  }

  // Prevent wasteful re-processing: if build was already scored and we're starting from 0,
  // resume from the VQA fix loop instead of regenerating everything from scratch
  let effectiveStartIdx = startPhaseIdx;
  if (startPhaseIdx === 0 && build.vqa_fix_iteration > 0 && build.vqa_score_desktop > 0) {
    const vqaFixIdx = PAGEFORGE_PHASE_ORDER.indexOf('vqa_fix_loop');
    if (vqaFixIdx > 0) {
      console.log(`[pageforge] Build already has VQA scores (D=${build.vqa_score_desktop}%, iter=${build.vqa_fix_iteration}) - resuming from VQA fix loop instead of restarting`);
      effectiveStartIdx = vqaFixIdx;
    }
  }

  // Track per-phase retry attempts
  const phaseRetryCount: Record<string, number> = {};

  // Process phases sequentially
  for (let i = effectiveStartIdx; i < PAGEFORGE_PHASE_ORDER.length; i++) {
    const phase = PAGEFORGE_PHASE_ORDER[i];
    console.log(`[pageforge] Phase ${i + 1}/${PAGEFORGE_PHASE_ORDER.length}: ${phase}`);

    await updateJobProgress(vps_job_id, {
      progress_message: `Phase: ${phase} (${i + 1}/${PAGEFORGE_PHASE_ORDER.length})`,
      progress_pct: Math.round((i / PAGEFORGE_PHASE_ORDER.length) * 100),
    });

    // Gate phases - pause and wait for human decision
    if (GATE_PHASES.has(phase)) {
      await supabase.from('pageforge_builds').update({
        status: phase, current_phase: i, updated_at: new Date().toISOString(),
      }).eq('id', build_id);

      await updateJobProgress(vps_job_id, {
        status: 'waiting',
        progress_message: `Waiting for ${phase.replace(/_/g, ' ')}`,
      });

      const gateName = phase === 'developer_review_gate' ? 'Developer Review' : 'AM Sign-off';
      await postBuildMessage(supabase, build_id,
        `Waiting for ${gateName}. Please review the build results and approve, revise, or cancel.`,
        phase);

      console.log(`[pageforge] Paused at ${phase}, waiting for human decision`);
      return; // Gate watcher will re-enqueue
    }

    // Post phase start message
    const phaseLabel = phase.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    await postBuildMessage(supabase, build_id,
      `Starting phase ${i + 1}/${PAGEFORGE_PHASE_ORDER.length}: ${phaseLabel}`,
      phase);

    // Execute phase
    const phaseStart = Date.now();
    const phaseRecordId = await startPhaseRecord(supabase, build_id, phase);

    try {
      // Re-fetch build to get latest artifacts from prior phases
      const { data: currentBuild } = await supabase
        .from('pageforge_builds')
        .select('*')
        .eq('id', build_id)
        .single();

      await executePhase(build_id, phase, siteProfile, currentBuild as PageForgeBuild, anthropic);
      await completePhaseRecord(supabase, phaseRecordId, { success: true }, Date.now() - phaseStart);

      await updateJobProgress(vps_job_id, {
        progress_message: `Completed: ${phase}`,
      });

      // Update board sub-task if mapped
      try {
        const { data: buildForSubtask } = await supabase
          .from('pageforge_builds')
          .select('artifacts')
          .eq('id', build_id)
          .single();
        const subtaskMap = (buildForSubtask?.artifacts as any)?.board_subtask_map;
        if (subtaskMap && subtaskMap[phase]) {
          const cardId = subtaskMap[phase];
          const { data: card } = await supabase
            .from('cards')
            .select('description')
            .eq('id', cardId)
            .single();
          if (card) {
            await supabase
              .from('cards')
              .update({
                description: (card.description || '') + '\n\nCompleted at ' + new Date().toISOString(),
              })
              .eq('id', cardId);
          }
        }
      } catch (e) {
        // Non-fatal - don't fail the build over board updates
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const maxRetries = PHASE_MAX_RETRIES[phase] ?? 1;

      // Track retry attempts
      if (!phaseRetryCount[phase]) phaseRetryCount[phase] = 0;
      phaseRetryCount[phase]++;
      const attempt = phaseRetryCount[phase];

      if (attempt <= maxRetries) {
        // Auto-retry: log the failure, wait with exponential backoff, then retry
        const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(`[pageforge] Phase ${phase} failed (attempt ${attempt}/${maxRetries + 1}), retrying in ${delayMs}ms: ${errorMsg}`);

        await failPhaseRecord(supabase, phaseRecordId, errorMsg, Date.now() - phaseStart);
        await appendBuildError(supabase, build_id, phase, `[Attempt ${attempt}/${maxRetries + 1}] ${errorMsg}`);

        await postBuildMessage(supabase, build_id,
          `Phase "${phase}" failed (attempt ${attempt}/${maxRetries + 1}): ${errorMsg}\nRetrying in ${Math.round(delayMs / 1000)}s...`,
          phase, 'system');

        await new Promise(resolve => setTimeout(resolve, delayMs));

        // Retry: decrement i so the for-loop re-runs this phase
        i--;
        continue;
      }

      // All retries exhausted - mark as failed
      console.error(`[pageforge] Phase ${phase} failed after ${attempt} attempts:`, errorMsg);

      await failPhaseRecord(supabase, phaseRecordId, errorMsg, Date.now() - phaseStart);
      await appendBuildError(supabase, build_id, phase, errorMsg);

      await postBuildMessage(supabase, build_id,
        `Phase "${phase}" failed after ${attempt} attempt${attempt !== 1 ? 's' : ''}. Build stopped.\nError: ${errorMsg}`,
        phase, 'system');

      await supabase.from('pageforge_builds').update({
        status: 'failed', updated_at: new Date().toISOString(),
      }).eq('id', build_id);

      await updateJobProgress(vps_job_id, {
        status: 'failed', completed_at: new Date().toISOString(),
        progress_message: `Failed at ${phase} after ${attempt} attempts: ${errorMsg}`,
      });
      return;
    }
  }

  // All phases complete
  await supabase.from('pageforge_builds').update({
    status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', build_id);

  await postBuildMessage(supabase, build_id,
    'Build completed successfully! All phases passed.',
    'report_generation', 'system');

  await updateJobProgress(vps_job_id, {
    status: 'completed', completed_at: new Date().toISOString(),
    progress_message: 'PageForge build completed successfully', progress_pct: 100,
  });
  console.log(`[pageforge] Build ${build_id} completed`);
}

// ============================================================================
// PHASE EXECUTION - Real logic per phase
// ============================================================================

async function executePhase(
  buildId: string,
  phase: string,
  siteProfile: PageForgeSiteProfile,
  build: PageForgeBuild,
  anthropic: Anthropic
): Promise<void> {
  const artifacts = (build.artifacts || {}) as Record<string, any>;

  switch (phase) {

    // -----------------------------------------------------------------------
    // PHASE 0: PREFLIGHT - Validate WP + Figma connections
    // -----------------------------------------------------------------------
    case 'preflight': {
      const checks: Array<{ name: string; passed: boolean; message: string }> = [];
      const errors: string[] = [];

      // Test WordPress REST API
      if (siteProfile.wp_username && siteProfile.wp_app_password) {
        const wpResult = await wpTestConnection({
          restUrl: siteProfile.wp_rest_url,
          username: siteProfile.wp_username,
          appPassword: siteProfile.wp_app_password,
        });
        checks.push({ name: 'WordPress REST API', passed: wpResult.ok, message: wpResult.ok ? `Connected to ${wpResult.siteName}` : wpResult.error || 'Failed' });
        if (!wpResult.ok) errors.push(`WP REST: ${wpResult.error}`);
      } else {
        checks.push({ name: 'WordPress REST API', passed: false, message: 'Credentials not configured' });
        errors.push('WordPress credentials not configured');
      }

      // Test Figma token
      if (siteProfile.figma_personal_token) {
        const figmaResult = await figmaTestConnection(siteProfile.figma_personal_token);
        checks.push({ name: 'Figma Access', passed: figmaResult.ok, message: figmaResult.ok ? `Auth as ${figmaResult.email}` : figmaResult.error || 'Failed' });
        if (!figmaResult.ok) errors.push(`Figma: ${figmaResult.error}`);
      } else {
        checks.push({ name: 'Figma Access', passed: false, message: 'Token not configured' });
        errors.push('Figma token not configured');
      }

      // Check builder plugin
      if (siteProfile.wp_username && siteProfile.wp_app_password) {
        const wpClient = createWpClient({ restUrl: siteProfile.wp_rest_url, username: siteProfile.wp_username, appPassword: siteProfile.wp_app_password });
        if (siteProfile.page_builder === 'divi5') {
          const diviActive = await wpIsPluginActive(wpClient, 'divi');
          checks.push({ name: `Builder (${siteProfile.page_builder})`, passed: diviActive, message: diviActive ? 'Divi active' : 'Divi not detected' });
        } else {
          checks.push({ name: 'Builder (Gutenberg)', passed: true, message: 'Built-in' });
        }
      }

      // Validate required build fields
      if (!build.figma_file_key) errors.push('Missing figma_file_key');
      if (!build.page_title) errors.push('Missing page_title');

      // --- Figma file pre-flight scan ---
      const preflightResults: Record<string, any> = {};
      if (build.figma_file_key && siteProfile.figma_personal_token) {
        try {
          const figmaClient = createFigmaClient(siteProfile.figma_personal_token);
          const figmaFile = await figmaGetFile(figmaClient, build.figma_file_key);
          const pages = figmaFile.document.children || [];

          const figmaWarnings: string[] = [];

          // Check if file has any pages
          if (pages.length === 0) {
            figmaWarnings.push('Figma file has no pages');
          }

          // Check first page for frames
          const firstPage = pages[0];
          if (firstPage) {
            const frames = (firstPage.children || []).filter(
              (n: any) => n.type === 'FRAME' && n.visible !== false
            );

            if (frames.length === 0) {
              figmaWarnings.push('No visible frames found on the first page');
            }

            // Check for mobile frame (width ~375px)
            const hasMobileFrame = frames.some((f: any) => {
              const w = f.absoluteBoundingBox?.width || 0;
              return w >= 320 && w <= 430; // mobile range
            });
            if (!hasMobileFrame && frames.length > 0) {
              figmaWarnings.push('No mobile frame detected (320-430px width). Responsive output may be poor.');
            }

            // Check for desktop frame (width ~1440px)
            const hasDesktopFrame = frames.some((f: any) => {
              const w = f.absoluteBoundingBox?.width || 0;
              return w >= 1200 && w <= 1920;
            });
            if (!hasDesktopFrame && frames.length > 0) {
              figmaWarnings.push('No desktop frame detected (1200-1920px width).');
            }

            // Check for auto-layout usage (indicates well-structured design)
            let autoLayoutCount = 0;
            let totalFrameCount = 0;
            function countAutoLayout(node: any) {
              if (node.type === 'FRAME' || node.type === 'COMPONENT') {
                totalFrameCount++;
                if (node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL') {
                  autoLayoutCount++;
                }
              }
              if (node.children) {
                for (const child of node.children) countAutoLayout(child);
              }
            }
            for (const frame of frames) countAutoLayout(frame);

            if (totalFrameCount > 5 && autoLayoutCount / totalFrameCount < 0.3) {
              figmaWarnings.push(`Low auto-layout usage (${autoLayoutCount}/${totalFrameCount} frames). Absolute positioning may cause poor responsive output.`);
            }
          }

          // Font detection - check for non-standard fonts
          const COMMON_WEB_FONTS = new Set([
            'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana',
            'Courier New', 'Impact', 'Comic Sans MS', 'Trebuchet MS',
            'Palatino Linotype', 'Lucida Sans', 'Tahoma',
            'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat',
            'Poppins', 'Raleway', 'Oswald', 'Source Sans Pro',
            'Nunito', 'Playfair Display', 'PT Sans', 'Merriweather', 'Rubik',
          ]);
          const usedFonts = new Set<string>();
          function collectFonts(node: any) {
            if (node.type === 'TEXT' && node.style?.fontFamily) {
              usedFonts.add(node.style.fontFamily);
            }
            if (node.children) {
              for (const child of node.children) collectFonts(child);
            }
          }
          for (const page of pages) collectFonts(page);
          const nonStandardFonts = Array.from(usedFonts).filter(f => !COMMON_WEB_FONTS.has(f));
          if (nonStandardFonts.length > 0) {
            figmaWarnings.push(`Non-standard fonts detected: ${nonStandardFonts.join(', ')}. Ensure these are available on the WordPress site or use Google Fonts.`);
          }
          preflightResults.figma_fonts = { used: Array.from(usedFonts), nonStandard: nonStandardFonts };

          // Figma naming convention check
          const NAMING_RULES = {
            topLevelFrame: /^[A-Z][a-zA-Z0-9]+$/,
            sectionFrame: /^[A-Z][a-zA-Z0-9]+(\/[A-Z][a-zA-Z0-9]+)*$/,
            badPatterns: [
              { pattern: /^Frame\s*\d*$/i, reason: 'Generic "Frame" name - should describe the section' },
              { pattern: /^Group\s*\d*$/i, reason: 'Generic "Group" name - should describe the content' },
              { pattern: /^Rectangle\s*\d*$/i, reason: 'Generic shape name - should be renamed' },
              { pattern: /^Component\s*\d*$/i, reason: 'Generic component name - needs descriptive name' },
              { pattern: /^Vector\s*\d*$/i, reason: 'Generic vector name - should describe the element' },
              { pattern: /^\d+$/i, reason: 'Numeric-only name - needs descriptive label' },
              { pattern: /^image\s*\d*$/i, reason: 'Generic image name - describe the image content' },
              { pattern: /^Untitled/i, reason: 'Untitled element - needs a proper name' },
            ],
          };

          interface NamingIssue {
            nodeId: string;
            nodeName: string;
            nodeType: string;
            depth: number;
            issue: string;
            suggested: string;
          }

          const namingIssues: NamingIssue[] = [];
          let totalNamingNodesChecked = 0;

          function checkNaming(node: any, depth: number) {
            if (!node) return;

            const checkableTypes = ['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'GROUP'];

            if (checkableTypes.includes(node.type)) {
              totalNamingNodesChecked++;

              // Check bad patterns
              let matched = false;
              for (const { pattern, reason } of NAMING_RULES.badPatterns) {
                if (pattern.test(node.name)) {
                  namingIssues.push({
                    nodeId: node.id,
                    nodeName: node.name,
                    nodeType: node.type,
                    depth,
                    issue: reason,
                    suggested: 'Rename to describe its purpose (e.g., "HeroSection", "FeatureCard")',
                  });
                  matched = true;
                  break;
                }
              }

              // Check top-level frames for PascalCase
              if (!matched && depth === 1 && node.type === 'FRAME') {
                if (!NAMING_RULES.topLevelFrame.test(node.name)) {
                  namingIssues.push({
                    nodeId: node.id,
                    nodeName: node.name,
                    nodeType: node.type,
                    depth,
                    issue: 'Top-level frame should use PascalCase naming',
                    suggested: node.name
                      .replace(/[\s\-_]+(.)/g, (_: string, c: string) => c.toUpperCase())
                      .replace(/^(.)/, (_: string, c: string) => c.toUpperCase()),
                  });
                }
              }
            }

            // Recurse children (max depth 4 to avoid noise)
            if (node.children && depth < 4) {
              for (const child of node.children) {
                checkNaming(child, depth + 1);
              }
            }
          }

          // Walk all pages for naming issues
          for (const page of pages) {
            if (page.children) {
              for (const frame of page.children) {
                checkNaming(frame, 1);
              }
            }
          }

          preflightResults.figma_naming = {
            status: namingIssues.length === 0 ? 'pass' : 'warn',
            issues: namingIssues,
            total_checked: totalNamingNodesChecked,
          };

          if (namingIssues.length > 0) {
            figmaWarnings.push(`Found ${namingIssues.length} Figma naming convention issues. Consider requesting a designer fix before proceeding.`);
          }

          // Store warnings in preflight results
          preflightResults.figma_scan = {
            file_name: figmaFile.name,
            page_count: pages.length,
            warnings: figmaWarnings,
            last_modified: figmaFile.lastModified,
          };

          if (figmaWarnings.length > 0) {
            preflightResults.figma_warnings = figmaWarnings;
          }
        } catch (figmaScanErr) {
          preflightResults.figma_scan_error = figmaScanErr instanceof Error ? figmaScanErr.message : String(figmaScanErr);
        }
      }

      const passed = errors.length === 0;
      if (!passed) throw new Error(`Preflight failed: ${errors.join(', ')}`);

      await updateBuildArtifacts(supabase, buildId, 'preflight', { passed, checks, errors, ...preflightResults });

      // Post preflight summary to chat
      const checkSummary = checks.map(c => `${c.passed ? 'OK' : 'FAIL'} ${c.name}: ${c.message}`).join('\n');
      const warningsSummary = preflightResults.figma_warnings?.length
        ? `\n\nFigma warnings:\n${preflightResults.figma_warnings.join('\n')}`
        : '';
      await postBuildMessage(supabase, buildId,
        `Preflight complete - ${checks.length} checks run.\n${checkSummary}${warningsSummary}`,
        'preflight');

      console.log(`[pageforge] Preflight passed: ${checks.length} checks${preflightResults.figma_warnings ? `, ${preflightResults.figma_warnings.length} Figma warnings` : ''}`);
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 1: AUTO_NAME - AI-powered Figma layer naming suggestions
    // -----------------------------------------------------------------------
    case 'auto_name': {
      const preflightData = artifacts.preflight;
      const namingIssues = preflightData?.figma_naming?.issues || [];

      if (namingIssues.length === 0) {
        await updateBuildArtifacts(supabase, buildId, 'auto_name', {
          skipped: true,
          reason: 'No naming issues found in preflight',
        });
        await postBuildMessage(supabase, buildId, 'Auto-name skipped: all layers already have good names.', 'auto_name');
        console.log('[pageforge] Auto-name: no naming issues, skipping');
        break;
      }

      const googleApiKey = process.env.GOOGLE_AI_API_KEY;
      if (!googleApiKey) {
        throw new Error('GOOGLE_AI_API_KEY not configured on VPS');
      }

      if (!siteProfile.figma_personal_token) {
        throw new Error('Site profile has no Figma personal token configured');
      }

      const { runAutoName } = await import('../lib/auto-name-core.js');

      const result = await runAutoName({
        figmaFileKey: build.figma_file_key,
        figmaPersonalToken: siteProfile.figma_personal_token,
        figmaNodeIds: build.figma_node_ids,
        namingIssues,
        googleApiKey,
      });

      await updateBuildArtifacts(supabase, buildId, 'auto_name', result);

      // Build a nodeId->suggestedName map so later phases use AI names
      if (result.renames?.length > 0) {
        const nameMap: Record<string, string> = {};
        for (const r of result.renames) {
          nameMap[r.nodeId] = r.suggestedName;
        }
        // Store the name overlay map for figma_analysis and later phases
        await updateBuildArtifacts(supabase, buildId, 'auto_name_map', nameMap);

        // Update preflight naming data to mark resolved issues
        const preflightArtifacts = artifacts.preflight;
        if (preflightArtifacts?.figma_naming) {
          const resolvedIds = new Set(Object.keys(nameMap));
          const updatedNaming = {
            ...preflightArtifacts.figma_naming,
            resolved_count: resolvedIds.size,
            remaining_count: preflightArtifacts.figma_naming.issues.length - resolvedIds.size,
            issues: preflightArtifacts.figma_naming.issues.map((issue: any) => ({
              ...issue,
              resolved: resolvedIds.has(issue.nodeId),
              suggestedName: nameMap[issue.nodeId] || undefined,
            })),
          };
          await updateBuildArtifacts(supabase, buildId, 'preflight', {
            ...preflightArtifacts,
            figma_naming: updatedNaming,
          });
        }
      }

      const remaining = result.issue_count - result.rename_count;
      await postBuildMessage(
        supabase, buildId,
        result.rename_count > 0
          ? `Auto-name complete: ${result.rename_count} of ${result.issue_count} naming issues resolved.${remaining > 0 ? ` ${remaining} remaining (minor or context-dependent).` : ''}`
          : 'Auto-name: all layers already have good names.',
        'auto_name'
      );

      console.log(`[pageforge] Auto-name: ${result.rename_count} resolved, ${result.issue_count - result.rename_count} remaining (${result.duration_ms}ms)`);
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 1: FIGMA ANALYSIS - Extract design data from Figma
    // -----------------------------------------------------------------------
    case 'figma_analysis': {
      const figmaClient = createFigmaClient(siteProfile.figma_personal_token!);
      let pageNode: FigmaNode;

      if (build.figma_node_ids?.length > 0) {
        const nodes = await figmaGetFileNodes(figmaClient, build.figma_file_key, build.figma_node_ids);
        const firstNode = Object.values(nodes)[0];
        if (!firstNode) throw new Error('No Figma nodes found for specified IDs');
        pageNode = firstNode.document;
      } else {
        const file = await figmaGetFile(figmaClient, build.figma_file_key);
        pageNode = file.document.children?.[0] || file.document;
      }

      const rawSections = figmaExtractSections(pageNode);
      const colors = figmaExtractColors(pageNode);
      const fonts = figmaExtractTypography(pageNode);

      // Apply auto_name overlay: use AI-generated names instead of generic Figma names
      const nameMap = (artifacts.auto_name_map || {}) as Record<string, string>;
      const sections = rawSections.map(s => ({
        ...s,
        name: nameMap[s.id] || s.name,
        originalName: s.name,
      }));

      // Find image nodes with context (which section they belong to, dimensions, name)
      const imageNodeIds: string[] = [];
      const imageNodeDetails: { id: string; name: string; sectionName: string; width: number; height: number }[] = [];
      function findImages(node: FigmaNode, parentSectionName?: string) {
        // Determine section name - top-level children of the page are sections
        const sectionName = parentSectionName || node.name || 'Unknown';
        if (node.fills) {
          for (const fill of node.fills) {
            if (fill.type === 'IMAGE' && fill.imageRef) {
              imageNodeIds.push(node.id);
              imageNodeDetails.push({
                id: node.id,
                name: node.name || `image-${node.id}`,
                sectionName,
                width: Math.round(node.absoluteBoundingBox?.width || (node as any).size?.x || 400),
                height: Math.round(node.absoluteBoundingBox?.height || (node as any).size?.y || 300),
              });
              break;
            }
          }
        }
        if (node.children) {
          for (const child of node.children) findImages(child, parentSectionName || node.name);
        }
      }
      findImages(pageNode);

      // AI design summary
      const designResult = await callPageForgeAgent(supabase, buildId, 'pageforge_analyzer', 'figma_analysis',
        getSystemPrompt('pageforge_builder'),
        `Analyze this Figma design and provide a 2-3 sentence summary:\n\nSections:\n${sections.map((s: any, i: number) => `${i + 1}. "${s.name}" (${s.type}) ${s.bounds.width}x${s.bounds.height}px`).join('\n')}\n\nTokens: ${colors.length} colors, ${fonts.length} fonts, ${imageNodeIds.length} images`,
        anthropic
      );

      const result = {
        sections: sections.map((s: any) => ({ id: s.id, name: s.name, type: s.type, bounds: s.bounds, childCount: s.children.length })),
        colors, fonts, imageNodeIds, imageNodeDetails, designSummary: designResult.text,
      };
      await updateBuildArtifacts(supabase, buildId, 'figma_analysis', result);

      // Update build's figma_node_ids if they were empty (discovered from file)
      if (!build.figma_node_ids?.length && sections.length > 0) {
        const sectionIds = sections.map(s => s.id);
        await supabase.from('pageforge_builds').update({ figma_node_ids: sectionIds }).eq('id', buildId);
        build.figma_node_ids = sectionIds; // update local reference for later phases
      }

      console.log(`[pageforge] Figma analysis: ${sections.length} sections, ${colors.length} colors, ${fonts.length} fonts, ${imageNodeIds.length} images`);
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 2: SECTION CLASSIFICATION - AI classifies sections
    // -----------------------------------------------------------------------
    case 'section_classification': {
      const figmaData = artifacts.figma_analysis;
      if (!figmaData?.sections) throw new Error('Missing figma_analysis artifacts');

      const result = await callPageForgeAgent(supabase, buildId, 'pageforge_classifier', 'section_classification',
        getSystemPrompt('pageforge_builder'),
        `Classify each section by type and complexity tier.\n\nSections:\n${figmaData.sections.map((s: any, i: number) => `${i + 1}. "${s.name}" - ${s.bounds.width}x${s.bounds.height}px, ${s.childCount} children`).join('\n')}\n\nRespond with JSON array: [{"sectionId":"...","sectionName":"...","type":"hero|features|cta|testimonials|pricing|stats|gallery|contact|footer|navigation|content|faq|team|logos|video","tier":1-4,"description":"..."}]\n\nTier: 1=Simple, 2=Standard, 3=Complex, 4=Advanced`,
        anthropic
      );

      let classifications: any[];
      try {
        const jsonMatch = result.text.match(/\[[\s\S]*\]/);
        classifications = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      } catch {
        classifications = figmaData.sections.map((s: any) => ({ sectionId: s.id, sectionName: s.name, type: 'content', tier: 2, description: s.name }));
      }

      await updateBuildArtifacts(supabase, buildId, 'section_classification', classifications);
      console.log(`[pageforge] Classified ${classifications.length} sections`);
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 3: MARKUP GENERATION - AI generates WordPress markup
    // -----------------------------------------------------------------------
    case 'markup_generation': {
      const figmaData = artifacts.figma_analysis;
      const classifications = artifacts.section_classification;
      if (!figmaData || !classifications) throw new Error('Missing upstream artifacts');

      const builder = build.page_builder || 'gutenberg';
      const builderInstructions = builder === 'divi5' ? DIVI5_INSTRUCTIONS : GUTENBERG_INSTRUCTIONS;

      // Export Figma screenshot so the builder AI can SEE the design
      let figmaImage: string | null = null;
      let figmaImageMime = 'image/png';
      if (siteProfile.figma_personal_token && build.figma_node_ids?.length > 0) {
        try {
          const figmaClient = createFigmaClient(siteProfile.figma_personal_token);
          // Use JPG format at scale 1.0 for best quality, resize later if needed
          const imageResponse = await figmaGetImages(figmaClient, build.figma_file_key, [build.figma_node_ids[0]], { format: 'jpg', scale: 1 });
          const firstUrl = Object.values(imageResponse.images).find(Boolean);
          if (firstUrl) {
            const buffer = await figmaDownloadImage(firstUrl);
            console.log(`[pageforge] Figma image raw: ${Math.round(buffer.length / 1024)}KB`);
            // Resize to stay within Anthropic limits (max 7500px any dimension, under 4.5MB)
            figmaImage = await resizeIfNeeded(buffer.toString('base64'));
            figmaImageMime = 'image/jpeg';
            const resizedSize = Buffer.from(figmaImage, 'base64').length;
            console.log(`[pageforge] Figma image for builder: ${Math.round(resizedSize / 1024)}KB`);
            if (resizedSize > 4_500_000) {
              console.warn(`[pageforge] Figma image too large after resize (${Math.round(resizedSize / 1024)}KB), using text-only mode`);
              figmaImage = null;
            }
          }
        } catch (err) {
          console.warn('[pageforge] Failed to export Figma image for builder:', err);
        }
      }

      // Build detailed section descriptions with dimensions
      const sectionDetails = classifications.map((c: any, i: number) => {
        const section = figmaData.sections.find((s: any) => s.id === c.sectionId);
        const bounds = section?.bounds || {};
        return `${i + 1}. "${c.sectionName}" (${c.type}, Tier ${c.tier}) - ${bounds.width || '?'}x${bounds.height || '?'}px, ${section?.childCount || 0} child elements${c.description ? ` - ${c.description}` : ''}`;
      }).join('\n');

      // Identify primary and secondary colors from the design
      const colorList: string[] = figmaData.colors.map((c: any) => c.hex as string);
      const uniqueColors: string[] = [...new Set(colorList)];
      const primaryDark = uniqueColors.find(c => c.match(/^#[0-3]/)) || '#001738';
      const primaryAccent = uniqueColors.find(c => c.match(/^#[c-f][0-9a-f][0-3]/i)) || '#cc2336';
      const primaryFont = figmaData.fonts[0]?.family || 'Poppins';
      const secondaryFont = figmaData.fonts.find((f: any) => f.family !== primaryFont)?.family || primaryFont;

      // Build image placeholder list for the AI prompt
      const imageDetails: typeof figmaData.imageNodeDetails = figmaData.imageNodeDetails || [];
      const imageListForPrompt = imageDetails.length > 0
        ? imageDetails.map((img: any) => `- FIGMA_IMG:${img.id} - "${img.name}" from section "${img.sectionName}" (${img.width}x${img.height}px)`).join('\n')
        : '';

      // ========== DIVI 5 PATH: Structured JSON -> native Divi 5 modules ==========
      if (builder === 'divi5') {
        const figmaImageContext = figmaImage ? `IMPORTANT: The attached image shows the FULL Figma design for this page. Study it closely.
- Match exact layout structure, visual hierarchy, colors, fonts, and spacing
- If you see a dark navy hero, build one with the SAME proportions and colors
- If you see N cards side-by-side, use columns:N with that many cards
- Every section must match the Figma design precisely.` : '';

        const imageRules = imageListForPrompt ? `
## Available Images from Figma
${imageListForPrompt}

IMAGE RULES:
- Use FIGMA_IMG:nodeId as image value (e.g. "FIGMA_IMG:1:234")
- For section backgrounds: use in background.image field
- For card images: use in cards[].image field
- For standalone images: use in elements[].src field
- Match images to sections by name context
- Use EVERY available image at least once
- Do NOT modify the node IDs` : '';

        const divi5Prompt = `Generate a structured JSON page layout for a native Divi 5 WordPress landing page.

${figmaImageContext}

${DIVI5_INSTRUCTIONS}

## Design System
Primary font: "${primaryFont}", sans-serif (ALL text uses this font)
Secondary font: "${secondaryFont}", sans-serif
Dark color: ${primaryDark}
Accent color: ${primaryAccent}
All colors: ${uniqueColors.slice(0, 12).join(', ')}
Font scale: ${figmaData.fonts.slice(0, 8).map((f: any) => `${f.size}px/${f.weight}`).join(', ')}

## Sections to Build (${classifications.length} total - EVERY ONE is required)
${sectionDetails}
${imageRules}

## QUALITY RULES
1. Output exactly ${classifications.length} sections, matching the Figma design section count precisely.
2. Section backgrounds must EXACTLY match the Figma colors: ${uniqueColors.slice(0, 6).join(', ')}
3. Dark sections (${primaryDark} or similar) MUST have light text colors (#ffffff, #e0e0e0) in font settings
4. Card/feature grids: use columns + cards, NOT individual sections per card
5. Stats/numbers: use columns (3-5) + cards where title="24+" and text="Years Experience"
6. Hero: large h1 (48-60px), subtitle, CTA button. Use background.image + rgba overlay color
7. Footer: dark background, use a single "code" element for multi-column HTML footer layout
8. ALL content from the Figma design - NO placeholder/lorem ipsum text. Copy exact text visible in the design.
9. Match column counts exactly from Figma (3 cards in design = columns:3)
10. Each concept appears EXACTLY ONCE. Never duplicate sections.
11. Font sizes MUST use the actual design system: ${figmaData.fonts.slice(0, 5).map((f: any) => `${f.size}px`).join(', ')}
12. EVERY heading and text element MUST have explicit font.color set (dark text on light bg, light text on dark bg).

RESPOND WITH JSON ONLY (no markdown fences): {"sections":[...]}`;

        const divi5Result = await callPageForgeAgent(supabase, buildId, 'pageforge_markup_gen', 'markup_generation',
          getSystemPrompt('pageforge_builder'),
          divi5Prompt,
          anthropic, {
            maxTokens: 32000,
            images: figmaImage ? [{ data: figmaImage, mimeType: figmaImageMime }] : undefined,
          }
        );

        // Parse structured JSON response into Divi5Section[]
        let divi5Sections: Divi5Section[] = [];
        const rawText = divi5Result.text;
        try {
          const stripped = rawText.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
          const jsonMatch = stripped.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            divi5Sections = parsed.sections || [];
          }
        } catch (parseErr) {
          console.warn('[pageforge] Divi 5 JSON parse failed, trying partial extract:', parseErr instanceof Error ? parseErr.message : String(parseErr));
          // Try to extract sections array even from malformed/truncated JSON
          try {
            const sectionsMatch = rawText.match(/"sections"\s*:\s*(\[[\s\S]*)/);
            if (sectionsMatch) {
              let sectionsStr = sectionsMatch[1].replace(/,\s*([}\]])/g, '$1');
              // Fix truncation: close open brackets
              const openBrackets = (sectionsStr.match(/\[/g) || []).length;
              const closeBrackets = (sectionsStr.match(/\]/g) || []).length;
              for (let i = 0; i < openBrackets - closeBrackets; i++) sectionsStr += ']';
              const openBraces = (sectionsStr.match(/\{/g) || []).length;
              const closeBraces = (sectionsStr.match(/\}/g) || []).length;
              for (let i = 0; i < openBraces - closeBraces; i++) sectionsStr += '}';
              divi5Sections = JSON.parse(sectionsStr);
            }
          } catch {
            console.error('[pageforge] Divi 5 JSON parsing completely failed');
          }
        }

        if (divi5Sections.length === 0) {
          throw new Error('AI returned no valid Divi 5 sections - JSON parsing failed. Raw response length: ' + rawText.length);
        }

        // Post-process: ensure hero sections have background images from Figma
        // The AI sometimes omits background.image even when instructed, causing hero to render as solid color
        const imageDetails: { id: string; name: string; sectionName: string; width: number; height: number }[] = figmaData.imageNodeDetails || [];
        for (let si = 0; si < divi5Sections.length; si++) {
          const section = divi5Sections[si];
          const classification = classifications[si];
          if (!classification) continue;

          // Check if this section should have a background image
          const isHeroLike = classification.type === 'hero' ||
            section.name?.toLowerCase().includes('hero') ||
            (si === 0 && section.background?.color);

          if (isHeroLike && !section.background?.image) {
            // Find the largest image from this Figma section
            const sectionImages = imageDetails.filter(img =>
              img.sectionName === classification.sectionName ||
              img.sectionName?.toLowerCase().includes('hero')
            );
            // Pick the largest image (likely the background)
            const bgImage = sectionImages.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
            if (bgImage) {
              if (!section.background) section.background = {};
              section.background.image = `FIGMA_IMG:${bgImage.id}`;
              // Ensure dark overlay color if no color set
              if (!section.background.color) {
                section.background.color = 'rgba(0,23,56,0.75)';
              }
              console.log(`[pageforge] Post-process: injected background.image FIGMA_IMG:${bgImage.id} into hero section "${section.name}" (AI omitted it)`);
            }
          }

          // Also ensure any section with a background image placeholder has proper color overlay
          if (section.background?.image?.startsWith('FIGMA_IMG') && !section.background.color) {
            section.background.color = 'rgba(0,23,56,0.75)';
            console.log(`[pageforge] Post-process: added overlay color to section "${section.name}" with background image`);
          }
        }

        const divi5Markup = buildDivi5Markup(divi5Sections, primaryFont, primaryAccent);
        const diviSectionCount = (divi5Markup.match(/<!-- wp:divi\/section/g) || []).length;
        console.log(`[pageforge] Generated Divi 5 markup: ${divi5Markup.length} chars, ${diviSectionCount} native sections from ${divi5Sections.length} JSON sections`);

        await updateBuildArtifacts(supabase, buildId, 'markup_generation', { markup: divi5Markup, builder, sections: divi5Sections });
        break;
      }

      // ========== GUTENBERG / OTHER BUILDERS PATH ==========
      const builderLabel = builder;
      const prompt = `Generate a COMPLETE, production-quality WordPress ${builderLabel} landing page.

## ABSOLUTE REQUIREMENT - SECTION STRUCTURE:
You MUST output MULTIPLE separate <!-- wp:group --> blocks, one for EACH conceptual section of the page.
Example structure (8-12 separate wp:group blocks):
- <!-- wp:group --> Hero <!-- /wp:group -->
- <!-- wp:group --> Stats <!-- /wp:group -->
- <!-- wp:group --> Services/Products <!-- /wp:group -->
- <!-- wp:group --> Features/About <!-- /wp:group -->
- <!-- wp:group --> Gallery <!-- /wp:group -->
- <!-- wp:group --> Testimonials <!-- /wp:group -->
- <!-- wp:group --> Contact/CTA <!-- /wp:group -->
- <!-- wp:group --> Footer <!-- /wp:group -->
NEVER put ALL content inside 1-2 giant wp:group blocks. If you generate fewer than 5 wp:group blocks, the page is BROKEN.

${figmaImage ? `IMPORTANT: The attached image shows the FULL Figma design for this page. Study it meticulously.
- Match the exact layout structure, visual hierarchy, and content flow
- Copy the exact colors, fonts, spacing, and visual treatments you see
- If you see a dark navy hero section, build a dark navy hero section with the SAME proportions
- If you see a card grid with images, build the EXACT same grid with the SAME number of cards
- Every pixel matters. This must look PROFESSIONAL, not like a generic WordPress template.` : ''}

${builderInstructions}

## Design System
Primary font: "${primaryFont}", sans-serif (use on ALL text elements - headings, body, buttons, links, captions)
Secondary font: "${secondaryFont}", sans-serif
Dark color: ${primaryDark} (use for dark backgrounds, dark text)
Accent color: ${primaryAccent} (use for buttons, highlights, CTAs)
All colors: ${uniqueColors.slice(0, 12).join(', ')}
Font scale: ${figmaData.fonts.slice(0, 8).map((f: any) => `${f.size}px/${f.weight}`).join(', ')}
${siteProfile.global_css ? `\nSite Global CSS:\n${siteProfile.global_css.slice(0, 2000)}` : ''}

## Sections to Build (${classifications.length} total - EVERY ONE is required)
${sectionDetails}
${imageListForPrompt ? `
## Available Images from Figma Design
These are REAL images extracted from the Figma file. Use them as image sources by writing the EXACT placeholder token as the src/url value. They will be automatically replaced with real uploaded URLs after deployment.

${imageListForPrompt}

CRITICAL IMAGE RULES:
- For <img> tags: use src="FIGMA_IMG:nodeId" (e.g. src="FIGMA_IMG:1:234")
- For background images: use background-image:url(FIGMA_IMG:nodeId)
- Match images to the correct sections based on the section name and image name
- Use EVERY available image at least once - these are the real design assets
- If a section needs more images than available, you may reuse images or use placehold.co as fallback
- The FIGMA_IMG: prefix is required - do NOT modify the node IDs
` : ''}

## QUALITY STANDARDS - THIS IS A PAID CLIENT PAGE

### FULL-WIDTH IS NON-NEGOTIABLE
WordPress themes constrain content to a narrow center column (~600px wide). Your page will look BROKEN unless EVERY top-level section has this on its outermost div:
  style="width:100%;box-sizing:border-box;..."
Then inside that, use a div with max-width:1200px;margin:0 auto for centered content.
WITHOUT this, the page will appear crammed into 40% of the viewport with empty whitespace. THIS IS THE #1 CAUSE OF FAILURE.

### Other Quality Rules
1. EVERY element must have inline styles: font-family, font-size, font-weight, color, line-height, padding, margin, background-color
2. Use "${primaryFont}", sans-serif as font-family on EVERY text element. Not just headings - EVERYTHING.
3. Section backgrounds must alternate properly (dark/light/dark or as shown in Figma)
4. Dark background sections (#001738, #1a1a2e, etc.) MUST have white/light text (#ffffff, #e0e0e0)
5. Card grids: use display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:32px
6. Hero sections: min-height:600px or more, with OPAQUE overlay (rgba opacity 0.85+), large headline, subtext, and CTA button. The overlay must FULLY hide the placeholder image text.
7. Buttons: styled inline with <a> tags (NOT wp:button blocks), background-color, padding:16px 40px, border-radius
8. Images: Use FIGMA_IMG:nodeId placeholders from the "Available Images" list above. Only fall back to placehold.co if no matching Figma image exists. Always set width:100%, object-fit:cover on images.
9. Match Figma images to sections by name context (e.g. a "Hero Background" image goes in the hero section, "Tent Photo" goes in tent cards)
10. Do NOT use wp:cover, wp:buttons, or wp:columns blocks - use wp:group with inline styles only
11. Stats/numbers sections (e.g. 24+ years, 11,000 events): MUST be in a HORIZONTAL ROW using display:flex;flex-direction:row;flex-wrap:wrap;justify-content:space-around;align-items:center. Each stat item is a flex child with text-align:center;flex:1;min-width:150px. The number goes ABOVE the label. NEVER stack stats vertically - they MUST appear side-by-side in a single row.
12. If the Figma shows N items side-by-side in a section, they MUST be in a grid or flex row, NEVER stacked vertically. Match the column count from Figma.
13. NEVER duplicate sections. Each conceptual section from Figma appears EXACTLY ONCE. If a section appears in multiple Figma frames, only use it once.
## CRITICAL STRUCTURAL RULES (violating these produces broken pages):

14. ONE SECTION = ONE wp:group. EVERY conceptual section (hero, stats, services, gallery, testimonials, contact, footer) MUST be its OWN separate top-level <!-- wp:group --> block. NEVER nest multiple conceptual sections inside a single wp:group. The page should have 8-12 top-level wp:group blocks.

15. FULL-WIDTH CONTENT: Every section's inner content container MUST use max-width:1200px;margin:0 auto;padding:0 40px as its centering method. NEVER use a multi-column grid (e.g. grid-template-columns:200px 600px 200px) to center content - this creates a narrow column with dark sidebars. NEVER set max-width below 1000px on any content container.

16. NO DECORATOR COLUMNS: NEVER create grid or flex layouts where side columns exist purely for spacing or background color. All columns in a grid must contain actual content. For dark backgrounds, set the background on the wp:group itself and center the inner content with max-width + margin:auto.

17. FOOTER IS REQUIRED: Page MUST end with a dark footer in its own wp:group. 3-4 column layout with company info, quick links, services, contact + copyright.

18. Gallery/portfolio: UNIFORM grid repeat(3,1fr) gap:16px, all images SAME height via object-fit:cover. NEVER asymmetric/masonry.

19. Cards/categories/event types: ALWAYS in a GRID inside ONE wp:group. NEVER separate full-width sections for each item. NEVER duplicate the same concept (e.g. event types listed twice with different visual styles).

20. Hero overlay rgba 0.85 minimum opacity. Background image text must be invisible.

21. Stats/numbers: HORIZONTAL row using display:flex;flex-direction:row;flex-wrap:wrap;justify-content:space-around. Each stat: text-align:center;flex:1;min-width:150px. NEVER stack vertically.

22. MAXIMUM 10 SECTIONS. Typical: Hero, Stats, Services/Products, About/Features, Gallery, Testimonials, CTA/Contact, Footer. Each concept appears EXACTLY ONCE.

23. SECTION WIDTH CHECK: The visible content area of every section must span at least 1000px on a 1440px desktop viewport. If any section renders narrower than this, the page is broken.

REMINDER: Output 8-12 separate top-level <!-- wp:group --> blocks. NEVER fewer than 5. Each section gets its OWN wp:group.

RESPOND WITH JSON: {"markup":"the COMPLETE page markup","sections":[{"name":"section name","markup":"markup"}]}`;

      const result = await callPageForgeAgent(supabase, buildId, 'pageforge_markup_gen', 'markup_generation',
        getSystemPrompt('pageforge_builder'),
        prompt,
        anthropic, {
          maxTokens: 64000,
          images: figmaImage ? [{ data: figmaImage, mimeType: figmaImageMime }] : undefined,
        }
      );

      let markup: string;
      let sections: any[] = [];
      // Extract markup from AI response - handles JSON, truncated JSON, and raw markup
      const rawText = result.text;
      try {
        // Strip code fence markers if present
        const stripped = rawText.replace(/^```(?:json|html)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
        const jsonMatch = stripped.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          markup = parsed.markup || stripped;
          sections = parsed.sections || [];
        } else {
          markup = stripped;
        }
      } catch {
        // JSON parse failed (likely truncated output) - extract markup via string search
        const markupStart = rawText.indexOf('"markup"');
        if (markupStart >= 0) {
          // Find the opening quote of the markup value
          const valueStart = rawText.indexOf('"', markupStart + 8);
          if (valueStart >= 0) {
            // Extract everything after the opening quote, unescape JSON string escapes
            let extracted = rawText.slice(valueStart + 1);
            // Remove trailing truncated content (unmatched quotes, code fences)
            extracted = extracted.replace(/\n?"?\s*,?\s*"sections"[\s\S]*$/, '');
            extracted = extracted.replace(/\n?```\s*$/, '');
            // Remove trailing unmatched quote
            extracted = extracted.replace(/"?\s*$/, '');
            // Unescape JSON string escapes
            extracted = extracted
              .replace(/\\n/g, '\n')
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\')
              .replace(/\\t/g, '\t');
            if (extracted.includes('<!-- wp:') || extracted.includes('<div')) {
              markup = extracted;
              console.log(`[pageforge] Extracted markup from truncated JSON (${markup.length} chars)`);
            } else {
              markup = rawText;
            }
          } else {
            markup = rawText;
          }
        } else {
          // No JSON wrapper - use raw text, strip code fences
          markup = rawText.replace(/^```(?:json|html)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
        }
      }
      // Final safety: strip any remaining code fence markers from markup
      markup = markup.replace(/^```(?:json|html)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();

      // Count ACTUAL top-level wp:group blocks (not nested ones)
      const topLevelGroups = (markup.match(/<!-- wp:group \{/g) || []).length;
      console.log(`[pageforge] Generated ${builder} markup: ${markup.length} chars, ${topLevelGroups} top-level wp:group blocks`);

      // SECTION COUNT VALIDATION: If fewer than 5 top-level groups, the AI crammed everything into mega-sections.
      // Split mega-sections by injecting section breaks before major headings (h2).
      if (topLevelGroups < 5) {
        console.log(`[pageforge] WARNING: Only ${topLevelGroups} wp:group blocks (need 5+). Attempting auto-split...`);
        // Find h2 headings that are deeply nested and should start new sections
        // Strategy: Split the markup at <!-- wp:heading --> with h2 level that appear inside an existing group
        const splitMarkup = autoSplitMegaSections(markup);
        const newCount = (splitMarkup.match(/<!-- wp:group \{/g) || []).length;
        if (newCount >= 5) {
          markup = splitMarkup;
          console.log(`[pageforge] Auto-split increased sections from ${topLevelGroups} to ${newCount}`);
        } else {
          console.log(`[pageforge] Auto-split result: ${newCount} sections (still low, proceeding anyway)`);
        }
      }

      await updateBuildArtifacts(supabase, buildId, 'markup_generation', { markup, builder, sections });
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 4: MARKUP VALIDATION - Programmatic validation
    // -----------------------------------------------------------------------
    case 'markup_validation': {
      const markupData = artifacts.markup_generation;
      if (!markupData?.markup) throw new Error('Missing markup_generation artifacts');

      let { markup } = markupData;
      const { builder } = markupData;
      const errors: string[] = [];
      const warnings: string[] = [];

      if (builder === 'gutenberg') {
        const openCount = (markup.match(/<!-- wp:/g) || []).length;
        const closeCount = (markup.match(/<!-- \/wp:/g) || []).length;
        if (openCount !== closeCount) {
          // Auto-repair: track open blocks and add missing closers
          const blockStack: string[] = [];
          const openPattern = /<!-- wp:(\S+?)[\s{]/g;
          const closePattern = /<!-- \/wp:(\S+?) -->/g;
          let m;
          while ((m = openPattern.exec(markup)) !== null) blockStack.push(m[1]);
          while ((m = closePattern.exec(markup)) !== null) {
            const idx = blockStack.lastIndexOf(m[1]);
            if (idx !== -1) blockStack.splice(idx, 1);
          }
          // Append missing closing tags in reverse order
          if (blockStack.length > 0) {
            const closers = blockStack.reverse().map(t => `<!-- /wp:${t} -->`).join('\n');
            markup = markup.trimEnd() + '\n' + closers;
            // Update stored markup with repaired version
            markupData.markup = markup;
            await updateBuildArtifacts(supabase, buildId, 'markup_generation', markupData);
            warnings.push(`Auto-repaired ${blockStack.length} unclosed blocks (was ${openCount} open, ${closeCount} close)`);
          }
        }
        if (!markup.includes('<!-- wp:')) warnings.push('No Gutenberg block markers found');
      }

      if (builder === 'divi5') {
        // Validate native Divi 5 blocks
        const diviSectionCount = (markup.match(/<!-- wp:divi\/section/g) || []).length;
        if (diviSectionCount === 0) errors.push('No Divi 5 section blocks found');
        else if (diviSectionCount < 3) warnings.push(`Only ${diviSectionCount} Divi 5 sections (expected 5+)`);
        // Validate block balance
        const openDivi = (markup.match(/<!-- wp:divi\//g) || []).length;
        const closeDivi = (markup.match(/<!-- \/wp:divi\//g) || []).length;
        if (openDivi !== closeDivi) warnings.push(`Divi 5 block mismatch: ${openDivi} open, ${closeDivi} close`);
      }

      // Check unclosed HTML tags
      const unclosed = findUnclosedTags(markup);
      if (unclosed.length > 0) warnings.push(`Unclosed tags: ${unclosed.join(', ')}`);
      if (markup.trim().length < 50) errors.push('Markup too short');

      // --- Enhanced checks (PRD 9.1) ---

      // a. Lorem ipsum / placeholder text detection
      const loremPatterns = [
        /lorem\s+ipsum/i,
        /dolor\s+sit\s+amet/i,
        /consectetur\s+adipiscing/i,
        /placeholder\s+text/i,
        /your\s+text\s+here/i,
        /insert\s+text/i,
        /sample\s+text/i,
      ];
      const placeholderFound: string[] = [];
      for (const pattern of loremPatterns) {
        if (pattern.test(markup)) {
          placeholderFound.push(pattern.source);
        }
      }
      if (placeholderFound.length > 0) {
        warnings.push(`Placeholder text detected: ${placeholderFound.join(', ')}. Real content must be in the Figma file.`);
      }

      // b. Image validation - flag placeholder image services
      const imgSrcPattern = /src=["']([^"']+)["']/gi;
      let imgMatch;
      const imageUrls: string[] = [];
      while ((imgMatch = imgSrcPattern.exec(markup)) !== null) {
        imageUrls.push(imgMatch[1]);
      }
      for (const url of imageUrls) {
        if (url.includes('placeholder') || url.includes('via.placeholder') || url.includes('placehold.it') || url.includes('picsum.photos')) {
          warnings.push(`Placeholder image detected: ${url}`);
        }
      }

      // b2. Image dimension validation - check for oversized images
      const imgDimPattern = /src="([^"]+\.(jpg|jpeg|png|gif|webp|svg))"/gi;
      let imgDimMatch;
      const imageFileUrls: string[] = [];
      while ((imgDimMatch = imgDimPattern.exec(markup)) !== null) {
        const url = imgDimMatch[1];
        if (url.startsWith('http')) {
          imageFileUrls.push(url);
        }
      }
      const MAX_IMAGE_SIZE = 4194304; // 4MB
      for (const imgUrl of imageFileUrls) {
        try {
          const headRes = await fetch(imgUrl, {
            method: 'HEAD',
            signal: AbortSignal.timeout(5000),
          });
          const contentLength = headRes.headers.get('content-length');
          if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE) {
            const sizeMB = (parseInt(contentLength, 10) / (1024 * 1024)).toFixed(1);
            warnings.push(`Oversized image (${sizeMB}MB): ${imgUrl}. Images should be under 4MB for web performance.`);
          }
        } catch {
          // HEAD request failed - skip this image (best-effort check)
        }
      }

      // c. Mobile style presence check
      if (builder === 'gutenberg') {
        const hasResponsiveClasses = /wp-block-(columns|group|cover)/.test(markup) || /is-stacked-on-mobile/.test(markup);
        if (!hasResponsiveClasses && markup.length > 2000) {
          warnings.push('No responsive/mobile classes detected in markup. Page may not be mobile-friendly.');
        }
      }

      const valid = errors.length === 0;
      await updateBuildArtifacts(supabase, buildId, 'markup_validation', { valid, errors, warnings });
      console.log(`[pageforge] Validation: valid=${valid}, ${errors.length} errors, ${warnings.length} warnings`);
      if (!valid) throw new Error(`Markup validation failed: ${errors.join('; ')}`);
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 5: DEPLOY DRAFT - Create/update WordPress page
    // -----------------------------------------------------------------------
    case 'deploy_draft': {
      const markupData = artifacts.markup_generation;
      if (!markupData?.markup) throw new Error('Missing markup');
      if (!siteProfile.wp_username || !siteProfile.wp_app_password) throw new Error('WP credentials not configured');

      const wpClient = createWpClient({ restUrl: siteProfile.wp_rest_url, username: siteProfile.wp_username, appPassword: siteProfile.wp_app_password });

      // Sanitize markup and convert to target builder format (Divi 5 or Gutenberg)
      const builder = build.page_builder || 'gutenberg';
      let cleanMarkup = prepareMarkupForDeploy(markupData.markup, builder);

      // Try blank templates to eliminate sidebar/header/footer - query WP for available ones
      const blankTemplates = [
        'page-template-blank.php',     // Divi blank (most common)
        'page-builder-blank.php',      // Alternate Divi blank
        'page-full.php',               // Common full-width
        'template-full-width.php',     // Another common pattern
        'elementor_header_footer',     // Elementor canvas
      ];
      const configuredTemplate = (siteProfile as any).page_template;

      // Try creating/updating the page with each template until one works
      let page;
      let usedTemplate = '';
      const templatesToTry = configuredTemplate ? [configuredTemplate] : [...blankTemplates, ''];
      for (const tmpl of templatesToTry) {
        try {
          // Use empty title to prevent WP from rendering an H1 above the content
          // The actual page title is handled by SEO meta (Yoast) in the seo_config phase
          const wpTitle = ' '; // space prevents "empty title" validation errors
          if (build.wp_page_id) {
            page = await wpUpdatePage(wpClient, build.wp_page_id, { title: wpTitle, content: cleanMarkup, slug: build.page_slug || undefined, status: 'publish', template: tmpl || undefined });
          } else {
            page = await wpCreatePage(wpClient, { title: wpTitle, content: cleanMarkup, slug: build.page_slug || undefined, status: 'publish', template: tmpl || undefined });
          }
          usedTemplate = tmpl;
          console.log(`[pageforge] Page deployed with template: "${tmpl || 'default'}"`);
          break;
        } catch (err: any) {
          if (err.message?.includes('rest_invalid_param') && err.message?.includes('template') && tmpl !== '') {
            console.log(`[pageforge] Template "${tmpl}" not available, trying next...`);
            continue;
          }
          throw err; // re-throw non-template errors
        }
      }
      if (!page) throw new Error('All template options exhausted - could not create WP page');

      const siteUrl = siteProfile.site_url.replace(/\/$/, '');
      // Use the published permalink for screenshots (draft URLs require auth)
      const pageUrl = page.link || `${siteUrl}/?page_id=${page.id}`;
      const draftUrl = pageUrl; // Use published URL for all screenshot capture
      const previewUrl = pageUrl;

      await supabase.from('pageforge_builds').update({
        wp_page_id: page.id, wp_draft_url: draftUrl, wp_preview_url: previewUrl,
        updated_at: new Date().toISOString(),
      }).eq('id', buildId);

      await updateBuildArtifacts(supabase, buildId, 'deploy_draft', { pageId: page.id, draftUrl, previewUrl });
      console.log(`[pageforge] Published page ${page.id}: ${pageUrl}`);
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 6: IMAGE OPTIMIZATION - Download Figma images, upload to WP
    // -----------------------------------------------------------------------
    case 'image_optimization': {
      const figmaData = artifacts.figma_analysis;
      const imageNodeIds: string[] = figmaData?.imageNodeIds || [];

      if (imageNodeIds.length === 0) {
        await updateBuildArtifacts(supabase, buildId, 'image_optimization', { uploaded: 0, failed: 0, mediaIds: [] });
        console.log('[pageforge] No images to optimize');
        break;
      }

      const figmaClient = createFigmaClient(siteProfile.figma_personal_token!);
      const wpClient = createWpClient({ restUrl: siteProfile.wp_rest_url, username: siteProfile.wp_username!, appPassword: siteProfile.wp_app_password! });

      // Batch image exports to avoid Figma render timeout (max ~10 per request)
      const BATCH_SIZE = 10;
      const allImages: Record<string, string | null> = {};
      for (let b = 0; b < imageNodeIds.length; b += BATCH_SIZE) {
        const batch = imageNodeIds.slice(b, b + BATCH_SIZE);
        const batchNum = Math.floor(b / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(imageNodeIds.length / BATCH_SIZE);
        console.log(`[pageforge] Exporting image batch ${batchNum}/${totalBatches} (${batch.length} images)`);
        try {
          const batchResponse = await figmaGetImages(figmaClient, build.figma_file_key, batch, { format: 'png', scale: 1 });
          Object.assign(allImages, batchResponse.images);
        } catch (err) {
          console.error(`[pageforge] Image batch ${batchNum} failed, retrying at scale 1...`);
          try {
            const retryResponse = await figmaGetImages(figmaClient, build.figma_file_key, batch, { format: 'png', scale: 1 });
            Object.assign(allImages, retryResponse.images);
          } catch (retryErr) {
            console.error(`[pageforge] Image batch ${batchNum} failed on retry too:`, retryErr);
            for (const id of batch) allImages[id] = null;
          }
        }
      }

      await postBuildMessage(supabase, buildId,
        `Exported ${Object.values(allImages).filter(Boolean).length}/${imageNodeIds.length} images from Figma. Uploading to WordPress...`,
        'image_optimization');

      const mediaIds: number[] = [];
      const imageUrlMap: Record<string, string> = {}; // nodeId -> WP media URL
      let uploaded = 0, failed = 0;

      for (const [nodeId, imageUrl] of Object.entries(allImages)) {
        if (!imageUrl) { failed++; continue; }
        try {
          let buffer = await figmaDownloadImage(imageUrl);
          // Compress: resize to max 1920px wide, convert to JPEG at quality 82
          const origSize = buffer.length;
          const img = sharp(buffer);
          const meta = await img.metadata();
          if (meta.width && meta.width > 1920) {
            buffer = await img.resize(1920, undefined, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
          } else {
            buffer = await img.jpeg({ quality: 82 }).toBuffer();
          }
          console.log(`[pageforge] Image ${nodeId}: ${Math.round(origSize/1024)}KB -> ${Math.round(buffer.length/1024)}KB`);
          const filename = `pageforge-${buildId.slice(0, 8)}-${nodeId.replace(/[^a-zA-Z0-9]/g, '-')}.jpg`;
          const media = await wpUploadMedia(wpClient, buffer, filename, 'image/jpeg');
          mediaIds.push(media.id);
          imageUrlMap[nodeId] = media.source_url;
          uploaded++;
          // Small delay between uploads to avoid WP 503 rate limiting
          await new Promise(r => setTimeout(r, 1500));
        } catch (err) {
          console.error(`[pageforge] Image upload failed for ${nodeId}:`, err);
          // Retry once after 5s delay
          try {
            await new Promise(r => setTimeout(r, 5000));
            let buffer = await figmaDownloadImage(imageUrl);
            buffer = await sharp(buffer).resize(1920, undefined, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
            const filename = `pageforge-${buildId.slice(0, 8)}-${nodeId.replace(/[^a-zA-Z0-9]/g, '-')}.jpg`;
            const media = await wpUploadMedia(wpClient, buffer, filename, 'image/jpeg');
            mediaIds.push(media.id);
            imageUrlMap[nodeId] = media.source_url;
            uploaded++;
            console.log(`[pageforge] Image retry succeeded for ${nodeId}`);
          } catch (retryErr) {
            console.error(`[pageforge] Image retry also failed for ${nodeId}`);
            failed++;
          }
        }
      }

      // Replace FIGMA_IMG: placeholders in page content with real WP media URLs
      if (build.wp_page_id && Object.keys(imageUrlMap).length > 0) {
        try {
          const pageRes = await fetch(`${wpClient.config.restUrl}/pages/${build.wp_page_id}?context=edit`, { headers: wpClient.headers });
          if (pageRes.ok) {
            const pageData = await pageRes.json();
            let content: string = pageData.content?.raw || pageData.content?.rendered || '';
            let replacements = 0;

            for (const [nodeId, wpUrl] of Object.entries(imageUrlMap)) {
              // Replace both src="FIGMA_IMG:nodeId" and url(FIGMA_IMG:nodeId) patterns
              const pattern = new RegExp(`FIGMA_IMG:${nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
              const matches = content.match(pattern);
              if (matches) {
                content = content.replace(pattern, wpUrl);
                replacements += matches.length;
              }
            }

            if (replacements > 0) {
              // Content already deployed in correct format - just update with replaced URLs
              await wpUpdatePage(wpClient, build.wp_page_id, { content });
              console.log(`[pageforge] Replaced ${replacements} image placeholders with real WP URLs`);
            } else {
              // If no FIGMA_IMG: placeholders found, try replacing placehold.co URLs
              // with real images by section name matching
              const placeholderPattern = /https:\/\/placehold\.co\/[^"'\s)]+/g;
              const placeholders = [...new Set(content.match(placeholderPattern) || [])];
              const availableUrls = Object.values(imageUrlMap);
              if (placeholders.length > 0 && availableUrls.length > 0) {
                let idx = 0;
                for (const placeholder of placeholders) {
                  if (idx >= availableUrls.length) idx = 0; // cycle through available images
                  content = content.split(placeholder).join(availableUrls[idx]);
                  idx++;
                  replacements++;
                }
                await wpUpdatePage(wpClient, build.wp_page_id, { content });
                console.log(`[pageforge] Replaced ${replacements} placehold.co URLs with real images (round-robin)`);
              } else {
                console.log('[pageforge] No image placeholders found in page content to replace');
              }
            }
          }
        } catch (err) {
          console.error('[pageforge] Failed to replace image placeholders:', err);
        }
      }

      await updateBuildArtifacts(supabase, buildId, 'image_optimization', { uploaded, failed, mediaIds, imageUrlMap });
      console.log(`[pageforge] Images: ${uploaded} uploaded, ${failed} failed, ${Object.keys(imageUrlMap).length} mapped`);
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 7: VQA CAPTURE - Screenshots at 3 breakpoints
    // -----------------------------------------------------------------------
    case 'vqa_capture': {
      const deployData = artifacts.deploy_draft;
      if (!deployData?.draftUrl) throw new Error('Missing deploy_draft artifacts');

      // Capture WordPress screenshots via Browserless
      const wpScreenshots = await captureScreenshots(deployData.draftUrl);

      // Export Figma screenshots (JPG, scale 0.5 to stay under 5MB API limit)
      let figmaScreenshots: Record<string, string | null> = { desktop: null, tablet: null, mobile: null };
      if (siteProfile.figma_personal_token && build.figma_node_ids?.length > 0) {
        try {
          const figmaClient = createFigmaClient(siteProfile.figma_personal_token);
          const imageResponse = await figmaGetImages(figmaClient, build.figma_file_key, [build.figma_node_ids[0]], { format: 'jpg', scale: 0.5 });
          const firstUrl = Object.values(imageResponse.images).find(Boolean);
          if (firstUrl) {
            const buffer = await figmaDownloadImage(firstUrl);
            console.log(`[pageforge] Figma VQA screenshot raw: ${Math.round(buffer.length / 1024)}KB`);
            const base64 = await resizeIfNeeded(buffer.toString('base64'));
            figmaScreenshots = { desktop: base64, tablet: base64, mobile: base64 };
            console.log(`[pageforge] Figma VQA screenshot ready`);
          }
        } catch (err) {
          console.warn('[pageforge] Failed to export Figma VQA screenshots:', err);
        }
      }

      const wpCount = Object.values(wpScreenshots).filter(Boolean).length;
      const figmaCount = Object.values(figmaScreenshots).filter(Boolean).length;
      await updateBuildArtifacts(supabase, buildId, 'vqa_capture', { wpScreenshots, figmaScreenshots });
      console.log(`[pageforge] VQA capture complete: ${wpCount} WP screenshots, ${figmaCount} Figma screenshots`);
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 8: VQA COMPARISON - AI vision comparison
    // -----------------------------------------------------------------------
    case 'vqa_comparison': {
      const captureData = artifacts.vqa_capture;
      if (!captureData) throw new Error('Missing vqa_capture artifacts');

      const { wpScreenshots, figmaScreenshots } = captureData;
      const threshold = siteProfile.vqa_pass_threshold || 80;
      const figmaData = artifacts.figma_analysis;
      const classifications = artifacts.section_classification;
      const results: Record<string, { score: number; differences: any[] }> = {};

      // Build section context for the VQA agent
      const sectionContext = classifications?.length
        ? `\nPage sections (top to bottom):\n${classifications.map((c: any, i: number) => `${i + 1}. "${c.sectionName}" (${c.type})`).join('\n')}`
        : '';

      // DESKTOP: Full-page comparison using both images (already resized to max 7500px)
      const figmaDesktop = figmaScreenshots?.desktop;
      const wpDesktop = wpScreenshots?.desktop;

      if (figmaDesktop && wpDesktop) {
        try {
          const vqaResult = await callPageForgeAgent(supabase, buildId, 'pageforge_vqa', 'vqa_comparison',
            getSystemPrompt('pageforge_vqa'),
            `Compare the FULL Figma design against the FULL WordPress page at DESKTOP (1440px).
${sectionContext}

Image 1: Figma design (reference - the original design)
Image 2: WordPress page (actual output - what was built)

IMPORTANT: The images may have slightly different heights/proportions. Focus on whether the SAME SECTIONS and CONTENT exist in both, not on exact pixel alignment. The Figma design and WP page will naturally have different spacing.

Evaluate these aspects:
1. SECTION PRESENCE: Are all major sections from Figma present in WP? (hero, services, gallery, testimonials, contact, footer)
2. VISUAL STYLE: Do sections have correct background colors (dark navy, white, cream)? Are fonts styled (not system defaults)?
3. CARD/GRID LAYOUTS: Are multi-column layouts (3-column cards, grids) properly implemented?
4. IMAGES: Are real images showing in the right places? Or are there gray boxes/broken images?
5. COLOR SCHEME: Does the WP page use the same color palette as the Figma design?
6. TYPOGRAPHY: Are headings styled with correct hierarchy (H1 > H2 > H3)?
7. BUTTONS/CTAs: Are buttons styled and visible?
8. FOOTER: Is a proper multi-column footer present?

Scoring guide:
- 0-30: Unstyled HTML, missing sections, broken layout
- 30-50: Basic structure but wrong colors/fonts, missing backgrounds
- 50-70: Good structure, some styling issues, a few missing elements
- 70-85: All sections present, well-styled, minor spacing/color differences
- 85-95: Excellent recreation, professional quality, very close to design
- 95-100: Near pixel-perfect match

DIVI 5 CSS SELECTORS (use these in suggestedFix, NOT made-up class names):
- Sections: .et_pb_section_0, .et_pb_section_1, etc. (0-indexed, top to bottom)
- Text: .et_pb_section_N .et_pb_text_inner
- Headings: .et_pb_section_N h1, .et_pb_section_N h2
- Cards: .et_pb_section_N .et_pb_blurb_content
- Images: .et_pb_section_N .et_pb_image_wrap img
- Buttons: .et_pb_button

Respond with JSON:
{"score":N,"differences":[{"area":"element","severity":"critical|major|minor","description":"specific issue","suggestedFix":"CSS rule using Divi 5 selectors above"}]}`,
            anthropic, {
              images: [
                { data: figmaDesktop, mimeType: 'image/jpeg' },
                { data: wpDesktop, mimeType: 'image/jpeg' },
              ],
            }
          );

          const jsonMatch = vqaResult.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            results.desktop = { score: parsed.score || 0, differences: parsed.differences || [] };
          } else {
            results.desktop = { score: 40, differences: [] };
          }
          console.log(`[pageforge] VQA desktop score: ${results.desktop.score}%`);
        } catch (err) {
          results.desktop = { score: 0, differences: [{ area: 'comparison', severity: 'critical', description: `Failed: ${err instanceof Error ? err.message : String(err)}` }] };
        }
      } else {
        results.desktop = { score: 0, differences: [{ area: 'full', severity: 'critical', description: 'Screenshot not available' }] };
      }

      // TABLET + MOBILE: Responsive-only checks (no Figma reference since it's the same desktop image)
      for (const bp of ['tablet', 'mobile'] as const) {
        const wpImg = wpScreenshots?.[bp];
        if (!wpImg) {
          results[bp] = { score: 0, differences: [{ area: 'full', severity: 'critical', description: 'Screenshot not available' }] };
          continue;
        }

        try {
          const width = bp === 'tablet' ? 768 : 375;
          const vqaResult = await callPageForgeAgent(supabase, buildId, 'pageforge_vqa', 'vqa_comparison',
            getSystemPrompt('pageforge_vqa'),
            `Evaluate this WordPress page screenshot at ${bp.toUpperCase()} (${width}px) breakpoint for responsive quality.

Image 1: The WordPress page rendered at ${width}px width

Check for responsive issues:
1. Is all content visible and readable? No text overflow or cut-off?
2. Do layouts stack properly on smaller screens? No horizontal scroll?
3. Are font sizes appropriate for the viewport?
4. Are images properly sized and not overflowing?
5. Is spacing reasonable (not too cramped or too much whitespace)?
6. Are interactive elements (buttons, links) large enough to tap?

Score from 0-100 (100 = perfect responsive behavior).

Respond with JSON:
{"score":N,"differences":[{"area":"element","severity":"critical|major|minor","description":"responsive issue","suggestedFix":"CSS fix"}]}`,
            anthropic, {
              images: [{ data: wpImg, mimeType: 'image/jpeg' }],
            }
          );

          const jsonMatch = vqaResult.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            results[bp] = { score: parsed.score || 0, differences: parsed.differences || [] };
          } else {
            results[bp] = { score: 70, differences: [] };
          }
        } catch (err) {
          results[bp] = { score: 0, differences: [{ area: 'comparison', severity: 'critical', description: `Failed: ${err instanceof Error ? err.message : String(err)}` }] };
        }
      }

      // Run layout validation to detect narrow columns, mega-sections, decorator grids
      let layoutPenalty = 0;
      const deployData = artifacts.deploy_draft;
      if (deployData?.draftUrl) {
        try {
          const layoutResult = await runLayoutValidation(deployData.draftUrl);
          if (layoutResult.issues.length > 0) {
            // Each layout issue is a 5% penalty, max 30%
            layoutPenalty = Math.min(layoutResult.issues.length * 5, 30);
            // Add layout issues as critical differences
            for (const issue of layoutResult.issues) {
              results.desktop?.differences.push({
                area: '[layout]',
                severity: 'critical',
                description: issue,
                suggestedFix: 'Split mega-sections into separate wp:group blocks. Use max-width:1200px;margin:0 auto for centering instead of multi-column grids.',
              });
            }
          }
        } catch (err) {
          console.warn('[pageforge] Layout validation failed in VQA comparison:', err);
        }
      }

      // Desktop is primary (70% weight since it's the only real Figma comparison)
      const desktopScore = results.desktop?.score || 0;
      const tabletScore = results.tablet?.score || 0;
      const mobileScore = results.mobile?.score || 0;
      const rawScore = Math.round(desktopScore * 0.7 + tabletScore * 0.15 + mobileScore * 0.15);
      const overallScore = Math.max(0, rawScore - layoutPenalty);
      if (layoutPenalty > 0) {
        console.log(`[pageforge] Layout penalty: -${layoutPenalty}% (raw: ${rawScore}%, adjusted: ${overallScore}%)`);
      }
      const passed = overallScore >= threshold;

      await supabase.from('pageforge_builds').update({
        vqa_score_desktop: desktopScore, vqa_score_tablet: tabletScore,
        vqa_score_mobile: mobileScore, vqa_score_overall: overallScore,
        updated_at: new Date().toISOString(),
      }).eq('id', buildId);

      const fixSuggestions = Object.values(results).flatMap(r => r.differences.filter((d: any) => d.suggestedFix).map((d: any) => d.suggestedFix));

      await updateBuildArtifacts(supabase, buildId, 'vqa_comparison', { results, overallScore, passed, threshold, fixSuggestions });

      await postBuildMessage(supabase, buildId,
        `VQA Comparison: Desktop=${desktopScore}% Tablet=${tabletScore}% Mobile=${mobileScore}% Overall=${overallScore}% (threshold=${threshold}%, ${passed ? 'PASSED' : 'needs fixes'})`,
        'vqa_comparison');

      console.log(`[pageforge] VQA scores: D=${desktopScore} T=${tabletScore} M=${mobileScore} Overall=${overallScore} (threshold=${threshold}, passed=${passed})`);
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 9: VQA FIX LOOP - Apply AI-suggested fixes
    // -----------------------------------------------------------------------
    case 'vqa_fix_loop': {
      let comparisonData = artifacts.vqa_comparison;
      const markupData = artifacts.markup_generation;
      if (!comparisonData || !markupData) throw new Error('Missing upstream artifacts');

      if (comparisonData.passed) {
        await updateBuildArtifacts(supabase, buildId, 'vqa_fix_loop', { skipped: true, reason: 'VQA passed threshold' });
        console.log('[pageforge] VQA passed, skipping fix loop');
        break;
      }

      const maxLoops = siteProfile.max_vqa_fix_loops || 15;
      const threshold = siteProfile.vqa_pass_threshold || 80;
      let currentIteration = build.vqa_fix_iteration || 0;
      // Apply real image URLs from image_optimization to the markup
      let currentMarkup = markupData.markup;
      const imageUrlMap: Record<string, string> = artifacts.image_optimization?.imageUrlMap || {};
      if (Object.keys(imageUrlMap).length > 0 && currentMarkup.includes('FIGMA_IMG:')) {
        let imgReplacements = 0;
        for (const [nodeId, wpUrl] of Object.entries(imageUrlMap)) {
          const pattern = new RegExp(`FIGMA_IMG:${nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
          const matches = currentMarkup.match(pattern);
          if (matches) {
            currentMarkup = currentMarkup.replace(pattern, wpUrl as string);
            imgReplacements += matches.length;
          }
        }
        if (imgReplacements > 0) {
          console.log(`[pageforge] VQA fix loop: replaced ${imgReplacements} FIGMA_IMG placeholders with real WP URLs`);
        }
      }
      const allChanges: string[] = [];
      const failedPatches: Array<{ search: string; description: string; iteration: number }> = [];
      let lastScore = comparisonData.overallScore || 0;
      let stallCount = 0;
      let rollbackCount = 0;
      let previousMarkup: string | null = null;
      const scoreHistory: Array<{ iteration: number; score: number }> = [];
      let lastPhase = 0; // Track phase changes to reset stall counter
      let lastScreenshotHash = ''; // Track screenshot changes between iterations

      // Get the Figma reference screenshot (doesn't change between iterations)
      const figmaDesktop = artifacts.vqa_capture?.figmaScreenshots?.desktop;
      const deployData = artifacts.deploy_draft;
      const draftUrl = deployData?.draftUrl;

      if (!draftUrl) throw new Error('Missing draft URL for VQA fix loop');

      // Build section name mapping for CSS selectors
      const sectionNames: string[] = [];
      const sectionMatches = currentMarkup.matchAll(/<!-- wp:divi\/section\s+(\{[\s\S]*?\})\s*-->/g);
      let sectionIdx = 0;
      for (const match of sectionMatches) {
        try {
          const attrs = JSON.parse(match[1]);
          const label = attrs?.module?.meta?.adminLabel?.desktop?.value || `Section ${sectionIdx}`;
          sectionNames.push(`.et_pb_section_${sectionIdx} = "${label}"`);
        } catch { sectionNames.push(`.et_pb_section_${sectionIdx} = "Section ${sectionIdx}"`); }
        sectionIdx++;
      }
      const sectionMapContext = sectionNames.length > 0
        ? `\nSECTION CSS MAPPING:\n${sectionNames.join('\n')}\n`
        : '';

      await postBuildMessage(supabase, buildId,
        `Starting VQA fix loop: score=${lastScore}%, threshold=${threshold}%, max iterations=${maxLoops}`,
        'vqa_fix_loop');

      while (currentIteration < maxLoops) {
        currentIteration++;
        console.log(`[pageforge] VQA fix iteration ${currentIteration}/${maxLoops} (score: ${lastScore}%, target: ${threshold}%)`);

        // 1. Gather differences from latest comparison
        // Include minor diffs when score is far from target (they add up)
        const includeMinor = lastScore < (threshold - 10);
        const allDiffs = Object.values(comparisonData.results as Record<string, any>)
          .flatMap((r: any) => (r.differences || []).filter((d: any) => includeMinor || d.severity !== 'minor'));

        if (allDiffs.length === 0) {
          console.log('[pageforge] No more differences to fix');
          break;
        }

        // 2. Strategic fix ordering: categorize diffs and phase the loop
        // Phase 1 (iter 1-4): layout + backgrounds (structural foundation)
        // Phase 2 (iter 5-8): typography + images + remaining backgrounds
        // Phase 3 (iter 9+): all remaining (spacing, polish)
        const categorizedDiffs = allDiffs.map((d: any) => ({ ...d, category: categorizeDiff(d) }));
        let phaseDiffs: typeof categorizedDiffs;
        const currentPhase = currentIteration <= 4 ? 1 : currentIteration <= 8 ? 2 : 3;
        // Reset stall counter when phase changes - new diff types are being addressed
        if (currentPhase !== lastPhase && lastPhase > 0) {
          console.log(`[pageforge] Phase changed ${lastPhase} -> ${currentPhase}, resetting stall counter (was ${stallCount})`);
          stallCount = 0;
        }
        lastPhase = currentPhase;
        if (currentIteration <= 4) {
          const priorityDiffs = categorizedDiffs.filter(d => d.category === 'layout' || d.category === 'background');
          phaseDiffs = priorityDiffs.length > 0 ? priorityDiffs : categorizedDiffs;
          console.log(`[pageforge] Phase 1 (layout+bg): ${priorityDiffs.length} priority diffs of ${categorizedDiffs.length} total`);
        } else if (currentIteration <= 8) {
          const priorityDiffs = categorizedDiffs.filter(d =>
            d.category === 'typography' || d.category === 'images' || d.category === 'background'
          );
          phaseDiffs = priorityDiffs.length > 0 ? priorityDiffs : categorizedDiffs;
          console.log(`[pageforge] Phase 2 (typography+images): ${priorityDiffs.length} priority diffs of ${categorizedDiffs.length} total`);
        } else {
          phaseDiffs = categorizedDiffs;
          console.log(`[pageforge] Phase 3 (all): ${categorizedDiffs.length} diffs`);
        }

        // Prioritize: critical first, then major, max 12 per iteration
        const sortedDiffs = phaseDiffs.sort((a: any, b: any) => {
          const order = { critical: 0, major: 1, minor: 2 };
          return (order[a.severity as keyof typeof order] || 2) - (order[b.severity as keyof typeof order] || 2);
        }).slice(0, 12);

        // 3. AI fix with visual context (Figma + current WP screenshot)
        const images: Array<{ data: string; mimeType: string }> = [];
        if (figmaDesktop) {
          images.push({ data: figmaDesktop, mimeType: 'image/jpeg' });
        }

        // Capture current WP desktop screenshot for visual reference
        let currentWpScreenshot: string | null = null;
        try {
          const wpShots = await captureScreenshots(draftUrl);
          currentWpScreenshot = wpShots.desktop || null;
          if (currentWpScreenshot) {
            images.push({ data: currentWpScreenshot, mimeType: 'image/jpeg' });
          }
        } catch (err) {
          console.warn('[pageforge] Failed to capture current WP screenshot for fix context:', err);
        }

        // Run layout validation to detect narrow columns, mega-sections, decorator grids
        let layoutIssuesContext = '';
        try {
          const layoutResult = await runLayoutValidation(draftUrl);
          if (layoutResult.issues.length > 0) {
            layoutIssuesContext = `\n\nCRITICAL LAYOUT ISSUES DETECTED (fix these FIRST - they make the page look broken):\n${layoutResult.issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}\n\nTo fix layout issues:\n- Split mega-sections into separate <!-- wp:group --> blocks (one per conceptual section)\n- Replace 3-column decorator grids with: max-width:1200px;margin:0 auto;padding:0 40px\n- Ensure every section's inner content container is at least 1000px wide\n- NEVER use grid-template-columns with empty side columns for centering`;
          }
        } catch (err) {
          console.warn('[pageforge] Layout validation failed in fix loop:', err);
        }

        const imageContext = images.length >= 2
          ? 'Image 1 is the Figma design reference. Image 2 is the current WordPress page. Fix the WordPress markup to match the Figma design.'
          : images.length === 1
            ? 'Image 1 is the Figma design reference. Fix the markup to match it.'
            : '';

        const isDivi5Fix = (build.page_builder || 'gutenberg') === 'divi5';

        // For Divi 5: use search/replace patches (safer for long JSON lines)
        // For Gutenberg: use line-based edits
        let fixPrompt: string;
        let formattedMarkup: string;

        if (isDivi5Fix) {
          // Show markup as-is (blocks are already one-per-line)
          formattedMarkup = currentMarkup;

          // Limit to top 8 most impactful differences (was 5 - too few for convergence)
          const topDiffs = sortedDiffs.slice(0, 8);

          fixPrompt = `Fix this Divi 5 WordPress page to better match the Figma design.

${imageContext}

This is NATIVE Divi 5 block markup using <!-- wp:divi/{module} {JSON} --> format.
Each block has JSON attributes that control its appearance. DO NOT convert to Gutenberg or HTML.

Iteration ${currentIteration}/${maxLoops} - Current VQA score: ${lastScore}% (target: ${threshold}%)
${sectionMapContext}
Current markup:
\`\`\`
${currentMarkup}
\`\`\`

TOP ${topDiffs.length} visual differences to fix (priority order):
${topDiffs.map((d: any, i: number) => `${i + 1}. [${d.severity.toUpperCase()}] ${d.area}: ${d.description}${d.suggestedFix ? `\n   Suggested fix: ${d.suggestedFix}` : ''}`).join('\n')}
${layoutIssuesContext}
${failedPatches.length > 0 ? `\nPREVIOUS PATCHES THAT FAILED (search string not found - DO NOT repeat these exact searches):\n${failedPatches.slice(-10).map((fp, i) => `${i + 1}. Tried: "${fp.search}" (intended: ${fp.description})`).join('\n')}\nThese search strings were NOT found in the markup. Look at the ACTUAL markup content above and use strings that EXACTLY match.\n` : ''}
TWO FIX STRATEGIES (use both as needed):

STRATEGY A - JSON attribute patches (for Divi 5 module properties):
- Background colors: find "background" in section JSON, change "color":{"desktop":{"value":"#XXXXXX"}}
- Text colors: find "font" objects, change "color" value
- Font sizes: find "size" in font objects, change the value
- Spacing: find "padding" objects, change top/bottom/left/right values
- Each value is wrapped in {"desktop":{"value":"..."}} breakpoint format

STRATEGY B - CSS rule additions (for visual fixes that JSON can't handle):
The markup starts with a <style> block containing CSS fallback rules. You can ADD new CSS rules.
Divi 5 CSS selectors:
- .et_pb_section_0, .et_pb_section_1, etc. (sections, 0-indexed top to bottom)
- .et_pb_section_N .et_pb_text_inner (text inside section N)
- .et_pb_section_N h1, h2, h3 (headings in section N)
- .et_pb_section_N .et_pb_blurb_content (card content in section N)
- .et_pb_section_N .et_pb_image_wrap img (images in section N)
- .et_pb_button (all buttons)
Use CSS for: overlays on bg images, grid gaps, font stacks, border-radius, box-shadows, hover effects.
To add CSS: search for "</style>" and replace with "NEW_RULES_HERE\\n</style>"

COMMON MISTAKES TO AVOID:
- DO NOT search for partial JSON like "color":"#xxx" - include enough surrounding context to be unique
- Divi 5 breakpoint format is ALWAYS: "property":{"desktop":{"value":"..."}}
  WRONG: "color":"#001738"  RIGHT: "color":{"desktop":{"value":"#001738"}}
- Keep search strings 20-80 chars but UNIQUE in the markup
- NEVER include line breaks in search strings unless they exist in the markup
- Look at the ACTUAL markup content above - every character in your search must match EXACTLY
- When adding CSS rules, search for exactly "</style>" (the closing tag)

IMPORTANT RULES:
1. Use search/replace patches. Find an exact string in the markup and specify its replacement.
2. Keep patches SMALL and TARGETED. Max 16 patches per iteration.
3. Make sure the "search" string is unique and exists exactly as-is in the markup.
4. DO NOT remove or modify EXISTING CSS rules in the <style> block. Only ADD new rules before </style>.
5. DO NOT add new HTML elements or convert Divi 5 blocks to Gutenberg/HTML.
6. Focus on the TOP 3-5 most impactful changes. Quality over quantity.

Respond with JSON:
{"patches":[{"search":"exact string to find","replace":"replacement string","description":"what this fixes"}]}`;

        } else {
          // Gutenberg: use line-based edits
          formattedMarkup = currentMarkup
            .replace(/(<!-- wp:[^\n]*?-->)/g, '\n$1\n')
            .replace(/(<!-- \/wp:[^\n]*?-->)/g, '\n$1\n')
            .replace(/(<\/div>)/g, '$1\n')
            .replace(/(<div[^>]*>)/g, '\n$1')
            .split('\n')
            .filter((l: string) => l.trim())
            .join('\n');
          const markupLines = formattedMarkup.split('\n');
          const numberedMarkup = markupLines.map((line: string, i: number) => `${i + 1}| ${line}`).join('\n');

          fixPrompt = `Fix this WordPress page markup to better match the Figma design.

${imageContext}

Iteration ${currentIteration}/${maxLoops} - Current VQA score: ${lastScore}% (target: ${threshold}%)

Current markup (${markupLines.length} lines, each prefixed with line number):
\`\`\`
${numberedMarkup}
\`\`\`

Visual differences to fix (${sortedDiffs.length} issues, priority order):
${sortedDiffs.map((d: any, i: number) => `${i + 1}. [${d.severity.toUpperCase()}] ${d.area}: ${d.description}${d.suggestedFix ? `\n   Suggested fix: ${d.suggestedFix}` : ''}`).join('\n')}
${layoutIssuesContext}

RULES:
1. Return an array of line edits. Each edit specifies a line number and the new content for that line.
2. To replace a line, specify {"line": N, "content": "new line content"}.
3. To insert new lines after a line, specify {"line": N, "insert_after": "new lines to insert"}.
4. To delete a line, specify {"line": N, "content": ""}.
5. Use inline styles for visual fixes (colors, spacing, fonts, layout).
6. Line numbers refer to the numbers shown in the markup above (1-based).
7. Make sure responsive styles are preserved (flexbox, max-width, etc.)
8. Focus on the most impactful changes first - fix layout, colors, fonts, spacing.

Respond with JSON:
{"edits":[{"line":N,"content":"replacement line content","description":"what this fixes"}]}`;
        }

        const fixResult = await callPageForgeAgent(supabase, buildId, 'pageforge_vqa_fix', 'vqa_fix_loop',
          getSystemPrompt('pageforge_vqa'),
          fixPrompt,
          anthropic, {
            maxTokens: 24000,
            images: images.length > 0 ? images : undefined,
          }
        );

        // Save markup before edits for potential rollback
        previousMarkup = currentMarkup;
        let fixApplied = false;
        try {
          const jsonMatch = fixResult.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            // Search/replace patches (PRIMARY for Divi 5, fallback for Gutenberg)
            if (parsed.patches && Array.isArray(parsed.patches) && parsed.patches.length > 0) {
              let patchedMarkup = currentMarkup;
              let appliedCount = 0;
              let skippedCount = 0;
              const iterationFailedPatches: Array<{ search: string; description: string }> = [];
              for (const patch of parsed.patches) {
                if (patch.search && patch.replace !== undefined) {
                  if (patchedMarkup.includes(patch.search)) {
                    patchedMarkup = patchedMarkup.replace(patch.search, patch.replace);
                    appliedCount++;
                    allChanges.push(patch.description || 'Applied patch');
                  } else {
                    // Try fuzzy matching before giving up
                    const fuzzy = fuzzyPatchMatch(patchedMarkup, patch.search);
                    if (fuzzy.found) {
                      patchedMarkup = patchedMarkup.replace(fuzzy.normalizedSearch, patch.replace);
                      appliedCount++;
                      allChanges.push(`${patch.description || 'Applied patch'} (fuzzy matched)`);
                      console.log(`[pageforge] Fuzzy-matched patch: "${patch.search.substring(0, 80)}..."`);
                    } else {
                      skippedCount++;
                      iterationFailedPatches.push({
                        search: patch.search.substring(0, 200),
                        description: patch.description || 'unknown fix',
                      });
                    }
                  }
                }
              }
              // Store failed patches for feedback in next iteration
              if (iterationFailedPatches.length > 0) {
                failedPatches.push(...iterationFailedPatches.map(fp => ({ ...fp, iteration: currentIteration })));
              }
              if (appliedCount > 0) {
                currentMarkup = patchedMarkup;
                fixApplied = true;
                console.log(`[pageforge] Applied ${appliedCount}/${parsed.patches.length} patches (${skippedCount} skipped - search string not found)`);
              }
            }
            // Line-based editing approach (PRIMARY for Gutenberg)
            else if (parsed.edits && Array.isArray(parsed.edits) && parsed.edits.length > 0) {
              const lines = formattedMarkup.split('\n');
              let appliedCount = 0;
              const insertions: Array<{ afterLine: number; content: string }> = [];

              for (const edit of parsed.edits) {
                const lineIdx = (edit.line || 0) - 1; // convert 1-based to 0-based
                if (lineIdx >= 0 && lineIdx < lines.length) {
                  if (edit.content !== undefined) {
                    lines[lineIdx] = edit.content;
                    appliedCount++;
                  }
                  if (edit.insert_after) {
                    insertions.push({ afterLine: lineIdx, content: edit.insert_after });
                    appliedCount++;
                  }
                  allChanges.push(edit.description || `Line ${edit.line} edit`);
                }
              }

              // Apply insertions in reverse order to preserve line numbers
              insertions.sort((a, b) => b.afterLine - a.afterLine);
              for (const ins of insertions) {
                const newLines = ins.content.split('\n');
                lines.splice(ins.afterLine + 1, 0, ...newLines);
              }

              if (appliedCount > 0) {
                currentMarkup = lines.join('\n');
                fixApplied = true;
                console.log(`[pageforge] Applied ${appliedCount}/${parsed.edits.length} line edits`);
              } else {
                console.warn(`[pageforge] No valid line edits (${parsed.edits.length} edits, none in range)`);
              }
            }
            // Full markup fallback
            else if (parsed.fixedMarkup && parsed.fixedMarkup.length > currentMarkup.length * 0.5) {
              currentMarkup = parsed.fixedMarkup;
              allChanges.push(...(parsed.changesApplied || []));
              fixApplied = true;
            }
          }
        } catch (parseErr) {
          console.warn(`[pageforge] Failed to parse fix result:`, parseErr instanceof Error ? parseErr.message : String(parseErr));
        }

        if (!fixApplied) {
          console.warn(`[pageforge] Fix iteration ${currentIteration} produced no valid markup change`);
          stallCount++;
          if (stallCount >= 4) {
            console.log('[pageforge] 4 consecutive failed fix attempts, stopping');
            break;
          }
          continue;
        }

        // 3.5. Validate block structure integrity after edits (Divi 5)
        if ((build.page_builder || 'gutenberg') === 'divi5') {
          const openBlocks = (currentMarkup.match(/<!-- wp:divi\//g) || []).length;
          const closeBlocks = (currentMarkup.match(/<!-- \/wp:divi\//g) || []).length;
          if (openBlocks !== closeBlocks) {
            console.warn(`[pageforge] Block structure broken after edits (${openBlocks} open, ${closeBlocks} close) - rolling back`);
            currentMarkup = previousMarkup || currentMarkup;
            fixApplied = false;
            stallCount++;
            if (stallCount >= 4) break;
            continue;
          }
        }

        // 4. Re-deploy with fixed markup (converts to Divi 5 if needed)
        if (build.wp_page_id && siteProfile.wp_username && siteProfile.wp_app_password) {
          const fixBuilder = build.page_builder || 'gutenberg';
          const wpClient = createWpClient({ restUrl: siteProfile.wp_rest_url, username: siteProfile.wp_username, appPassword: siteProfile.wp_app_password });
          const deployedContent = prepareMarkupForDeploy(currentMarkup, fixBuilder);
          await wpUpdatePage(wpClient, build.wp_page_id, { content: deployedContent });
          // Verify WP update took effect by reading back the page
          try {
            const verifyResp = await fetch(`${wpClient.config.restUrl}/pages/${build.wp_page_id}?context=edit&_fields=content,modified`, { headers: wpClient.headers });
            if (verifyResp.ok) {
              const verifyData = await verifyResp.json();
              const savedContent = verifyData?.content?.raw || verifyData?.content?.rendered || '';
              const savedLen = savedContent.length;
              const deployedLen = deployedContent.length;
              if (Math.abs(savedLen - deployedLen) > deployedLen * 0.5) {
                console.warn(`[pageforge] WP content mismatch: deployed ${deployedLen} chars, saved ${savedLen} chars`);
              } else {
                console.log(`[pageforge] WP update verified: ${savedLen} chars saved (modified: ${verifyData?.modified || 'unknown'})`);
              }
            }
          } catch (verifyErr) {
            console.warn('[pageforge] WP verify read failed:', verifyErr instanceof Error ? verifyErr.message : String(verifyErr));
          }
        }

        // 5. Wait for WP to process the update and Divi CSS to render
        // 12s gives Divi 5 enough time to rebuild CSS cache (8s was insufficient for complex pages)
        await new Promise(resolve => setTimeout(resolve, 12000));

        // 6. Re-capture desktop screenshot with cache-busting
        // Add timestamp to URL to prevent WP/CDN/browser cache from serving stale page
        const cacheBustUrl = draftUrl + (draftUrl.includes('?') ? '&' : '?') + `_cb=${Date.now()}`;
        let newWpDesktop: string | null = null;
        try {
          const newShots = await captureScreenshots(cacheBustUrl);
          newWpDesktop = newShots.desktop || null;
          // If screenshot is suspiciously small (< 50KB), wait and retry
          if (newWpDesktop && Buffer.from(newWpDesktop, 'base64').length < 50000) {
            console.log('[pageforge] Screenshot looks small, waiting 5s and retrying...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            const retryShots = await captureScreenshots(cacheBustUrl);
            if (retryShots.desktop) newWpDesktop = retryShots.desktop;
          }
          // Staleness check: if screenshot is identical to previous capture, WP hasn't updated yet
          if (newWpDesktop && currentWpScreenshot && newWpDesktop === currentWpScreenshot) {
            console.log('[pageforge] Screenshot identical to previous - WP may not have updated, waiting 5s and retrying...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            const staleRetryShots = await captureScreenshots(cacheBustUrl + `&_cb2=${Date.now()}`);
            if (staleRetryShots.desktop && staleRetryShots.desktop !== currentWpScreenshot) {
              newWpDesktop = staleRetryShots.desktop;
              console.log('[pageforge] Retry captured different screenshot - using it');
            } else {
              console.log('[pageforge] Screenshot still identical after retry - proceeding anyway');
            }
          }
        } catch (err) {
          console.warn('[pageforge] Failed to recapture WP screenshot:', err);
        }

        // 6.5 Screenshot diff logging - track whether screenshots actually change
        if (newWpDesktop) {
          const screenshotHash = newWpDesktop.substring(0, 100) + newWpDesktop.substring(newWpDesktop.length - 100);
          const screenshotChanged = screenshotHash !== lastScreenshotHash;
          console.log(`[pageforge] Screenshot ${screenshotChanged ? 'CHANGED' : 'UNCHANGED'} (hash: ${screenshotHash.substring(0, 20)}...)`);
          lastScreenshotHash = screenshotHash;
        }

        // 7. Re-compare desktop against Figma
        let newScore = lastScore;
        let newDiffs: any[] = [];

        if (figmaDesktop && newWpDesktop) {
          try {
            const compareResult = await callPageForgeAgent(supabase, buildId, 'pageforge_vqa', 'vqa_fix_loop',
              getSystemPrompt('pageforge_vqa'),
              `Re-evaluate after fix iteration ${currentIteration}. Compare the full-page Figma design against the WordPress page.

Image 1: Figma design (reference - the original design)
Image 2: WordPress page (after fix iteration ${currentIteration})

Previous score was ${lastScore}%. Check if the fixes improved the match.

IMPORTANT: The images may have different heights/proportions. Focus on whether the SAME SECTIONS and CONTENT exist in both, not on exact pixel alignment.

SCORING INSTRUCTIONS:
- Score the WordPress page FRESH by comparing it directly to the Figma design using the rubric below.
- The page was just modified with CSS and attribute fixes. Look CAREFULLY for visual changes.
- Previous score was ${lastScore}% - this is ONLY for your reference. Do NOT simply return this number.
- Evaluate EACH category independently against the Figma reference image.
- If the WordPress page now matches Figma better in any category, the score MUST increase.
- Return your honest assessment. A 2-5% improvement per iteration is normal and expected.
${sectionMapContext}
Score EACH category 0-100, then calculate weighted average:
1. SECTIONS (25%): Are all major sections from Figma present in WP? Missing section = -10 per.
2. BACKGROUNDS (20%): Do section backgrounds match Figma colors exactly? Overlays, gradients, images?
3. TYPOGRAPHY (20%): Correct fonts, sizes, weights, colors on headings and body text?
4. LAYOUT (15%): Correct column counts, card grids, alignment, full-width sections?
5. IMAGES (10%): Real images visible, correct positions, no broken/placeholder?
6. POLISH (10%): Buttons styled, footer present, CTAs visible, responsive-ready?

Final score = sections*0.25 + backgrounds*0.20 + typography*0.20 + layout*0.15 + images*0.10 + polish*0.10

DIVI 5 CSS CLASS STRUCTURE (use these in suggestedFix, NOT made-up class names):
- Sections: .et_pb_section_0, .et_pb_section_1, .et_pb_section_2, etc. (0-indexed, top to bottom)
- Rows: .et_pb_row (or .et_pb_row_N for specific rows)
- Columns: .et_pb_column
- Text modules: .et_pb_text_inner (wraps text content)
- Blurb modules: .et_pb_blurb_content (wraps blurb cards)
- Headings: .et_pb_section_N h1, .et_pb_section_N h2, etc.
- Buttons: .et_pb_button
- Images: .et_pb_image_wrap img
The page has a <style> block at the top with CSS fallback rules. Suggested fixes should target these real selectors.

Score 0-100. Respond with JSON:
{"score":N,"categoryScores":{"sections":N,"backgrounds":N,"typography":N,"layout":N,"images":N,"polish":N},"differences":[{"area":"...","severity":"critical|major|minor","description":"...","suggestedFix":"CSS rule using real Divi 5 selectors, e.g.: .et_pb_section_0 { background-color: #001738 !important; }"}]}`,
              anthropic, {
                images: [
                  { data: figmaDesktop, mimeType: 'image/jpeg' },
                  { data: newWpDesktop, mimeType: 'image/jpeg' },
                ],
              }
            );

            const jsonMatch = compareResult.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              newScore = parsed.score || lastScore;
              newDiffs = parsed.differences || [];
              // Log category scores for debugging
              if (parsed.categoryScores) {
                const cs = parsed.categoryScores;
                console.log(`[pageforge] Category scores: sec=${cs.sections} bg=${cs.backgrounds} typ=${cs.typography} lay=${cs.layout} img=${cs.images} pol=${cs.polish}`);
              }
            }
          } catch (err) {
            console.warn('[pageforge] Re-comparison failed:', err);
          }
        }

        scoreHistory.push({ iteration: currentIteration, score: newScore });
        const improvement = newScore - lastScore;

        console.log(`[pageforge] Iteration ${currentIteration}: score ${lastScore}% -> ${newScore}% (${improvement >= 0 ? '+' : ''}${improvement}%)`);

        // ROLLBACK: If score dropped significantly, revert to previous markup
        if (improvement < -5 && previousMarkup) {
          console.log(`[pageforge] Score dropped ${Math.abs(improvement)}% - rolling back to previous markup`);
          currentMarkup = previousMarkup;
          newScore = lastScore; // restore previous score
          // Re-deploy the rolled-back markup
          if (build.wp_page_id && siteProfile.wp_username && siteProfile.wp_app_password) {
            const fixBuilder = build.page_builder || 'gutenberg';
            const wpClient = createWpClient({ restUrl: siteProfile.wp_rest_url, username: siteProfile.wp_username, appPassword: siteProfile.wp_app_password });
            await wpUpdatePage(wpClient, build.wp_page_id, { content: prepareMarkupForDeploy(currentMarkup, fixBuilder) });
          }
          rollbackCount++;
          if (rollbackCount >= 2) {
            console.log(`[pageforge] 2 rollbacks - fix loop is unstable, stopping at ${newScore}%`);
            await postBuildMessage(supabase, buildId,
              `VQA fix loop stopped: edits are unstable (2 rollbacks), best score ${newScore}%`,
              'vqa_fix_loop');
            break;
          }
        }

        await postBuildMessage(supabase, buildId,
          `Fix iteration ${currentIteration}/${maxLoops}: score ${lastScore}% -> ${newScore}% (${improvement >= 0 ? '+' : ''}${improvement}%)${newScore >= threshold ? ' - PASSED!' : ''}`,
          'vqa_fix_loop');

        // 8. Update build state
        await supabase.from('pageforge_builds').update({
          vqa_fix_iteration: currentIteration,
          vqa_score_desktop: newScore,
          vqa_score_overall: newScore, // Desktop is primary during fix loop
          updated_at: new Date().toISOString(),
        }).eq('id', buildId);

        await updateBuildArtifacts(supabase, buildId, 'markup_generation', { ...markupData, markup: currentMarkup });

        // Update comparison data for next iteration
        comparisonData = {
          results: { desktop: { score: newScore, differences: newDiffs } },
          overallScore: newScore,
          passed: newScore >= threshold,
          threshold,
          fixSuggestions: newDiffs.filter((d: any) => d.suggestedFix).map((d: any) => d.suggestedFix),
        };
        await updateBuildArtifacts(supabase, buildId, 'vqa_comparison', comparisonData);

        // 9. Check if passed
        if (newScore >= threshold) {
          console.log(`[pageforge] VQA PASSED at iteration ${currentIteration}: ${newScore}% >= ${threshold}%`);
          break;
        }

        // 10. Stall detection: if score didn't improve at all for 6 consecutive iterations
        // (AI scoring has ~4% noise, so 4 iterations was too aggressive)
        if (improvement <= 0) {
          stallCount++;
          if (stallCount >= 6) {
            console.log(`[pageforge] Score stalled for 6 iterations (${newScore}%), stopping fix loop`);
            await postBuildMessage(supabase, buildId,
              `VQA fix loop stopped: score plateaued at ${newScore}% after ${currentIteration} iterations`,
              'vqa_fix_loop');
            break;
          }
        } else {
          stallCount = 0;
        }

        lastScore = newScore;
      }

      // Final full 3-breakpoint comparison after all fixes
      if (currentIteration > 0) {
        try {
          const finalShots = await captureScreenshots(draftUrl);
          await updateBuildArtifacts(supabase, buildId, 'vqa_capture', {
            ...artifacts.vqa_capture,
            wpScreenshots: finalShots,
          });

          // Actually score tablet and mobile with AI instead of hardcoding
          const finalDesktop = comparisonData.overallScore || lastScore;
          let tabletScore = 0;
          let mobileScore = 0;

          for (const bp of ['tablet', 'mobile'] as const) {
            const wpImg = finalShots[bp];
            if (!wpImg) continue;
            const width = bp === 'tablet' ? 768 : 375;
            try {
              const bpResult = await callPageForgeAgent(supabase, buildId, 'pageforge_vqa', 'vqa_fix_loop',
                getSystemPrompt('pageforge_vqa'),
                `Evaluate this WordPress page screenshot at ${bp.toUpperCase()} (${width}px) for responsive quality.
Image 1: WordPress page rendered at ${width}px width.
Check: content visible/readable, layouts stack properly, no horizontal scroll, font sizes appropriate, images sized correctly, spacing reasonable, buttons tappable.
Score 0-100 (100 = perfect responsive behavior).
Respond with JSON: {"score":N,"differences":[{"area":"...","severity":"critical|major|minor","description":"..."}]}`,
                anthropic, { images: [{ data: wpImg, mimeType: 'image/jpeg' }] }
              );
              const jsonMatch = bpResult.text.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (bp === 'tablet') tabletScore = parsed.score || 70;
                else mobileScore = parsed.score || 70;
              } else {
                if (bp === 'tablet') tabletScore = 75;
                else mobileScore = 75;
              }
            } catch (err) {
              console.warn(`[pageforge] Final ${bp} scoring failed:`, err);
              if (bp === 'tablet') tabletScore = 70;
              else mobileScore = 70;
            }
          }

          const finalOverall = Math.round(finalDesktop * 0.7 + tabletScore * 0.15 + mobileScore * 0.15);
          console.log(`[pageforge] Final scores: D=${finalDesktop} T=${tabletScore} M=${mobileScore} Overall=${finalOverall}`);

          await supabase.from('pageforge_builds').update({
            vqa_score_overall: finalOverall,
            vqa_score_tablet: tabletScore,
            vqa_score_mobile: mobileScore,
            updated_at: new Date().toISOString(),
          }).eq('id', buildId);
        } catch (err) {
          console.warn('[pageforge] Final screenshot capture failed:', err);
        }
      }

      await updateBuildArtifacts(supabase, buildId, 'vqa_fix_loop', {
        iterations: currentIteration,
        changesApplied: allChanges,
        maxLoops,
        scoreHistory,
        finalScore: lastScore,
        threshold,
      });

      console.log(`[pageforge] VQA fix loop complete: ${currentIteration} iterations, final score: ${lastScore}%`);
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 10: FUNCTIONAL QA - Links, responsive, Lighthouse, a11y
    // -----------------------------------------------------------------------
    case 'functional_qa': {
      const deployData = artifacts.deploy_draft;
      if (!deployData?.draftUrl) throw new Error('Missing deploy_draft artifacts');

      const pageUrl = deployData.draftUrl;

      // Link validation
      const linkCheck = await runLinkValidation(pageUrl);

      // Lighthouse audit (local Chrome via chrome-launcher)
      let lighthouseScores = { performance: 0, accessibility: 0, bestPractices: 0, seo: 0 };
      try {
        const lighthouse = (await import('lighthouse')).default;
        const chromeLauncher = await import('chrome-launcher');
        if (!process.env.CHROME_PATH) {
          process.env.CHROME_PATH = puppeteer.executablePath();
        }
        const chrome = await chromeLauncher.launch({
          chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
        });
        try {
          const lhResult = await lighthouse(pageUrl, {
            port: chrome.port,
            output: 'json',
            logLevel: 'error',
            onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
          });
          if (lhResult?.lhr) {
            const cats = lhResult.lhr.categories || {};
            lighthouseScores = {
              performance: Math.round((cats.performance?.score || 0) * 100),
              accessibility: Math.round((cats.accessibility?.score || 0) * 100),
              bestPractices: Math.round((cats['best-practices']?.score || 0) * 100),
              seo: Math.round((cats.seo?.score || 0) * 100),
            };
          }
        } finally {
          await chrome.kill();
        }
      } catch (err) {
        console.warn('[pageforge] Lighthouse failed:', err instanceof Error ? err.message : err);
      }

      // Update build with scores
      await supabase.from('pageforge_builds').update({
        lighthouse_performance: lighthouseScores.performance,
        lighthouse_accessibility: lighthouseScores.accessibility,
        lighthouse_best_practices: lighthouseScores.bestPractices,
        lighthouse_seo: lighthouseScores.seo,
        qa_checks_passed: (linkCheck.passed ? 1 : 0) + Object.values(lighthouseScores).filter(s => s >= 80).length,
        qa_checks_failed: (linkCheck.passed ? 0 : 1) + Object.values(lighthouseScores).filter(s => s < 80).length,
        qa_checks_total: 5,
        updated_at: new Date().toISOString(),
      }).eq('id', buildId);

      await updateBuildArtifacts(supabase, buildId, 'functional_qa', { linkCheck, lighthouseScores });
      console.log(`[pageforge] QA: links=${linkCheck.passed ? 'pass' : 'fail'}, LH P=${lighthouseScores.performance} A=${lighthouseScores.accessibility}`);
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 11: SEO CONFIG - Meta tags, headings, Yoast
    // -----------------------------------------------------------------------
    case 'seo_config': {
      const markupData = artifacts.markup_generation;
      const markup = markupData?.markup || '';

      // Generate meta tags via AI
      const contentPreview = markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 2000);
      const metaResult = await callPageForgeAgent(supabase, buildId, 'pageforge_seo_meta', 'seo_config',
        getSystemPrompt('pageforge_seo'),
        `Generate SEO meta tags for "${build.page_title}".\n\nContent: ${contentPreview}\n\nRespond with JSON: {"metaTitle":"...","metaDesc":"...","focusKeyphrase":"...","ogTitle":"...","ogDesc":"..."}`,
        anthropic
      );

      let meta = { metaTitle: build.page_title.slice(0, 60), metaDesc: '', focusKeyphrase: '', ogTitle: build.page_title, ogDesc: '' };
      try {
        const jsonMatch = metaResult.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) meta = { ...meta, ...JSON.parse(jsonMatch[0]) };
      } catch { /* use defaults */ }

      // Validate heading hierarchy
      const headingIssues: string[] = [];
      const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
      const headings: Array<{ level: number; text: string }> = [];
      let match;
      while ((match = headingRegex.exec(markup)) !== null) {
        headings.push({ level: parseInt(match[1]), text: match[2].replace(/<[^>]+>/g, '').trim().slice(0, 50) });
      }
      const h1Count = headings.filter(h => h.level === 1).length;
      if (h1Count === 0) headingIssues.push('Missing H1');
      if (h1Count > 1) headingIssues.push(`Multiple H1s (${h1Count})`);
      let lastLevel = 0;
      for (const h of headings) {
        if (h.level > lastLevel + 1 && lastLevel > 0) headingIssues.push(`Skip H${lastLevel}->H${h.level}`);
        lastLevel = h.level;
      }

      // Configure Yoast if enabled
      let yoastConfigured = false;
      if (build.wp_page_id && siteProfile.yoast_enabled && siteProfile.wp_username && siteProfile.wp_app_password) {
        try {
          const wpClient = createWpClient({ restUrl: siteProfile.wp_rest_url, username: siteProfile.wp_username, appPassword: siteProfile.wp_app_password });
          await wpUpdateYoast(wpClient, build.wp_page_id, meta);
          yoastConfigured = true;
        } catch (err) {
          console.warn('[pageforge] Yoast config failed:', err);
        }
      }

      await updateBuildArtifacts(supabase, buildId, 'seo_config', { meta, headingIssues, headingsValid: headingIssues.length === 0, yoastConfigured });
      console.log(`[pageforge] SEO: meta="${meta.metaTitle}", headings=${headingIssues.length === 0 ? 'valid' : headingIssues.join(', ')}, yoast=${yoastConfigured}`);
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 12: REPORT GENERATION - AI compiles final report
    // -----------------------------------------------------------------------
    case 'report_generation': {
      // Fetch all agent calls
      const { data: agentCalls } = await supabase.from('pageforge_agent_calls')
        .select('*').eq('build_id', buildId).order('created_at', { ascending: true });

      // Re-fetch build for latest scores
      const { data: latestBuild } = await supabase.from('pageforge_builds').select('*').eq('id', buildId).single();
      const b = latestBuild as PageForgeBuild;

      const result = await callPageForgeAgent(supabase, buildId, 'pageforge_report', 'report_generation',
        getSystemPrompt('pageforge_orchestrator'),
        `Compile a final build report.\n\nBuild: ${b.page_title} (${b.page_builder})\nVQA: D=${b.vqa_score_desktop}% T=${b.vqa_score_tablet}% M=${b.vqa_score_mobile}% Overall=${b.vqa_score_overall}%\nLighthouse: P=${b.lighthouse_performance} A=${b.lighthouse_accessibility} BP=${b.lighthouse_best_practices} SEO=${b.lighthouse_seo}\nQA: ${b.qa_checks_passed}/${b.qa_checks_total} passed\nCost: $${(b.total_cost_usd || 0).toFixed(4)}\nAgent Calls: ${agentCalls?.length || 0}\nVQA Fix Iterations: ${b.vqa_fix_iteration}\nDraft: ${b.wp_draft_url || 'N/A'}\n\nCompile a clear report for the AM to share with the client.`,
        anthropic
      );

      await updateBuildArtifacts(supabase, buildId, 'report_generation', { report: result.text });
      console.log(`[pageforge] Final report generated`);
      break;
    }

    default:
      console.warn(`[pageforge] Unknown phase: ${phase}`);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Auto-split mega-sections: When the AI generates too few top-level wp:group blocks,
 * this function finds h2 headings that should be section boundaries and wraps content
 * between them into separate wp:group blocks.
 */
function autoSplitMegaSections(markup: string): string {
  // Find all wp:heading blocks with level 2 (these are section boundaries)
  // Pattern: <!-- wp:heading {"level":2 ...} --> or <!-- wp:heading --> (default h2)
  const lines = markup.split('\n');

  // Find indices of h2 heading comment blocks
  const h2Indices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Match wp:heading with level 2, or wp:heading without explicit level (defaults to h2)
    if (line.match(/<!-- wp:heading\s*(\{[^}]*"level"\s*:\s*2[^}]*\})?\s*-->/)) {
      h2Indices.push(i);
    }
    // Also match raw <h2 tags
    if (line.match(/<h2[\s>]/i) && !line.match(/<!-- wp:heading/)) {
      h2Indices.push(i);
    }
  }

  if (h2Indices.length < 3) return markup; // Not enough h2s to split meaningfully

  // Strategy: Find the opening/closing of the outermost wp:group blocks
  // Then split interior content at h2 boundaries into new top-level groups

  // Simpler approach: Just ensure each h2 starts a new top-level wp:group
  // Find runs of content between h2s and wrap each in its own group

  // Extract the background style from the parent group if available
  const defaultGroupOpen = '<!-- wp:group {"layout":{"type":"constrained"}} -->\n<div class="wp-block-group" style="width:100%;max-width:100%">';
  const defaultGroupClose = '</div>\n<!-- /wp:group -->';

  const darkGroupOpen = '<!-- wp:group {"layout":{"type":"constrained"}} -->\n<div class="wp-block-group" style="width:100%;max-width:100%;background-color:#001738;color:#ffffff;padding:60px 0">';

  // Build new markup by splitting at h2 boundaries
  // First, find the content before the first h2 (likely hero section) - leave as-is
  // Then, for each h2, create a new wp:group containing everything until the next h2

  const resultParts: string[] = [];
  let inGroup = false;
  let currentGroupLines: string[] = [];
  let groupDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track wp:group nesting depth
    if (trimmed.match(/<!-- wp:group/)) groupDepth++;
    if (trimmed.match(/<!-- \/wp:group/)) groupDepth--;

    // Check if this is an h2 at group depth > 0 (nested h2 that should be a section boundary)
    const isH2 = h2Indices.includes(i);

    if (isH2 && groupDepth > 0 && currentGroupLines.length > 20) {
      // Close the current section and start a new one
      // Insert a group close before this h2, and a group open at the h2
      currentGroupLines.push(defaultGroupClose);
      resultParts.push(currentGroupLines.join('\n'));
      currentGroupLines = [defaultGroupOpen];
    }

    currentGroupLines.push(line);
  }

  if (currentGroupLines.length > 0) {
    resultParts.push(currentGroupLines.join('\n'));
  }

  return resultParts.join('\n');
}

// Resize a base64 image so neither dimension exceeds maxDim (Anthropic limit: 8000px)
// Always outputs JPEG for consistent handling
async function resizeIfNeeded(base64: string, maxDim = 7500): Promise<string> {
  const buf = Buffer.from(base64, 'base64');
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) return base64;
  const needsResize = meta.width > maxDim || meta.height > maxDim;
  if (needsResize) {
    const ratio = Math.min(maxDim / meta.width, maxDim / meta.height);
    const newW = Math.round(meta.width * ratio);
    const newH = Math.round(meta.height * ratio);
    const resized = await sharp(buf).resize(newW, newH, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer();
    console.log(`[pageforge] Resized screenshot from ${meta.width}x${meta.height} to ${newW}x${newH} (${Math.round(resized.length / 1024)}KB)`);
    return resized.toString('base64');
  }
  // Convert to JPEG even if no resize needed (consistent format, smaller size)
  const jpg = await sharp(buf).jpeg({ quality: 90 }).toBuffer();
  return jpg.toString('base64');
}

// Categorize VQA diffs for strategic fix ordering (structure first, then polish)
type DiffCategory = 'layout' | 'background' | 'typography' | 'spacing' | 'images' | 'other';
function categorizeDiff(diff: { area?: string; description?: string; suggestedFix?: string }): DiffCategory {
  const text = `${diff.area || ''} ${diff.description || ''} ${diff.suggestedFix || ''}`.toLowerCase();
  if (text.match(/layout|section.*missing|mega.?section|column|grid|structure|block|split|narrow|width.*content/)) return 'layout';
  if (text.match(/background|bg.?color|background.?color|overlay|gradient|dark.*section|light.*section/)) return 'background';
  if (text.match(/font|text.*color|heading|h[1-6]|typography|font.?size|font.?weight|font.?family|line.?height/)) return 'typography';
  if (text.match(/spacing|padding|margin|gap|vertical.*rhythm|white.?space/)) return 'spacing';
  if (text.match(/image|img|photo|icon|logo|broken.*image|missing.*image|placeholder/)) return 'images';
  return 'other';
}

// Fuzzy patch matching: tries normalized whitespace and quote variants before giving up
function fuzzyPatchMatch(markup: string, search: string): { found: boolean; normalizedSearch: string } {
  // Strategy 1: exact match (already tried by caller)
  if (markup.includes(search)) return { found: true, normalizedSearch: search };

  // Strategy 2: normalize whitespace (collapse multiple spaces/newlines to single space)
  const normalizedSearch = search.replace(/\s+/g, ' ').trim();
  if (normalizedSearch !== search) {
    const escapedParts = normalizedSearch.split(' ').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const flexRegex = new RegExp(escapedParts.join('\\s+'));
    const match = markup.match(flexRegex);
    if (match) return { found: true, normalizedSearch: match[0] };
  }

  // Strategy 3: swap quote styles (single <-> double)
  const quoteSwitched = search.replace(/'/g, '"');
  if (quoteSwitched !== search && markup.includes(quoteSwitched)) return { found: true, normalizedSearch: quoteSwitched };
  const quoteSwitched2 = search.replace(/"/g, "'");
  if (quoteSwitched2 !== search && markup.includes(quoteSwitched2)) return { found: true, normalizedSearch: quoteSwitched2 };

  return { found: false, normalizedSearch: search };
}

// Sanitize WordPress markup: strip <style> blocks, raw CSS, and problematic patterns
// Script that forces WP/Divi parent containers to be full-width.
// SURGICAL: only removes width constraints + side padding. Keeps centering intact.
// Must be prepended to content on EVERY page update (deploy + fix loop).
const FULLWIDTH_SCRIPT = `<!-- wp:html -->
<style>
/* PageForge full-width override - CSS beats Divi theme constraints immediately */
#page-container, #main-content, #left-area, #content-area,
.container, .entry-content, article.page, article.type-page,
.et-l, .et-l--post, .et_builder_inner_content,
.et_pb_section, .et_pb_row, .et_pb_column,
.et_pb_text, .et_pb_text_inner, .et_pb_post_content,
.et_pb_module {
  max-width: 100% !important;
  width: 100% !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  float: none !important;
}
/* Hide WP default widgets/sidebar */
.widget_recent_entries,.widget_recent_comments,.widget_categories,
.widget_archive,.widget_meta,.sidebar,.widget-area,
#sidebar,aside.widget-area { display: none !important; }
/* Divi nav/header - hide if present (PageForge pages have their own header) */
#main-header, #top-header { display: none !important; }
#et-main-area { padding-top: 0 !important; }
</style>
<script>
(function(){
  function fix(){
    document.querySelectorAll('.et_pb_row,.et_pb_section,.et_pb_column,.et_pb_text,.et_pb_text_inner,.et_pb_module,.et-l,.et-l--post,.et_builder_inner_content,.container,.entry-content,article.page,article.type-page,#page-container,#main-content,#left-area,#content-area').forEach(function(el){
      el.style.setProperty('max-width','100%','important');
      el.style.setProperty('width','100%','important');
      el.style.setProperty('padding-left','0','important');
      el.style.setProperty('padding-right','0','important');
      el.style.setProperty('margin-left','0','important');
      el.style.setProperty('margin-right','0','important');
      el.style.setProperty('float','none','important');
    });
    document.querySelectorAll('.widget_recent_entries,.widget_recent_comments,.widget_categories,.widget_archive,.widget_meta,.sidebar,.widget-area,#sidebar,aside.widget-area').forEach(function(el){
      el.style.setProperty('display','none','important');
    });
  }
  fix();
  document.addEventListener('DOMContentLoaded',fix);
  window.addEventListener('load',fix);
  setTimeout(fix,500);setTimeout(fix,2000);setTimeout(fix,5000);
})();
</script>
<!-- /wp:html -->`;

// Full-width overrides for Divi 5 native blocks.
// Row/section sizing is controlled via JSON attributes, but the WP/Divi parent
// containers (article, .container, #left-area) still constrain width without CSS overrides.
const DIVI5_HEADER_SCRIPT = `<!-- wp:html -->
<style>
/* PageForge: Force parent containers to full-width */
#page-container, #main-content, #left-area, #content-area,
.container, .entry-content, article.page, article.type-page,
.et-l, .et-l--post, .et_builder_inner_content {
  max-width: 100% !important;
  width: 100% !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  float: none !important;
}
/* Divi 5 sections: full viewport width */
.et_pb_section { max-width: 100% !important; width: 100% !important; }
/* Divi 5 rows: 1200px max centered within full-width sections */
.et_pb_row { width: 100% !important; max-width: 1200px !important; margin-left: auto !important; margin-right: auto !important; }
/* Hide WP default widgets/sidebar */
.widget_recent_entries,.widget_recent_comments,.widget_categories,.widget_archive,.widget_meta,.sidebar,.widget-area,#sidebar,aside.widget-area { display: none !important; }
/* Hide Divi header/nav */
#main-header, #top-header { display: none !important; }
#et-main-area { padding-top: 0 !important; }
/* Remove default Divi text module padding so our inline styles control spacing */
.et_pb_text_inner { padding: 0 !important; }
</style>
<script>
(function(){
  function fix(){
    document.querySelectorAll('#page-container,#main-content,#left-area,#content-area,.container,.entry-content,article.page,article.type-page,.et-l,.et-l--post,.et_builder_inner_content').forEach(function(el){
      el.style.setProperty('max-width','100%','important');
      el.style.setProperty('width','100%','important');
      el.style.setProperty('padding-left','0','important');
      el.style.setProperty('padding-right','0','important');
      el.style.setProperty('margin-left','0','important');
      el.style.setProperty('margin-right','0','important');
      el.style.setProperty('float','none','important');
    });
    document.querySelectorAll('.et_pb_section').forEach(function(el){
      el.style.setProperty('max-width','100%','important');
      el.style.setProperty('width','100%','important');
    });
    document.querySelectorAll('.et_pb_row').forEach(function(el){
      el.style.setProperty('width','100%','important');
    });
    document.querySelectorAll('.sidebar,.widget-area,#sidebar,aside.widget-area').forEach(function(el){
      el.style.setProperty('display','none','important');
    });
  }
  fix();
  document.addEventListener('DOMContentLoaded',fix);
  window.addEventListener('load',fix);
  setTimeout(fix,500);setTimeout(fix,2000);setTimeout(fix,5000);
})();
</script>
<!-- /wp:html -->`;

/** Sanitize markup and prepare for deploy. For Divi 5, converts Gutenberg to native Divi 5 blocks. */
function prepareMarkupForDeploy(markup: string, builder: string = 'gutenberg'): string {
  const sanitized = sanitizeMarkup(markup, builder === 'divi5');
  if (builder === 'divi5') {
    // Divi 5 markup is already in native block format from markup_generation
    return DIVI5_HEADER_SCRIPT + '\n' + sanitized;
  }
  return FULLWIDTH_SCRIPT + sanitized;
}

function sanitizeMarkup(markup: string, preservePageForgeCss: boolean = false): string {
  let clean = markup;

  if (preservePageForgeCss) {
    // For Divi 5: preserve PageForge CSS blocks (section backgrounds, spacing fallback)
    // Extract them, sanitize the rest, then re-inject
    const pageforgeBlocks: string[] = [];
    clean = clean.replace(/<!-- wp:html -->\s*<style>\s*\/\* PageForge:[\s\S]*?<\/style>\s*<!-- \/wp:html -->/gi, (match) => {
      pageforgeBlocks.push(match);
      return `__PAGEFORGE_CSS_${pageforgeBlocks.length - 1}__`;
    });

    // Strip non-PageForge styles
    clean = clean.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    clean = clean.replace(/@media\s*\([^)]*\)\s*\{[^}]*\{[^}]*\}[^}]*\}/g, '');
    clean = clean.replace(/\.[a-zA-Z_][\w-]*\s*\{[^}]*\}/g, '');
    clean = clean.replace(/<!-- wp:html -->\s*<style[\s\S]*?<\/style>\s*<!-- \/wp:html -->/gi, '');

    // Re-inject PageForge CSS blocks
    for (let i = 0; i < pageforgeBlocks.length; i++) {
      clean = clean.replace(`__PAGEFORGE_CSS_${i}__`, pageforgeBlocks[i]);
    }
  } else {
    // Remove <style> tags and their content (Divi/WP themes override anyway)
    clean = clean.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    // Remove any raw CSS that leaked into visible content (e.g. @media queries as text)
    clean = clean.replace(/@media\s*\([^)]*\)\s*\{[^}]*\{[^}]*\}[^}]*\}/g, '');
    // Remove orphaned CSS selectors that might render as text
    clean = clean.replace(/\.[a-zA-Z_][\w-]*\s*\{[^}]*\}/g, '');
    // Remove <!-- wp:html --> blocks wrapping style tags (common AI mistake)
    clean = clean.replace(/<!-- wp:html -->\s*<style[\s\S]*?<\/style>\s*<!-- \/wp:html -->/gi, '');
  }
  // Ensure no inline style attributes contain raw @media (invalid inline CSS)
  // These render as visible text in some browsers
  clean = clean.replace(/style="[^"]*@media[^"]*"/gi, (match) => {
    // Strip @media portion from inline style, keep the rest
    return match.replace(/@media[^;"]*/g, '');
  });

  // Ensure full-width: inject viewport-width styles on top-level wp:group alignfull divs
  clean = clean.replace(
    /(<div\s+class="wp-block-group\s+alignfull"\s+style=")/gi,
    (match) => {
      if (match.includes('100vw')) return match;
      return match.replace(/style="/, 'style="width:100%;box-sizing:border-box;');
    }
  );

  // Boost hero overlay opacity: if any overlay div uses rgba with opacity < 0.8, increase to 0.85
  clean = clean.replace(
    /background:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*(0\.\d+)\)/g,
    (match, r, g, b, a) => {
      const opacity = parseFloat(a);
      // Only boost dark overlays (r+g+b < 200) with low opacity
      if (parseInt(r) + parseInt(g) + parseInt(b) < 200 && opacity < 0.8) {
        return `background:rgba(${r},${g},${b},0.88)`;
      }
      return match;
    }
  );

  // De-duplicate sections: if the same heading text appears in multiple wp:group blocks, remove duplicates
  const sectionBlocks = clean.split(/(<!-- wp:group)/);
  const seenHeadings = new Set<string>();
  const deduped: string[] = [];
  for (let i = 0; i < sectionBlocks.length; i++) {
    const block = sectionBlocks[i];
    // Extract the first heading text from this block
    const headingMatch = block.match(/<h[1-6][^>]*>([^<]{10,})<\/h[1-6]>/i);
    if (headingMatch) {
      const headingText = headingMatch[1].trim().toLowerCase().replace(/\s+/g, ' ');
      if (seenHeadings.has(headingText)) {
        // Find the end of this wp:group block and skip it
        // The block starts with "<!-- wp:group" and ends with "<!-- /wp:group -->"
        const endIdx = block.indexOf('<!-- /wp:group -->');
        if (endIdx >= 0) {
          // Skip this entire block, keep anything after the closing tag
          deduped.push(block.substring(endIdx + '<!-- /wp:group -->'.length));
          continue;
        }
      }
      seenHeadings.add(headingText);
    }
    deduped.push(block);
  }
  clean = deduped.join('');

  return clean;
}

// ============================================================================
// DIVI 5 NATIVE BLOCK BUILDER
// Builds proper divi/section > divi/row > divi/column > module structure
// from structured JSON page data. Each element gets its own Divi module
// so the page is fully editable in Divi 5's visual builder.
// ============================================================================

interface Divi5Section {
  name: string;
  background?: { color?: string; image?: string; overlay?: number };
  padding?: { top?: string; bottom?: string };
  elements?: Divi5Element[];
  columns?: number;
  cards?: Divi5Card[];
}

interface Divi5Element {
  type: 'heading' | 'text' | 'image' | 'button' | 'divider' | 'code';
  text?: string;
  content?: string;
  level?: string;
  src?: string;
  alt?: string;
  url?: string;
  font?: { family?: string; size?: string; weight?: string; color?: string; lineHeight?: string; textAlign?: string };
  style?: { bgColor?: string; textColor?: string; padding?: string; borderRadius?: string; textAlign?: string };
}

interface Divi5Card {
  title?: string;
  text?: string;
  image?: string;
  icon?: string;
  url?: string;
}

const D5V = "5.0.1"; // Divi 5 builder version
const D5_AREA = { desktop: { value: "post_content" } };

function d5Val(v: any) { return { desktop: { value: v } }; }

function buildDivi5Section(attrs: Record<string, any>, innerBlocks: string): string {
  return `<!-- wp:divi/section ${JSON.stringify(attrs)} -->\n${innerBlocks}\n<!-- /wp:divi/section -->`;
}

function buildDivi5Row(attrs: Record<string, any>, innerBlocks: string): string {
  return `<!-- wp:divi/row ${JSON.stringify(attrs)} -->\n${innerBlocks}\n<!-- /wp:divi/row -->`;
}

function buildDivi5Column(attrs: Record<string, any>, innerBlocks: string): string {
  return `<!-- wp:divi/column ${JSON.stringify(attrs)} -->\n${innerBlocks}\n<!-- /wp:divi/column -->`;
}

function buildDivi5Text(html: string, fontOpts?: { family?: string; size?: string; weight?: string; color?: string; lineHeight?: string; textAlign?: string }): string {
  const attrs: Record<string, any> = {
    builderVersion: D5V, modulePreset: "default", themeBuilderArea: D5_AREA,
    content: { innerContent: d5Val(html) }
  };
  if (fontOpts && (fontOpts.family || fontOpts.color || fontOpts.size)) {
    const fontVal: Record<string, string> = {};
    if (fontOpts.family) fontVal.family = fontOpts.family;
    if (fontOpts.color) fontVal.color = fontOpts.color;
    if (fontOpts.size) fontVal.size = fontOpts.size;
    if (fontOpts.weight) fontVal.weight = fontOpts.weight;
    if (fontOpts.lineHeight) fontVal.lineHeight = fontOpts.lineHeight;
    if (fontOpts.textAlign) fontVal.textAlign = fontOpts.textAlign;
    attrs.content.decoration = { bodyFont: { body: { font: d5Val(fontVal) } } };
  }
  // Module-level text alignment
  if (fontOpts?.textAlign) {
    attrs.module = attrs.module || {};
    attrs.module.advanced = { ...attrs.module.advanced, textAlign: d5Val(fontOpts.textAlign) };
  }
  return `<!-- wp:divi/text ${JSON.stringify(attrs)} -->\n<!-- /wp:divi/text -->`;
}

function buildDivi5Image(src: string, alt?: string, borderRadius?: string): string {
  const attrs: Record<string, any> = {
    builderVersion: D5V, modulePreset: "default", themeBuilderArea: D5_AREA,
    image: { innerContent: d5Val({ src, alt: alt || "", title: "" }) },
    module: { decoration: { sizing: { width: d5Val("100%") } } }
  };
  if (borderRadius) {
    attrs.module.decoration.border = {
      radius: { topLeft: d5Val(borderRadius), topRight: d5Val(borderRadius), bottomLeft: d5Val(borderRadius), bottomRight: d5Val(borderRadius) }
    };
  }
  return `<!-- wp:divi/image ${JSON.stringify(attrs)} -->\n<!-- /wp:divi/image -->`;
}

function buildDivi5Button(text: string, url: string, style?: { bgColor?: string; textColor?: string; padding?: string; borderRadius?: string }): string {
  const attrs: Record<string, any> = {
    builderVersion: D5V, modulePreset: "default", themeBuilderArea: D5_AREA,
    button: {
      innerContent: d5Val({ text, linkUrl: url || "#", linkTarget: "_self" }),
      decoration: {
        button: d5Val({ enable: "on" }),
        background: { color: d5Val(style?.bgColor || "#2ea3f2"), useColor: d5Val("on") },
        font: { font: d5Val({ color: style?.textColor || "#ffffff", size: "16px", weight: "600" }) },
        spacing: { padding: { top: d5Val("14px"), bottom: d5Val("14px"), left: d5Val("32px"), right: d5Val("32px") } },
        border: { radius: { topLeft: d5Val(style?.borderRadius || "8px"), topRight: d5Val(style?.borderRadius || "8px"), bottomLeft: d5Val(style?.borderRadius || "8px"), bottomRight: d5Val(style?.borderRadius || "8px") } }
      }
    },
    module: { advanced: { alignment: d5Val("center") } }
  };
  return `<!-- wp:divi/button ${JSON.stringify(attrs)} -->\n<!-- /wp:divi/button -->`;
}

function buildDivi5Blurb(title: string, content: string, imageOrIcon?: string, titleFont?: Record<string, string>, bodyFont?: Record<string, string>): string {
  const attrs: Record<string, any> = {
    builderVersion: D5V, modulePreset: "default", themeBuilderArea: D5_AREA,
    title: {
      innerContent: d5Val({ text: title, url: "", target: "_self" }),
      decoration: { font: { font: d5Val({ headingLevel: "h4", color: titleFont?.color || "#333333", size: titleFont?.size || "20px", weight: titleFont?.weight || "700" }) } }
    },
    content: {
      innerContent: d5Val(content),
      decoration: { bodyFont: { body: { font: d5Val({ color: bodyFont?.color || "#666666", size: bodyFont?.size || "14px", lineHeight: bodyFont?.lineHeight || "1.8em" }) } } }
    },
    module: {
      decoration: {
        background: { color: d5Val("#ffffff"), useColor: d5Val("on") },
        border: { radius: { topLeft: d5Val("12px"), topRight: d5Val("12px"), bottomLeft: d5Val("12px"), bottomRight: d5Val("12px") } },
        boxShadow: { horizontal: d5Val("0px"), vertical: d5Val("4px"), blur: d5Val("20px"), spread: d5Val("0px"), color: d5Val("rgba(0,0,0,0.08)") },
        spacing: { padding: { top: d5Val("30px"), bottom: d5Val("30px"), left: d5Val("30px"), right: d5Val("30px") } }
      }
    }
  };
  // Image or icon
  if (imageOrIcon && (imageOrIcon.startsWith('http') || imageOrIcon.startsWith('FIGMA_IMG'))) {
    attrs.imageIcon = {
      innerContent: d5Val({ useIcon: "off", src: imageOrIcon, alt: title, animation: "top" }),
      advanced: { placement: d5Val("top"), alignment: d5Val("center"), width: { image: d5Val("100%") } },
      decoration: { border: { radius: { topLeft: d5Val("8px"), topRight: d5Val("8px"), bottomLeft: d5Val("0px"), bottomRight: d5Val("0px") } } }
    };
  }
  return `<!-- wp:divi/blurb ${JSON.stringify(attrs)} -->\n<!-- /wp:divi/blurb -->`;
}

function buildDivi5Divider(): string {
  return `<!-- wp:divi/divider {"builderVersion":"${D5V}","modulePreset":"default","themeBuilderArea":${JSON.stringify(D5_AREA)}} -->\n<!-- /wp:divi/divider -->`;
}

function buildDivi5Code(html: string): string {
  const attrs = { builderVersion: D5V, modulePreset: "default", themeBuilderArea: D5_AREA, content: { innerContent: d5Val(html) } };
  return `<!-- wp:divi/code ${JSON.stringify(attrs)} -->\n<!-- /wp:divi/code -->`;
}

/** Build a complete Divi 5 page from structured section data */
function buildDivi5Markup(sections: Divi5Section[], primaryFont: string, accentColor: string): string {
  const output: string[] = [];

  for (const section of sections) {
    // Section attributes - sizing and spacing use per-property breakpoint wrapping
    const sectionAttrs: Record<string, any> = {
      builderVersion: D5V, modulePreset: "default", themeBuilderArea: D5_AREA,
      module: {
        meta: { adminLabel: d5Val(section.name || "Section") },
        decoration: {
          sizing: { width: d5Val("100%") },
          spacing: {
            padding: {
              top: d5Val(section.padding?.top || "80px"),
              bottom: d5Val(section.padding?.bottom || "80px"),
              left: d5Val("0px"),
              right: d5Val("0px")
            }
          }
        }
      }
    };

    // Section background - each sub-property is individually breakpoint-wrapped
    if (section.background?.color || section.background?.image) {
      const bg: Record<string, any> = {};
      if (section.background.color) {
        bg.color = d5Val(section.background.color);
        bg.useColor = d5Val("on");
      }
      if (section.background.image) {
        bg.image = d5Val(section.background.image);
      }
      sectionAttrs.module.decoration.background = bg;
    }

    // Row attributes - each sizing sub-property needs its own breakpoint wrapper
    const rowAttrs: Record<string, any> = {
      builderVersion: D5V, modulePreset: "default", themeBuilderArea: D5_AREA,
      module: { decoration: { sizing: { width: d5Val("100%"), maxWidth: d5Val("1200px") } } }
    };

    // Multi-column layout
    if (section.columns && section.columns > 1 && section.cards && section.cards.length > 0) {
      const gridCols = Array(section.columns).fill("1fr").join(" ");
      rowAttrs.module.advanced = { grid: { gridTemplateColumns: d5Val(gridCols) } };

      // Build column per card
      const colBlocks: string[] = [];
      for (let c = 0; c < section.cards.length; c++) {
        const card = section.cards[c];
        const colAttrs = { builderVersion: D5V, modulePreset: "default", themeBuilderArea: D5_AREA };
        const blurb = buildDivi5Blurb(
          card.title || `Card ${c + 1}`,
          card.text ? `<p>${card.text}</p>` : "<p></p>",
          card.image,
          { color: section.background?.color && isDarkBg(section.background.color) ? "#ffffff" : "#333333" },
          { color: section.background?.color && isDarkBg(section.background.color) ? "#cccccc" : "#666666" }
        );
        colBlocks.push(buildDivi5Column(colAttrs, blurb));
      }

      // Section heading row (if elements include headings)
      let headingRow = "";
      if (section.elements) {
        const headingModules: string[] = [];
        for (const el of section.elements) {
          headingModules.push(buildElementModule(el, primaryFont, section.background));
        }
        if (headingModules.length > 0) {
          const headRowAttrs = { builderVersion: D5V, modulePreset: "default", themeBuilderArea: D5_AREA, module: { decoration: { sizing: { width: d5Val("100%"), maxWidth: d5Val("1200px") } } } };
          const headColAttrs = { builderVersion: D5V, modulePreset: "default", themeBuilderArea: D5_AREA };
          headingRow = buildDivi5Row(headRowAttrs, buildDivi5Column(headColAttrs, headingModules.join('\n')));
        }
      }

      const cardsRow = buildDivi5Row(rowAttrs, colBlocks.join('\n'));
      output.push(buildDivi5Section(sectionAttrs, headingRow + '\n' + cardsRow));

    } else {
      // Single column - stack elements vertically
      const modules: string[] = [];
      if (section.elements) {
        for (const el of section.elements) {
          modules.push(buildElementModule(el, primaryFont, section.background));
        }
      }
      const colAttrs = { builderVersion: D5V, modulePreset: "default", themeBuilderArea: D5_AREA };
      const colBlock = buildDivi5Column(colAttrs, modules.join('\n'));
      output.push(buildDivi5Section(sectionAttrs, buildDivi5Row(rowAttrs, colBlock)));
    }
  }

  // Generate CSS fallback for backgrounds, spacing, and font loading that
  // Divi 5 server-side renderer doesn't reliably process from JSON attributes.
  // Visual builder still reads JSON attrs; this CSS is for the front-end render.
  const cssFallback: string[] = [];

  // Collect unique fonts from all sections for Google Fonts loading
  const usedFonts = new Set<string>();
  // Sanitize font family: strip quotes, strip CSS fallback stack (e.g. "'Poppins', sans-serif" -> "Poppins")
  const cleanFontFamily = (f: string): string => f.replace(/['"]/g, '').split(',')[0].trim();
  const addFont = (f: string) => {
    const clean = cleanFontFamily(f);
    if (clean && clean !== 'inherit' && clean !== 'sans-serif' && clean !== 'serif' && clean !== 'monospace') {
      usedFonts.add(clean);
    }
  };
  if (primaryFont) addFont(primaryFont);
  for (const section of sections) {
    if (section.elements) {
      for (const el of section.elements) {
        if (el.font?.family) addFont(el.font.family);
      }
    }
    if (section.cards) {
      for (const card of section.cards) {
        if ((card as any).font?.family) addFont((card as any).font.family);
      }
    }
  }

  // Google Fonts import - in a SEPARATE style block so a font-load failure
  // cannot break the CSS rules in the main fallback block
  let fontImportBlock = '';
  if (usedFonts.size > 0) {
    const fontFamilies = [...usedFonts].map(f => f.replace(/\s+/g, '+')).map(f => `family=${f}:wght@400;500;600;700`).join('&');
    fontImportBlock = `<!-- wp:html -->\n<style>\n/* PageForge: Google Fonts */\n@import url('https://fonts.googleapis.com/css2?${fontFamilies}&display=swap');\n</style>\n<!-- /wp:html -->\n\n`;
  }

  sections.forEach((section, i) => {
    const sel = `.et_pb_section_${i}`;
    const rules: string[] = [];
    if (section.background?.color) {
      rules.push(`background-color: ${section.background.color} !important`);
    }
    if (section.background?.image) {
      // Include FIGMA_IMG placeholders in CSS - they get globally replaced with real WP URLs
      // before rendering (both in JSON attrs AND in CSS). This is essential for hero backgrounds.
      rules.push(`background-image: url(${section.background.image}) !important`);
      rules.push(`background-size: cover !important`);
      rules.push(`background-position: center !important`);
    }
    if (section.padding?.top || section.padding?.bottom) {
      rules.push(`padding-top: ${section.padding?.top || '80px'} !important`);
      rules.push(`padding-bottom: ${section.padding?.bottom || '80px'} !important`);
    }
    if (rules.length > 0) {
      cssFallback.push(`${sel} { ${rules.join('; ')} }`);
    }
  });

  // Global text color fallback per section (dark bg = white text, light bg = dark text)
  sections.forEach((section, i) => {
    if (section.background?.color && isDarkBg(section.background.color)) {
      cssFallback.push(`.et_pb_section_${i} .et_pb_text_inner, .et_pb_section_${i} .et_pb_blurb_content { color: #ffffff !important; }`);
      cssFallback.push(`.et_pb_section_${i} h1, .et_pb_section_${i} h2, .et_pb_section_${i} h3, .et_pb_section_${i} h4 { color: #ffffff !important; }`);
    }
  });

  // Background image overlay for sections with images + text (improves text readability)
  // Use section's own rgba color as overlay if available, otherwise light gradient
  sections.forEach((section, i) => {
    const hasImage = !!section.background?.image;
    const hasText = (section.elements && section.elements.length > 0) || (section.cards && section.cards.length > 0);
    if (hasImage && hasText) {
      // If section has rgba background color, use it as the overlay (it's the designer's intent)
      // and remove the background-color from the section itself to prevent double-darkening
      const bgColor = section.background?.color || '';
      const isRgba = bgColor.includes('rgba');
      const overlayBg = isRgba
        ? bgColor  // Use the designer's chosen overlay color
        : 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.35) 100%)'; // Light default
      cssFallback.push(`.et_pb_section_${i} { position: relative; }`);
      cssFallback.push(`.et_pb_section_${i}::before { content: ''; position: absolute; inset: 0; background: ${overlayBg}; z-index: 0; pointer-events: none; }`);
      cssFallback.push(`.et_pb_section_${i} > .et_pb_row { position: relative; z-index: 1; }`);
      // If we used rgba as overlay, clear background-color so it doesn't double up
      if (isRgba) {
        cssFallback.push(`.et_pb_section_${i} { background-color: transparent !important; }`);
      }
      // Ensure white text on image backgrounds
      cssFallback.push(`.et_pb_section_${i} .et_pb_text_inner, .et_pb_section_${i} .et_pb_blurb_content { color: #ffffff !important; }`);
      cssFallback.push(`.et_pb_section_${i} h1, .et_pb_section_${i} h2, .et_pb_section_${i} h3 { color: #ffffff !important; text-shadow: 0 2px 4px rgba(0,0,0,0.3); }`);
    }
  });

  // Grid gap CSS for multi-column sections (target last row - the cards row, not the heading row)
  sections.forEach((section, i) => {
    if (section.columns && section.columns > 1) {
      cssFallback.push(`.et_pb_section_${i} .et_pb_row:last-of-type { display: grid !important; grid-template-columns: repeat(${section.columns}, 1fr) !important; gap: 30px !important; }`);
      cssFallback.push(`@media (max-width: 768px) { .et_pb_section_${i} .et_pb_row:last-of-type { grid-template-columns: 1fr !important; gap: 20px !important; } }`);
    }
  });

  // Global font family fallback (ensures Google Fonts actually apply to all text)
  if (primaryFont && primaryFont !== 'inherit') {
    cssFallback.push(`.et_pb_text_inner, .et_pb_blurb_content, .et_pb_button, h1, h2, h3, h4, h5, h6, p { font-family: '${primaryFont}', sans-serif !important; }`);
  }

  // Typography refinements
  cssFallback.push(`h1, h2, h3 { line-height: 1.2 !important; letter-spacing: -0.02em !important; }`);
  cssFallback.push(`p, .et_pb_text_inner { line-height: 1.6 !important; }`);
  cssFallback.push(`.et_pb_button { display: inline-block !important; padding: 12px 30px !important; border-radius: 8px !important; font-weight: 600 !important; text-decoration: none !important; transition: all 0.3s ease !important; }`);
  cssFallback.push(`.et_pb_button:hover { transform: translateY(-2px) !important; box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important; }`);
  cssFallback.push(`.et_pb_image_wrap img { border-radius: 8px; object-fit: cover; }`);
  cssFallback.push(`.et_pb_blurb_content { border-radius: 12px; overflow: hidden; }`);

  // Responsive base
  cssFallback.push(`@media (max-width: 768px) { h1 { font-size: 32px !important; } h2 { font-size: 28px !important; } h3 { font-size: 22px !important; } .et_pb_section { padding-left: 20px !important; padding-right: 20px !important; } }`);

  let cssBlock = '';
  if (cssFallback.length > 0) {
    cssBlock = `<!-- wp:html -->\n<style>\n/* PageForge: backgrounds & text color fallback */\n${cssFallback.join('\n')}\n</style>\n<!-- /wp:html -->\n\n`;
  }

  return fontImportBlock + cssBlock + output.join('\n\n');
}

function buildElementModule(el: Divi5Element, primaryFont: string, bg?: { color?: string }): string {
  const isDark = bg?.color ? isDarkBg(bg.color) : false;
  const defaultTextColor = isDark ? "#ffffff" : "#333333";
  const defaultSubColor = isDark ? "#cccccc" : "#666666";

  switch (el.type) {
    case 'heading': {
      const level = el.level || 'h2';
      const html = `<${level}>${el.text || ''}</${level}>`;
      return buildDivi5Text(html, {
        family: el.font?.family || primaryFont,
        size: el.font?.size || (level === 'h1' ? '54px' : level === 'h2' ? '36px' : '24px'),
        weight: el.font?.weight || '700',
        color: el.font?.color || defaultTextColor,
        textAlign: el.font?.textAlign || el.style?.textAlign || 'center',
      });
    }
    case 'text': {
      const html = el.content || `<p>${el.text || ''}</p>`;
      return buildDivi5Text(html, {
        family: el.font?.family || primaryFont,
        size: el.font?.size || '16px',
        weight: el.font?.weight || '400',
        color: el.font?.color || defaultSubColor,
        lineHeight: el.font?.lineHeight || '1.6em',
        textAlign: el.font?.textAlign || el.style?.textAlign,
      });
    }
    case 'image':
      return buildDivi5Image(el.src || '', el.alt, el.style?.borderRadius || '8px');
    case 'button':
      return buildDivi5Button(el.text || 'Click Here', el.url || '#', el.style);
    case 'divider':
      return buildDivi5Divider();
    case 'code':
      return buildDivi5Code(el.content || '');
    default:
      return buildDivi5Text(`<p>${el.text || ''}</p>`);
  }
}

function isDarkBg(color: string): boolean {
  if (!color) return false;
  const hex = color.replace('#', '');
  if (hex.length === 6) {
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.4;
  }
  if (color.startsWith('rgba')) {
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) return (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255 < 0.4;
  }
  return false;
}

/** Legacy converter kept for fallback - wraps HTML in divi/code blocks instead of divi/text */
function convertGutenbergToDivi5(gutenbergMarkup: string): string {
  // Fallback: parse wp:group blocks and wrap each in divi/section > row > col > code
  const blocks: Array<{ content: string; bgColor: string | null }> = [];
  let depth = 0;
  let blockLines: string[] = [];
  let outsideLines: string[] = [];

  for (const line of gutenbergMarkup.split('\n')) {
    const trimmed = line.trim();
    if (/^<!-- wp:group\b/.test(trimmed)) {
      if (depth === 0) { outsideLines = []; blockLines = [line]; } else { blockLines.push(line); }
      depth++;
    } else if (/^<!-- \/wp:group\b/.test(trimmed)) {
      depth--;
      if (depth === 0 && blockLines.length > 0) {
        blockLines.push(line);
        const full = blockLines.join('\n');
        let bgColor: string | null = null;
        const jm = full.match(/<!-- wp:group \{(.*?)\} -->/);
        if (jm) { try { bgColor = JSON.parse(`{${jm[1]}}`).style?.color?.background || null; } catch {} }
        if (!bgColor) { const sm = full.match(/background-color:\s*([#\w]+(?:\([^)]+\))?)/); if (sm) bgColor = sm[1]; }
        const inner = full.replace(/<!-- wp:group\b[^-]*-->\s*/g, '').replace(/\s*<!-- \/wp:group -->/g, '').trim();
        blocks.push({ content: inner, bgColor });
        blockLines = [];
      } else { blockLines.push(line); }
    } else if (depth > 0) { blockLines.push(line); } else { outsideLines.push(line); }
  }

  return blocks.map((block, i) => {
    const secA: Record<string, any> = { builderVersion: D5V, modulePreset: "default", themeBuilderArea: D5_AREA, module: { meta: { adminLabel: d5Val(`Section ${i + 1}`) }, decoration: {} } };
    if (block.bgColor) secA.module.decoration.background = { color: d5Val(block.bgColor), useColor: d5Val("on") };
    const rowA = { builderVersion: D5V, modulePreset: "default", themeBuilderArea: D5_AREA, module: { decoration: { sizing: { width: d5Val("100%"), maxWidth: d5Val("1200px") } } } };
    const colA = { builderVersion: D5V, modulePreset: "default", themeBuilderArea: D5_AREA };
    const codeBlock = buildDivi5Code(block.content);
    return buildDivi5Section(secA, buildDivi5Row(rowA, buildDivi5Column(colA, codeBlock)));
  }).join('\n\n');
}

// Crop a base64 image into vertical segments for section-by-section VQA comparison
// segmentIndex: 0-based index of the segment to extract
// totalSegments: total number of segments to divide the image into
async function cropSegment(base64: string, segmentIndex: number, totalSegments: number): Promise<string> {
  const buf = Buffer.from(base64, 'base64');
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) return base64;

  const segHeight = Math.floor(meta.height / totalSegments);
  const top = segmentIndex * segHeight;
  // Last segment takes everything remaining (avoids rounding gaps)
  const height = segmentIndex === totalSegments - 1 ? meta.height - top : segHeight;

  const cropped = await sharp(buf)
    .extract({ left: 0, top, width: meta.width, height })
    .jpeg({ quality: 85 })
    .toBuffer();

  // Resize if the cropped segment is still too large for Anthropic
  const croppedMeta = await sharp(cropped).metadata();
  if (croppedMeta.width && croppedMeta.height && (croppedMeta.width > 7500 || croppedMeta.height > 7500)) {
    return resizeIfNeeded(cropped.toString('base64'));
  }

  console.log(`[pageforge] Cropped segment ${segmentIndex + 1}/${totalSegments}: ${meta.width}x${height} (${Math.round(cropped.length / 1024)}KB)`);
  return cropped.toString('base64');
}

async function captureScreenshots(pageUrl: string): Promise<Record<string, string | null>> {
  const screenshots: Record<string, string | null> = { desktop: null, tablet: null, mobile: null };
  const breakpoints: Record<string, number> = { desktop: 1440, tablet: 768, mobile: 375 };

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    for (const [bp, width] of Object.entries(breakpoints)) {
      try {
        const page = await browser.newPage();
        // Disable caching to always get fresh content after WP page updates
        await page.setCacheEnabled(false);
        await page.setExtraHTTPHeaders({ 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' });
        await page.setViewport({ width, height: 900 });
        await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 45000 });
        // Wait for Google Fonts and other web fonts to fully load
        try {
          await page.evaluate(() => (document as any).fonts?.ready);
        } catch { /* fonts API not available, fallback to timeout */ }
        await new Promise(r => setTimeout(r, 3000)); // extra settle time for large images + Divi CSS
        const buffer = await page.screenshot({ fullPage: true, type: 'png' });
        const rawBase64 = Buffer.from(buffer).toString('base64');
        console.log(`[pageforge] Screenshot ${bp} captured (${Math.round(Buffer.from(buffer).length / 1024)}KB)`);
        screenshots[bp] = await resizeIfNeeded(rawBase64);
        await page.close();
      } catch (err) {
        console.error(`[pageforge] Screenshot ${bp} failed:`, err);
      }
    }
  } catch (err) {
    console.error(`[pageforge] Puppeteer launch failed:`, err);
  } finally {
    if (browser) await browser.close();
  }
  return screenshots;
}

// Layout validation - checks that content uses full viewport width (not trapped in narrow column)
async function runLayoutValidation(pageUrl: string): Promise<{ passed: boolean; issues: string[]; avgContentWidth: number }> {
  const issues: string[] = [];
  let avgContentWidth = 0;

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 3000));

    const layoutData = await page.evaluate(() => {
      // Support both Gutenberg (wp-block-group) and Divi 5 (et_pb_section) DOM structures
      let groups = Array.from(document.querySelectorAll('.entry-content > .wp-block-group'));
      if (groups.length === 0) {
        // Divi 5 native blocks render as et_pb_section elements
        groups = Array.from(document.querySelectorAll('.et_pb_section'));
      }
      const sectionData = groups.map((g, i) => {
        const rect = g.getBoundingClientRect();
        // Find the widest content child
        const children = Array.from(g.children);
        let maxChildWidth = 0;
        for (const child of children) {
          const cr = child.getBoundingClientRect();
          if (cr.width > maxChildWidth) maxChildWidth = cr.width;
        }
        // Find any heading to identify the section
        const h = g.querySelector('h1,h2,h3');
        const heading = h ? h.textContent?.trim().substring(0, 40) : '(no heading)';
        // Check for multi-column grids used for centering (decorator columns)
        const grids = Array.from(g.querySelectorAll('*')).filter(el => {
          const cs = window.getComputedStyle(el);
          return cs.display === 'grid' && cs.gridTemplateColumns.split(' ').length === 3;
        }).map(el => ({
          cols: window.getComputedStyle(el).gridTemplateColumns,
          width: Math.round(el.getBoundingClientRect().width),
        }));
        return {
          heading,
          sectionWidth: Math.round(rect.width),
          contentWidth: Math.round(maxChildWidth),
          height: Math.round(rect.height),
          threeColGrids: grids,
        };
      });
      return { sectionData, totalSections: groups.length, viewportWidth: 1440 };
    });

    const { sectionData, totalSections } = layoutData;
    const contentWidths: number[] = [];

    // Check 1: Minimum section count
    if (totalSections < 5) {
      issues.push(`Only ${totalSections} top-level sections (expected 8-12). Content likely nested in mega-sections.`);
    }

    // Check 2: Content width utilization
    for (const s of sectionData) {
      contentWidths.push(s.contentWidth);
      if (s.contentWidth < 1000 && s.height > 200) {
        issues.push(`Section "${s.heading}" content is only ${s.contentWidth}px wide (minimum 1000px). Looks like narrow column.`);
      }
      // Check 3: Decorator 3-column grids (NOT equal-width content grids)
      for (const grid of s.threeColGrids) {
        const cols = grid.cols.split(' ').map((c: string) => parseFloat(c));
        if (cols.length === 3 && cols[0] > 100 && cols[2] > 100) {
          const centerWidth = cols[1];
          const sideAvg = (cols[0] + cols[2]) / 2;
          // Decorator pattern: center is much wider than sides (ratio > 1.5) with narrow sides
          // Equal content grid: all columns roughly same width (ratio ~1.0) - this is FINE
          const ratio = centerWidth / sideAvg;
          if (ratio > 1.5 && centerWidth < 800) {
            issues.push(`Section "${s.heading}" uses 3-column decorator grid (${grid.cols}) - center column only ${Math.round(centerWidth)}px. Must use max-width+margin:auto instead.`);
          }
        }
      }
    }

    // Check 4: Mega section detection (any section > 5000px tall)
    for (const s of sectionData) {
      if (s.height > 5000) {
        issues.push(`Section "${s.heading}" is ${s.height}px tall - likely a mega-section containing multiple conceptual sections. Split into separate wp:group blocks.`);
      }
    }

    avgContentWidth = contentWidths.length > 0 ? Math.round(contentWidths.reduce((a, b) => a + b, 0) / contentWidths.length) : 0;
    await page.close();
  } catch (err) {
    console.error('[pageforge] Layout validation failed:', err);
    issues.push('Layout validation could not run');
  } finally {
    if (browser) await browser.close();
  }

  const passed = issues.length === 0;
  console.log(`[pageforge] Layout validation: ${passed ? 'PASSED' : 'FAILED'} (${issues.length} issues, avg content width: ${avgContentWidth}px)`);
  if (issues.length > 0) {
    console.log(`[pageforge] Layout issues:\n  ${issues.join('\n  ')}`);
  }
  return { passed, issues, avgContentWidth };
}

async function runLinkValidation(pageUrl: string): Promise<{ passed: boolean; details: string; broken: number }> {
  try {
    const res = await fetch(pageUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { passed: false, details: `Page not reachable: ${res.status}`, broken: 0 };

    const html = await res.text();
    const linkRegex = /href=["']([^"']+)["']/gi;
    const links = new Set<string>();
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      if (href.startsWith('http') || href.startsWith('/')) {
        links.add(href.startsWith('/') ? new URL(href, pageUrl).href : href);
      }
    }

    let broken = 0;
    const linksToCheck = Array.from(links).slice(0, 20);
    for (const link of linksToCheck) {
      try {
        const lr = await fetch(link, { method: 'HEAD', signal: AbortSignal.timeout(5000), redirect: 'follow' });
        if (!lr.ok) broken++;
      } catch { broken++; }
    }

    return { passed: broken === 0, details: `${links.size} links, ${linksToCheck.length} checked, ${broken} broken`, broken };
  } catch (err) {
    return { passed: false, details: `Error: ${err instanceof Error ? err.message : String(err)}`, broken: 0 };
  }
}

function findUnclosedTags(html: string): string[] {
  const selfClosing = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area', 'base', 'col', 'embed', 'track', 'wbr']);
  const openTags: string[] = [];
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*\/?>/g;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const full = match[0], tag = match[1].toLowerCase();
    if (selfClosing.has(tag) || full.endsWith('/>')) continue;
    if (full.startsWith('</')) {
      const idx = openTags.lastIndexOf(tag);
      if (idx >= 0) openTags.splice(idx, 1);
    } else {
      openTags.push(tag);
    }
  }
  return Array.from(new Set(openTags)).slice(0, 5);
}

// ============================================================================
// BUILDER INSTRUCTIONS (inline constants)
// ============================================================================

const GUTENBERG_INSTRUCTIONS = `## Gutenberg Block Format - COMPLETE REFERENCE

### CRITICAL: FULL-WIDTH LAYOUT (MOST IMPORTANT RULE)
A script tag already handles forcing parent containers to 100% width. Your job is to ensure EVERY top-level section uses width:100%.

**EVERY top-level section** must use this EXACT pattern:
\`\`\`
<!-- wp:group {"align":"full"} -->
<div class="wp-block-group alignfull" style="width:100%;box-sizing:border-box;SECTION_STYLES_HERE">
<div style="max-width:1200px;margin:0 auto;padding:0 40px;box-sizing:border-box">
  CONTENT HERE
</div>
</div>
<!-- /wp:group -->
\`\`\`

The outer div MUST always have: width:100%;box-sizing:border-box
The inner div provides the centered content container with max-width:1200px.
Without width:100%, sections will be constrained by the theme's narrow container.

### CRITICAL STYLING RULES
1. EVERY element must have inline styles matching the Figma design exactly
2. Use the EXACT hex colors, font families, font sizes, and spacing from the design tokens
3. Set background-color, color, font-family, font-size, font-weight, line-height, padding, margin on EVERY element
4. Use CSS gap, flexbox, and grid for layouts - NEVER rely on WordPress defaults
5. Set explicit width/height on images and containers matching Figma dimensions

### Block Patterns

**Full-width section with background:**
<!-- wp:group {"align":"full"} -->
<div class="wp-block-group alignfull" style="width:100%;box-sizing:border-box;background-color:#001738;padding:80px 40px">
<div style="max-width:1200px;margin:0 auto">
  <!-- content here -->
</div>
</div>
<!-- /wp:group -->

**Hero section with background image:**
<!-- wp:group {"align":"full"} -->
<div class="wp-block-group alignfull" style="width:100%;box-sizing:border-box;position:relative;min-height:700px;background-image:url(IMAGE_URL);background-size:cover;background-position:center">
<div style="position:absolute;inset:0;background:rgba(0,23,56,0.7)"></div>
<div style="position:relative;z-index:1;max-width:1200px;margin:0 auto;padding:120px 40px;text-align:center">
  <h1 style="color:#ffffff;font-family:Poppins,sans-serif;font-size:clamp(32px,5vw,54px);font-weight:700;line-height:1.2;margin-bottom:24px">Headline</h1>
  <p style="color:#ffffff;font-family:Poppins,sans-serif;font-size:18px;line-height:1.6;max-width:600px;margin:0 auto 32px">Description text</p>
  <a style="display:inline-block;background-color:#cc2336;color:#ffffff;font-family:Poppins,sans-serif;font-size:16px;font-weight:600;padding:16px 40px;border-radius:8px;text-decoration:none">Get Started</a>
</div>
</div>
<!-- /wp:group -->

**Card grid (responsive 2-3 columns):**
<!-- wp:group {"align":"full"} -->
<div class="wp-block-group alignfull" style="width:100%;box-sizing:border-box;padding:80px 40px">
<div style="max-width:1200px;margin:0 auto">
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:32px">
    <div style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
      <img src="IMAGE_URL" style="width:100%;height:240px;object-fit:cover;display:block" alt="Description"/>
      <div style="padding:24px">
        <h3 style="font-family:Poppins,sans-serif;font-size:22px;font-weight:600;color:#001738;margin:0 0 12px;overflow:hidden;text-overflow:ellipsis">Card Title</h3>
        <p style="font-family:Poppins,sans-serif;font-size:16px;color:#555;line-height:1.6;margin:0">Card description</p>
      </div>
    </div>
  </div>
</div>
</div>
<!-- /wp:group -->

**Stats row (numbers/metrics displayed horizontally):**
<div style="display:flex;flex-wrap:wrap;justify-content:space-around;gap:40px;padding:40px 0">
  <div style="text-align:center">
    <div style="font-family:Poppins,sans-serif;font-size:48px;font-weight:700;color:#001738">24+</div>
    <div style="font-family:Poppins,sans-serif;font-size:16px;color:#555;margin-top:8px">Years Experience</div>
  </div>
  <div style="text-align:center">
    <div style="font-family:Poppins,sans-serif;font-size:48px;font-weight:700;color:#001738">11,000+</div>
    <div style="font-family:Poppins,sans-serif;font-size:16px;color:#555;margin-top:8px">Events Served</div>
  </div>
</div>

**Styled button (inline, no wp:button block):**
<a style="display:inline-block;background-color:#cc2336;color:#ffffff;font-family:Poppins,sans-serif;font-size:16px;font-weight:600;padding:16px 40px;border-radius:8px;text-decoration:none;cursor:pointer">Get Started</a>

**Testimonial card:**
<div style="background:#f8f8f8;border-radius:12px;padding:32px;display:flex;flex-direction:column;gap:16px;overflow:hidden">
  <div style="display:flex;gap:4px;color:#f59e0b;font-size:20px">★★★★★</div>
  <p style="font-family:Poppins,sans-serif;font-size:16px;color:#333;line-height:1.6;font-style:italic;margin:0">"Quote text here"</p>
  <div style="display:flex;align-items:center;gap:12px">
    <div style="width:48px;height:48px;border-radius:50%;background:#001738;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:18px;flex-shrink:0">AB</div>
    <div>
      <p style="font-family:Poppins,sans-serif;font-size:14px;font-weight:600;color:#001738;margin:0">Customer Name</p>
      <p style="font-family:Poppins,sans-serif;font-size:13px;color:#777;margin:0">Role / Company</p>
    </div>
  </div>
</div>

**Footer section (REQUIRED - must be last section):**
<!-- wp:group {"align":"full"} -->
<div class="wp-block-group alignfull" style="width:100%;box-sizing:border-box;background-color:#001738;padding:60px 40px 30px">
<div style="max-width:1200px;margin:0 auto">
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:40px;margin-bottom:40px">
    <div>
      <h4 style="font-family:Poppins,sans-serif;font-size:20px;font-weight:700;color:#ffffff;margin:0 0 16px">Company Name</h4>
      <p style="font-family:Poppins,sans-serif;font-size:14px;color:#ccc;line-height:1.8;margin:0">Brief company description providing context about the business.</p>
    </div>
    <div>
      <h4 style="font-family:Poppins,sans-serif;font-size:16px;font-weight:600;color:#ffffff;margin:0 0 16px">Quick Links</h4>
      <p style="font-family:Poppins,sans-serif;font-size:14px;color:#ccc;line-height:2.2;margin:0">Home<br/>Services<br/>About Us<br/>Gallery<br/>Contact</p>
    </div>
    <div>
      <h4 style="font-family:Poppins,sans-serif;font-size:16px;font-weight:600;color:#ffffff;margin:0 0 16px">Contact Us</h4>
      <p style="font-family:Poppins,sans-serif;font-size:14px;color:#ccc;line-height:2.2;margin:0">123 Business St, City, ST 12345<br/>Phone: (555) 123-4567<br/>Email: info@company.com<br/>Mon-Fri: 9am-6pm</p>
    </div>
  </div>
  <div style="border-top:1px solid rgba(255,255,255,0.15);padding-top:20px;text-align:center">
    <p style="font-family:Poppins,sans-serif;font-size:13px;color:#888;margin:0">© 2026 Company Name. All rights reserved.</p>
  </div>
</div>
</div>
<!-- /wp:group -->

**Gallery grid (uniform):**
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
  <div style="border-radius:8px;overflow:hidden"><img src="IMAGE_URL" style="width:100%;height:280px;object-fit:cover;display:block" alt="Gallery 1"/></div>
  <div style="border-radius:8px;overflow:hidden"><img src="IMAGE_URL" style="width:100%;height:280px;object-fit:cover;display:block" alt="Gallery 2"/></div>
  <div style="border-radius:8px;overflow:hidden"><img src="IMAGE_URL" style="width:100%;height:280px;object-fit:cover;display:block" alt="Gallery 3"/></div>
</div>

### Responsive Requirements
- Use grid-template-columns with auto-fill/minmax(280px,1fr) for responsive grids
- Buttons: padding:16px 32px, use <a> with inline styles, NOT wp:button blocks
- Font sizes: headings clamp(28px, 4vw, 54px), body 16-18px
- Section padding: clamp(40px, 8vw, 100px) top/bottom
- Image containers: width:100%, object-fit:cover, display:block
- Max-width:1200px on inner content containers, width:100% on outer wrappers

### FORBIDDEN - WILL BE STRIPPED AUTOMATICALLY
- NEVER use <style> tags or <!-- wp:html --> blocks containing CSS - they render as visible text
- NEVER put @media queries in the markup - use clamp() and minmax() in inline styles instead
- NEVER use placeholder SVGs for images - use real URLs or placehold.co
- NEVER use Unsplash or external stock photo URLs - use only images from the design
- NEVER leave default WordPress styling (gray backgrounds, system fonts)
- NEVER skip inline styles - EVERY element needs explicit styling
- NEVER include responsive CSS classes that rely on theme stylesheets
- NEVER use wp:cover blocks - use wp:group with background-image instead (wp:cover requires JS)
- NEVER use wp:buttons blocks - use plain <a> tags with inline styles instead

### OVERFLOW & LAYOUT SAFETY
- EVERY top-level section: width:100%;box-sizing:border-box;overflow:hidden
- Add overflow:hidden to all card containers and image wrappers
- Add text-overflow:ellipsis;overflow:hidden on card titles
- Images inside cards: width:100%;height:auto;display:block;object-fit:cover
- Grids: use minmax(280px,1fr) not fixed column counts, add overflow:hidden on grid container
- NEVER set font-size larger than the container width could hold`;

const DIVI5_INSTRUCTIONS = `## DIVI 5 NATIVE MODULES - Structured JSON Output
You are generating a structured JSON page description for a Divi 5 WordPress page.
Each element becomes its own editable Divi 5 visual builder module.
Do NOT output HTML or Gutenberg blocks. Output ONLY a JSON object.

### JSON Structure
{
  "sections": [
    {
      "name": "Hero",
      "background": { "color": "rgba(0,23,56,0.85)", "image": "FIGMA_IMG:1:234" },
      "padding": { "top": "120px", "bottom": "120px" },
      "elements": [
        { "type": "heading", "text": "Main Headline", "level": "h1", "font": { "size": "54px", "weight": "700", "color": "#ffffff" } },
        { "type": "text", "text": "Subtitle text", "font": { "size": "18px", "color": "#cccccc", "lineHeight": "1.6em" } },
        { "type": "button", "text": "Get Started", "url": "#contact", "style": { "bgColor": "#cc2336", "textColor": "#ffffff", "borderRadius": "8px" } }
      ]
    },
    {
      "name": "Services",
      "background": { "color": "#f5f5f5" },
      "columns": 3,
      "elements": [
        { "type": "heading", "text": "Our Services", "level": "h2", "font": { "size": "36px", "weight": "700", "color": "#333333" } }
      ],
      "cards": [
        { "title": "Service 1", "text": "Description", "image": "FIGMA_IMG:2:345" },
        { "title": "Service 2", "text": "Description", "image": "FIGMA_IMG:2:346" }
      ]
    }
  ]
}

### Element Types
- heading: { type: "heading", text, level: "h1"|"h2"|"h3", font: { size, weight, color, textAlign: "center"|"left"|"right" } }
- text: { type: "text", text (plain) OR content (HTML like "<p>...</p><ul><li>...</li></ul>"), font: { size, weight, color, lineHeight, textAlign: "center"|"left" } }
- image: { type: "image", src: "FIGMA_IMG:nodeId" or URL, alt: "description", style: { borderRadius: "8px" } }
- button: { type: "button", text, url, style: { bgColor, textColor, borderRadius } }
- divider: { type: "divider" }
- code: { type: "code", content: "<raw HTML>" } - ONLY for complex layouts that cannot be expressed with other types (e.g. multi-column footer HTML)

### Section Fields
- name: Label (Hero, Services, About, Gallery, Testimonials, CTA, Footer)
- background: { color: hex or rgba, image: FIGMA_IMG:id or URL }
  For dark overlays on hero images: use rgba color like "rgba(0,23,56,0.85)" combined with image
- padding: { top: "Npx", bottom: "Npx" } for vertical spacing
- elements: Array of elements for single-column content (headings, text, images, buttons)
- columns: Number (2-4) for card grid layouts
- cards: Array of { title, text, image, url } for multi-column card/feature grids

### Section Patterns
- Hero: Large h1 heading (48-60px), subtext, button. Dark background with image overlay.
- Stats/Numbers: Use columns (3-5) + cards where title=number ("24+"), text=label ("Years Experience")
- Services/Features: Section heading in elements[], then columns + cards with image/title/text
- Gallery: columns (3) + cards with image only (title optional)
- Testimonials: columns (2-3) + cards with title=name, text=quote
- CTA: Centered heading + text + button in elements[]
- Footer: Dark background, use a single "code" element type for multi-column HTML footer layout`;

