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
  figmaExtractTypography, figmaExtractTextContent, figmaTestConnection,
  type FigmaNode, type FigmaSection, type FigmaDesignTokens, type FigmaTextContent,
} from '../lib/figma-client.js';
import type { PageForgeSiteProfile, PageForgeBuild } from '../shared/types.js';
import { decryptFromHex } from '../lib/encryption.js';
import Anthropic from '@anthropic-ai/sdk';
import puppeteer from 'puppeteer';
import sharp from 'sharp';

// ============================================================================
// PAGEFORGE VPS WORKER
// Processes builds through the 26-phase pipeline with REAL agent logic.
// Desktop-first build, then mobile optimization via separate Figma file.
// Each phase calls actual APIs (Figma, WordPress, Browserless) and AI.
// ============================================================================

// Per-phase auto-retry config: how many times to retry before giving up
const PHASE_MAX_RETRIES: Record<string, number> = {
  preflight: 1,
  auto_name: 2,
  figma_analysis: 2,
  section_classification: 2,
  element_mapping_gate: 1,
  markup_generation: 2,
  markup_validation: 1,
  deploy_draft: 2,
  image_optimization: 3, // most flaky due to Figma API timeouts
  vqa_capture: 2,
  vqa_comparison: 2,
  vqa_fix_loop: 1,
  functional_qa: 2,
  mobile_markup_generation: 2,
  mobile_deploy: 2,
  mobile_vqa_capture: 2,
  mobile_vqa_comparison: 2,
  mobile_vqa_fix_loop: 1,
  mobile_functional_qa: 2,
  animation_detection: 1,
  animation_implementation: 2,
  seo_config: 2,
  report_generation: 1,
  final_review_gate: 0,    // gates never retry
  developer_review_gate: 0,
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
      // draft_review_gate: auto-approve (images aren't loaded yet, human review is pointless here)
      if (phase === 'draft_review_gate') {
        await supabase.from('pageforge_builds').update({
          draft_gate_decision: 'approve',
          updated_at: new Date().toISOString(),
        }).eq('id', build_id);
        console.log(`[pageforge] Draft review gate auto-approved (pre-image review skipped)`);
        await postBuildMessage(supabase, build_id,
          'Draft review gate auto-approved (images not yet loaded, review happens at developer gate).', phase);
        continue; // skip gate, proceed to next phase
      }

      // element_mapping_gate: run AI proposals first, then conditionally pause
      if (phase === 'element_mapping_gate') {
        const { data: currentBuild } = await supabase
          .from('pageforge_builds').select('*').eq('id', build_id).single();
        if (currentBuild) {
          await executeElementMappingProposal(
            build_id, siteProfile, currentBuild as PageForgeBuild, anthropic
          );
          // If user opted out of review, auto-approve and skip gate
          if (!currentBuild.review_element_mappings) {
            await supabase.from('pageforge_build_mappings')
              .update({ decision: 'approved', decided_at: new Date().toISOString() })
              .eq('build_id', build_id).eq('decision', 'pending');
            console.log(`[pageforge] Element mapping gate skipped (auto-approved)`);
            await postBuildMessage(supabase, build_id,
              'Element mappings auto-approved (review was not requested).', phase);
            continue; // skip gate, proceed to next phase
          }
        }
      }

      await supabase.from('pageforge_builds').update({
        status: phase, current_phase: i, updated_at: new Date().toISOString(),
      }).eq('id', build_id);

      await updateJobProgress(vps_job_id, {
        status: 'waiting',
        progress_message: `Waiting for ${phase.replace(/_/g, ' ')}`,
      });

      const gateNames: Record<string, string> = {
        element_mapping_gate: 'Element Mapping Review',
        draft_review_gate: 'Draft Review',
        final_review_gate: 'Final Review (Desktop + Mobile)',
        am_signoff_gate: 'AM Sign-off',
        developer_review_gate: 'Developer Review',
      };
      const gateName = gateNames[phase] || phase.replace(/_/g, ' ');
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
    // PHASE 2: DESIGN PREP - Font validation, layout extraction, mobile rules, tiered renaming
    // -----------------------------------------------------------------------
    case 'design_prep': {
      const designPrepResults: Record<string, any> = {};
      const preflightData = artifacts.preflight || {};
      const figmaWarnings: string[] = preflightData.figma_warnings || [];
      const fontData = preflightData.figma_fonts || {};
      const namingData = preflightData.figma_naming || {};
      const autoNameMap = artifacts.auto_name_map || {};

      // --- Sub-task 1: Font Validation ---
      const nonStandardFonts: string[] = fontData.nonStandard || [];
      const allUsedFonts: string[] = fontData.used || [];
      if (nonStandardFonts.length > 0) {
        console.log(`[pageforge] Design prep: Validating ${nonStandardFonts.length} fonts against Google Fonts...`);
        const fontMap = await validateFonts(nonStandardFonts, allUsedFonts);
        designPrepResults.font_map = fontMap;

        const available = fontMap.validated.filter(f => f.status === 'google_fonts').map(f => f.fontFamily);
        const substituted = fontMap.validated.filter(f => f.status === 'unavailable').map(f => `${f.fontFamily} -> ${f.substitute}`);
        const summary = [];
        if (available.length > 0) summary.push(`${available.join(', ')} confirmed on Google Fonts`);
        if (substituted.length > 0) summary.push(`Substituted: ${substituted.join(', ')}`);

        await postBuildMessage(supabase, buildId,
          `Font validation: ${summary.join('. ')}`,
          'design_prep');
      } else {
        designPrepResults.font_map = { validated: [], substitutions: {}, googleFontsToLoad: allUsedFonts.filter((f: string) => !SYSTEM_FONTS.has(f)) };
        console.log('[pageforge] Design prep: No non-standard fonts to validate');
      }

      // --- Sub-task 2+3: Layout Extraction + Mobile Rules ---
      // Need Figma node data for layout analysis
      const needsLayout = figmaWarnings.some((w: string) => w.includes('Low auto-layout'));
      const needsMobile = figmaWarnings.some((w: string) => w.includes('No mobile frame'));

      if (needsLayout || needsMobile) {
        console.log(`[pageforge] Design prep: Fetching Figma nodes for layout analysis...`);
        try {
          const figmaClient = createFigmaClient(siteProfile.figma_personal_token!);

          // Fetch the desktop frame nodes
          const desktopNodeIds = (build.figma_node_ids || []).filter((id: string) => id);
          let pageNode: FigmaNode | null = null;

          if (desktopNodeIds.length > 0) {
            // Use the first node ID as the main desktop frame
            const nodes = await figmaGetFileNodes(figmaClient, build.figma_file_key, [desktopNodeIds[0]]);
            const nodeData = nodes[desktopNodeIds[0]];
            if (nodeData?.document) pageNode = nodeData.document;
          }

          if (!pageNode) {
            // Fallback: fetch full file
            const file = await figmaGetFile(figmaClient, build.figma_file_key);
            pageNode = file.document?.children?.[0] || file.document;
          }

          // Extract sections from the page node
          const sections = figmaExtractSections(pageNode);
          console.log(`[pageforge] Design prep: Found ${sections.length} sections for layout analysis`);

          // Extract text content for mobile rules
          const textContent = figmaExtractTextContent(sections);

          // Sub-task 2: Layout structure
          if (needsLayout && sections.length > 0) {
            const layoutMap = extractLayoutMap(sections);
            designPrepResults.layout_map = layoutMap;

            const layoutSummary = layoutMap.sections.map((s: SectionLayout) =>
              `${s.sectionName}: ${s.layout.columns}-col, ${s.layout.gap}px gap (${s.layout.source})`
            ).join('; ');
            await postBuildMessage(supabase, buildId,
              `Layout extraction: ${layoutMap.sections.length} sections analyzed. ${layoutSummary}`,
              'design_prep');
          }

          // Sub-task 3: Mobile responsive rules
          if (needsMobile) {
            const layoutMap = designPrepResults.layout_map || extractLayoutMap(sections);
            const mobileRules = generateMobileRules(layoutMap, textContent);
            designPrepResults.mobile_rules = mobileRules;

            await postBuildMessage(supabase, buildId,
              `Mobile rules generated for ${mobileRules.sections.length} sections (no mobile Figma frame detected - using desktop-derived breakpoints)`,
              'design_prep');
          }
        } catch (layoutErr) {
          console.error('[pageforge] Design prep layout extraction error:', layoutErr);
          await postBuildMessage(supabase, buildId,
            `Layout extraction failed: ${layoutErr instanceof Error ? layoutErr.message : String(layoutErr)}. Continuing without layout data.`,
            'design_prep');
        }
      }

      // --- Sub-task 4: Tiered Re-naming ---
      const unresolvedIssues = (namingData.issues || []).filter((i: any) => !i.resolved);
      if (unresolvedIssues.length > 0) {
        console.log(`[pageforge] Design prep: Tiered renaming for ${unresolvedIssues.length} unresolved naming issues...`);

        // Tier A: depth 1 (top-level frames) - most important
        const tierA = unresolvedIssues.filter((i: any) => i.depth === 1);
        // Tier B: depth 2 (section children)
        const tierB = unresolvedIssues.filter((i: any) => i.depth === 2);
        // Tier C: depth 3+ (deeply nested)
        const tierC = unresolvedIssues.filter((i: any) => i.depth >= 3);

        const enhancedMap: Record<string, string> = { ...autoNameMap };

        // Tier A+B: Try Gemini Flash for important nodes
        const tierAB = [...tierA, ...tierB];
        if (tierAB.length > 0) {
          try {
            const googleApiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
            if (googleApiKey) {
              const { runAutoName } = await import('../lib/auto-name-core.js');

              // Run focused auto-name with just the important unresolved issues
              const focusedResult = await runAutoName({
                figmaFileKey: build.figma_file_key,
                figmaPersonalToken: siteProfile.figma_personal_token!,
                figmaNodeIds: build.figma_node_ids,
                namingIssues: tierAB,
                googleApiKey,
              });

              if (focusedResult?.renames?.length > 0) {
                for (const r of focusedResult.renames) {
                  enhancedMap[r.nodeId] = r.suggestedName;
                }
                console.log(`[pageforge] Tier A+B: Gemini resolved ${focusedResult.renames.length}/${tierAB.length} issues`);
              }
            }
          } catch (geminiErr) {
            console.error('[pageforge] Tier A+B Gemini rename error:', geminiErr);
          }
        }

        // Tier C: Deterministic renaming (no AI)
        if (tierC.length > 0) {
          const tierCIssues: NamingIssue[] = tierC.map((i: any) => ({
            nodeId: i.nodeId,
            name: i.nodeName,
            type: i.nodeType || 'FRAME',
            pattern: i.issue?.includes('Group') ? 'generic_group'
              : i.issue?.includes('Frame') ? 'generic_frame'
              : i.issue?.includes('Rectangle') ? 'generic_shape'
              : i.issue?.includes('Vector') ? 'generic_vector'
              : i.issue?.includes('image') ? 'generic_image'
              : i.issue?.includes('Untitled') ? 'untitled'
              : i.issue?.includes('Numeric') ? 'numeric_only'
              : 'generic_frame',
            depth: i.depth,
            parentName: undefined,
          }));

          const deterministicNames = runDeterministicRenaming(tierCIssues);
          for (const [nodeId, name] of Object.entries(deterministicNames)) {
            if (!enhancedMap[nodeId]) enhancedMap[nodeId] = name;
          }
          console.log(`[pageforge] Tier C: Deterministic renaming resolved ${Object.keys(deterministicNames).length} issues`);
        }

        designPrepResults.enhanced_name_map = enhancedMap;

        const totalResolved = Object.keys(enhancedMap).length;
        const totalIssues = namingData.issues?.length || unresolvedIssues.length;
        await postBuildMessage(supabase, buildId,
          `Tiered renaming: ${totalResolved}/${totalIssues} naming issues now resolved (Tier A: ${tierA.length}, B: ${tierB.length}, C: ${tierC.length})`,
          'design_prep');
      } else {
        designPrepResults.enhanced_name_map = autoNameMap;
        console.log('[pageforge] Design prep: No unresolved naming issues');
      }

      await updateBuildArtifacts(supabase, buildId, 'design_prep', designPrepResults);
      console.log(`[pageforge] Design prep complete: fonts=${!!designPrepResults.font_map}, layout=${!!designPrepResults.layout_map}, mobile=${!!designPrepResults.mobile_rules}, names=${Object.keys(designPrepResults.enhanced_name_map || {}).length}`);
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 3: FIGMA ANALYSIS - Extract design data from Figma
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

      // Apply name overlay: prefer enhanced_name_map from design_prep, fall back to auto_name_map
      const nameMap = (artifacts.design_prep?.enhanced_name_map || artifacts.auto_name_map || {}) as Record<string, string>;
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

      // Extract text content from all sections (zero extra API calls)
      const textContent = figmaExtractTextContent(sections);
      console.log(`[pageforge] Extracted ${textContent.length} text nodes from Figma`);

      // AI design summary
      const designResult = await callPageForgeAgent(supabase, buildId, 'pageforge_analyzer', 'figma_analysis',
        getSystemPrompt('pageforge_builder'),
        `Analyze this Figma design and provide a 2-3 sentence summary:\n\nSections:\n${sections.map((s: any, i: number) => `${i + 1}. "${s.name}" (${s.type}) ${s.bounds.width}x${s.bounds.height}px`).join('\n')}\n\nTokens: ${colors.length} colors, ${fonts.length} fonts, ${imageNodeIds.length} images`,
        anthropic
      );

      // Extract page name from Figma node (frame name)
      const figmaPageName = pageNode.name || '';

      const result = {
        pageName: figmaPageName,
        sections: sections.map((s: any) => ({
          id: s.id, name: s.name, type: s.type, bounds: s.bounds,
          childCount: s.children.length,
          columnCount: detectColumnCount(s.node),
        })),
        colors, fonts, imageNodeIds, imageNodeDetails, textContent, designSummary: designResult.text,
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

      // Build section descriptions enriched with text content from Figma
      const textContent: FigmaTextContent[] = figmaData.textContent || [];
      const sectionDescriptions = figmaData.sections.map((s: any, i: number) => {
        const sectionTexts = textContent
          .filter((t: FigmaTextContent) => t.sectionName === s.name)
          .sort((a: FigmaTextContent, b: FigmaTextContent) => a.y - b.y)
          .slice(0, 8)
          .map((t: FigmaTextContent) => `  - [${t.role}] "${t.text.slice(0, 80)}" (${t.fontSize}px/${t.fontWeight})`)
          .join('\n');
        return `${i + 1}. "${s.name}" - ${s.bounds.width}x${s.bounds.height}px, ${s.childCount} children${sectionTexts ? '\n' + sectionTexts : ''}`;
      }).join('\n');

      const result = await callPageForgeAgent(supabase, buildId, 'pageforge_classifier', 'section_classification',
        getSystemPrompt('pageforge_builder'),
        `Classify each section by type and complexity tier.\n\nSections:\n${sectionDescriptions}\n\nRespond with JSON array: [{"sectionId":"...","sectionName":"...","type":"hero|features|cta|testimonials|pricing|stats|gallery|contact|footer|navigation|content|faq|team|logos|video","tier":1-4,"description":"..."}]\n\nTier: 1=Simple, 2=Standard, 3=Complex, 4=Advanced`,
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

      // Build detailed section descriptions with dimensions and TEXT CONTENT from Figma
      const allTextContent: FigmaTextContent[] = figmaData.textContent || [];

      // Build section details for the prompt (layout info only - text goes in separate section)
      const sectionDetails = classifications.map((c: any, i: number) => {
        const section = figmaData.sections.find((s: any) => s.id === c.sectionId);
        const bounds = section?.bounds || {};
        const colCount = section?.columnCount || 1;
        const colLabel = colCount > 1 ? `, ${colCount}-column layout` : '';
        return `${i + 1}. "${c.sectionName}" (${c.type}, Tier ${c.tier}) - ${bounds.width || '?'}x${bounds.height || '?'}px, ${section?.childCount || 0} child elements${colLabel}${c.description ? ` - ${c.description}` : ''}`;
      }).join('\n');

      // Build MANDATORY text content section - text as a prominent top-level block
      const mandatoryTextContent = classifications.map((c: any) => {
        const sectionTexts = allTextContent
          .filter((t: FigmaTextContent) => t.sectionName === c.sectionName)
          .sort((a: FigmaTextContent, b: FigmaTextContent) => a.y - b.y)
          .slice(0, 12);
        if (sectionTexts.length === 0) return '';
        const lines = sectionTexts.map((t: FigmaTextContent) => {
          const tag = t.role === 'heading' ? (t.fontSize >= 36 ? 'H1' : 'H2') : t.role === 'button' ? 'Button' : 'Body';
          return `- ${tag}: "${t.text.slice(0, 150)}" (${t.fontSize}px/${t.fontWeight})`;
        });
        return `### Section: "${c.sectionName}"\n${lines.join('\n')}`;
      }).filter(Boolean).join('\n\n');

      // Build MANDATORY section order
      const mandatorySectionOrder = classifications.map((c: any, i: number) =>
        `${i + 1}. ${c.sectionName}`
      ).join('\n');

      // Identify primary and secondary colors from the design (luminance-based)
      const colorList: string[] = figmaData.colors.map((c: any) => c.hex as string);
      const uniqueColors: string[] = [...new Set(colorList)];
      const primaryDark = findPrimaryDark(uniqueColors);
      const primaryAccent = findAccentColor(uniqueColors);
      const fontSubstitutions = (artifacts.design_prep?.font_map?.substitutions || {}) as Record<string, string>;
      const resolveFontName = (name: string) => fontSubstitutions[name] || name;
      const primaryFont = resolveFontName(figmaData.fonts[0]?.family || 'Poppins');
      const secondaryFont = resolveFontName(figmaData.fonts.find((f: any) => f.family !== figmaData.fonts[0]?.family)?.family || primaryFont);

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

## MANDATORY TEXT CONTENT - USE THESE EXACT STRINGS

The following text was extracted directly from the Figma design file. You MUST use these
EXACT strings in your output. Do NOT paraphrase, rewrite, or make up alternative text.
Using different text than what appears below is a CRITICAL FAILURE.

${mandatoryTextContent}

## MANDATORY SECTION ORDER

Output sections in THIS EXACT ORDER. Do not reorder, skip, or merge sections:
${mandatorySectionOrder}

${DIVI5_INSTRUCTIONS}

## Design System
Primary font: "${primaryFont}", sans-serif (ALL text uses this font)
Secondary font: "${secondaryFont}", sans-serif

COLOR PALETTE (use ONLY these colors):
- Primary dark: ${primaryDark} (use for hero bg, footer bg, dark sections)
- Accent: ${primaryAccent} (use for buttons, highlights, CTAs)
- Text on dark: #ffffff
- Text on light: #333333
- All Figma colors: ${uniqueColors.slice(0, 12).join(', ')}
- Do NOT invent colors not in this list

Font scale: ${figmaData.fonts.slice(0, 8).map((f: any) => `${f.size}px/${f.weight}`).join(', ')}
${(() => {
  const layoutMap = artifacts.design_prep?.layout_map;
  if (!layoutMap?.sections?.length) return '';
  return `
## LAYOUT STRUCTURE (extracted from Figma - follow precisely)
${layoutMap.sections.map((s: any) =>
  `- "${s.sectionName}": ${s.layout.columns}-column ${s.layout.direction} layout, ${s.layout.gap}px gap, padding ${s.layout.padding.top}/${s.layout.padding.right}/${s.layout.padding.bottom}/${s.layout.padding.left}px, alignment: ${s.layout.alignment}, child sizing: ${s.layout.childSizing} (${s.layout.source})`
).join('\n')}

IMPORTANT: Use these exact column counts and gaps. Do NOT guess layouts.`;
})()}
${(() => {
  const mobileRules = artifacts.design_prep?.mobile_rules;
  if (!mobileRules?.sections?.length) return '';
  return `
## RESPONSIVE BREAKPOINTS (apply to every section)
Tablet: max-width ${mobileRules.breakpoints.tablet}px | Phone: max-width ${mobileRules.breakpoints.phone}px

${mobileRules.sections.map((s: any) =>
  `- "${s.sectionName}": Desktop ${s.desktop.columns}-col -> Tablet ${s.tablet.columns}-col -> Phone ${s.phone.columns}-col | Font: ${s.desktop.fontSize} -> ${s.tablet.fontSize} -> ${s.phone.fontSize}`
).join('\n')}

Include _tablet and _phone attribute variants in every Divi 5 module for responsive behavior.`;
})()}

## Sections to Build (${classifications.length} total - EVERY ONE is required)
${sectionDetails}
${imageRules}

## QUALITY RULES
1. Output exactly ${classifications.length} sections, matching the Figma design section count precisely.
2. Section backgrounds must EXACTLY match the Figma colors listed above.
3. Dark sections (${primaryDark} or similar) MUST have light text colors (#ffffff, #e0e0e0) in font settings.
4. Card/feature grids: use columns + cards, NOT individual sections per card.
5. Stats/numbers: use columns (3-5) + cards where title="24+" and text="Years Experience".
6. Hero: large h1 (48-60px), subtitle, CTA button. background.color MUST be a dark rgba overlay for text readability over the image.
7. Footer: dark background, use a single "code" element for multi-column HTML footer layout.
8. ALL content from the MANDATORY TEXT CONTENT section above. NO placeholder/lorem ipsum text.
9. Match column counts exactly from Figma (3 cards in design = columns:3).
10. Each concept appears EXACTLY ONCE. Never duplicate sections.
11. Font sizes MUST use the actual design system: ${figmaData.fonts.slice(0, 5).map((f: any) => `${f.size}px`).join(', ')}
12. EVERY heading and text element MUST have explicit font.color set (dark text on light bg, light text on dark bg).
13. Hero sections with background images: ALL text elements MUST have font.color="#ffffff".
14. Tabs/interactive sections: use a "code" element with custom HTML for tabbed interfaces (tab buttons + content panels with inline JS for switching).

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

        // B4: Validate and enforce section ordering to match classifications
        {
          const expectedOrder = classifications.map((c: any) => c.sectionName.toLowerCase());
          const reordered: typeof divi5Sections = [];
          const used = new Set<number>();
          for (const expectedName of expectedOrder) {
            const matchIdx = divi5Sections.findIndex((s, idx) =>
              !used.has(idx) && (
                s.name?.toLowerCase().includes(expectedName) ||
                expectedName.includes(s.name?.toLowerCase() || '')
              )
            );
            if (matchIdx >= 0) {
              reordered.push(divi5Sections[matchIdx]);
              used.add(matchIdx);
            }
          }
          // Append any unmatched sections at the end
          for (let idx = 0; idx < divi5Sections.length; idx++) {
            if (!used.has(idx)) reordered.push(divi5Sections[idx]);
          }
          if (reordered.length > 0) {
            const wasReordered = divi5Sections.some((s, i) => s !== reordered[i]);
            if (wasReordered) {
              console.log(`[pageforge] Post-process: reordered sections to match Figma layout`);
            }
            divi5Sections = reordered;
          }
        }

        // Post-process ALL sections: background images, text validation, missing elements
        const imageDetails: { id: string; name: string; sectionName: string; width: number; height: number }[] = figmaData.imageNodeDetails || [];
        for (let si = 0; si < divi5Sections.length; si++) {
          const section = divi5Sections[si];
          const classification = classifications[si];
          if (!classification) continue;

          const sectionName = classification.sectionName;
          const sectionTexts = allTextContent
            .filter((t: FigmaTextContent) => t.sectionName === sectionName)
            .sort((a: FigmaTextContent, b: FigmaTextContent) => a.y - b.y);
          const isDarkBg = section.background?.color && relativeLuminance(section.background.color.replace(/rgba?\([^)]+\)/, '#000')) < 0.3;

          // Check if this section should have a background image
          const isHeroLike = classification.type === 'hero' ||
            section.name?.toLowerCase().includes('hero') ||
            (si === 0 && section.background?.color);

          if (isHeroLike && !section.background?.image) {
            const sectionImages = imageDetails.filter(img =>
              img.sectionName === sectionName || img.sectionName?.toLowerCase().includes('hero')
            );
            const bgImage = sectionImages.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
            if (bgImage) {
              if (!section.background) section.background = {};
              section.background.image = `FIGMA_IMG:${bgImage.id}`;
              if (!section.background.color) {
                section.background.color = 'rgba(0,23,56,0.75)';
              }
              console.log(`[pageforge] Post-process: injected background.image into "${section.name}"`);
            }
          }

          // Ensure overlay color on sections with background images
          if (section.background?.image?.startsWith('FIGMA_IMG') && !section.background.color) {
            section.background.color = 'rgba(0,23,56,0.75)';
          }

          // B5: Validate and fix text content for ALL sections (not just hero)
          if (sectionTexts.length > 0) {
            const elements = section.elements || [];

            // Check/fix heading text against Figma
            const figmaHeadings = sectionTexts.filter((t: FigmaTextContent) => t.role === 'heading');
            for (const el of elements) {
              if (el.type === 'heading' && el.text && figmaHeadings.length > 0) {
                const bestMatch = figmaHeadings
                  .map((fh: FigmaTextContent) => ({ text: fh.text, score: fuzzyTextMatch(el.text, fh.text) }))
                  .sort((a: any, b: any) => b.score - a.score)[0];
                if (bestMatch && bestMatch.score < 0.4) {
                  // Text is hallucinated - replace with best Figma match
                  const correctHeading = figmaHeadings.find((fh: FigmaTextContent) =>
                    !elements.some((other: any) => other !== el && other.type === 'heading' && fuzzyTextMatch(other.text || '', fh.text) > 0.6)
                  );
                  if (correctHeading) {
                    console.log(`[pageforge] Post-process: replaced hallucinated heading "${el.text.slice(0, 40)}" with Figma text "${correctHeading.text.slice(0, 40)}" in "${sectionName}"`);
                    el.text = correctHeading.text;
                  }
                }
              }
            }

            // Check/fix card titles against Figma text
            if (section.cards && section.cards.length > 0) {
              const figmaCardTexts = sectionTexts.filter((t: FigmaTextContent) =>
                t.role === 'body' || t.role === 'heading'
              );
              for (let ci = 0; ci < section.cards.length; ci++) {
                const card = section.cards[ci];
                if (card.title) {
                  const anyMatch = sectionTexts.some((t: FigmaTextContent) => fuzzyTextMatch(card.title, t.text) > 0.4);
                  if (!anyMatch && figmaCardTexts[ci]) {
                    console.log(`[pageforge] Post-process: replaced card title "${card.title.slice(0, 30)}" with Figma text in "${sectionName}"`);
                    card.title = figmaCardTexts[ci].text;
                  }
                }
              }
            }

            // Inject missing heading if not present (expanded from hero-only)
            const hasHeading = elements.some((el: any) => el.type === 'heading');
            const figmaHeading = figmaHeadings[0];
            if (!hasHeading && figmaHeading) {
              elements.unshift({
                type: 'heading',
                text: figmaHeading.text,
                level: figmaHeading.fontSize >= 36 ? 'h1' : 'h2',
                font: {
                  family: primaryFont,
                  size: `${figmaHeading.fontSize}px`,
                  weight: String(figmaHeading.fontWeight),
                  color: isDarkBg ? '#ffffff' : '#333333',
                },
              });
              section.elements = elements;
              console.log(`[pageforge] Post-process: injected missing heading in "${sectionName}"`);
            }

            // Inject missing button (expanded from hero-only)
            const figmaButton = sectionTexts.find((t: FigmaTextContent) => t.role === 'button');
            const hasButton = elements.some((el: any) => el.type === 'button');
            if (!hasButton && figmaButton && (isHeroLike || classification.type === 'cta')) {
              elements.push({
                type: 'button',
                text: figmaButton.text,
                url: '#contact',
                font: { size: `${figmaButton.fontSize}px`, weight: String(figmaButton.fontWeight), color: '#ffffff' },
                style: { bgColor: primaryAccent, borderRadius: '8px', padding: '14px 32px' },
              });
              section.elements = elements;
              console.log(`[pageforge] Post-process: injected missing button "${figmaButton.text}" in "${sectionName}"`);
            }
          }
        }

        let divi5Markup = buildDivi5Markup(divi5Sections, primaryFont, primaryAccent);

        // Apply font substitutions from design_prep (e.g. "Figma Hand" -> "Caveat")
        const fontSubs = (artifacts.design_prep?.font_map?.substitutions || {}) as Record<string, string>;
        for (const [original, substitute] of Object.entries(fontSubs)) {
          if (original && substitute) {
            divi5Markup = divi5Markup.replace(new RegExp(original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), substitute);
          }
        }

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

      // Count FIGMA_IMG placeholders (expected - will be replaced by image_optimization phase)
      const figmaImgCount = (markup.match(/FIGMA_IMG:/g) || []).length;
      if (figmaImgCount > 0) {
        warnings.push(`${figmaImgCount} FIGMA_IMG: placeholder(s) found - will be replaced during image_optimization phase`);
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
          // Use build.page_title as WP page title (set by user or UI), fallback to Figma frame name
          const figmaPageName = artifacts.figma_analysis?.pageName || '';
          const wpTitle = build.page_title || figmaPageName || build.page_slug || 'PageForge Page';
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

      // Warn if FIGMA_IMG: placeholders remain in the deployed page (indicates missing images)
      if (build.wp_page_id) {
        try {
          const checkRes = await fetch(`${siteProfile.wp_rest_url}/pages/${build.wp_page_id}?context=edit`, { headers: { Authorization: 'Basic ' + Buffer.from(`${siteProfile.wp_username}:${siteProfile.wp_app_password}`).toString('base64') } });
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            const checkContent = checkData.content?.raw || '';
            const remaining = (checkContent.match(/FIGMA_IMG:/g) || []).length;
            if (remaining > 0) {
              console.warn(`[pageforge] WARNING: ${remaining} FIGMA_IMG: placeholder(s) remain after image replacement - these will show as broken images`);
              await postBuildMessage(supabase, buildId, `Warning: ${remaining} image placeholder(s) could not be replaced (missing node IDs in Figma export)`, 'image_optimization');
            }
          }
        } catch { /* non-fatal */ }
      }
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 10: VQA CAPTURE - Desktop screenshot only (1440px)
    // -----------------------------------------------------------------------
    case 'vqa_capture': {
      const deployData = artifacts.deploy_draft;
      if (!deployData?.draftUrl) throw new Error('Missing deploy_draft artifacts');

      // Capture WordPress desktop screenshot ONLY (mobile VQA is a separate phase)
      const desktopShot = await captureScreenshotAtBreakpoint(deployData.draftUrl, 1440);
      const wpScreenshots: Record<string, string | null> = { desktop: desktopShot, tablet: null, mobile: null };

      // Export Figma desktop screenshot (JPG, scale 1.0 for better detail, fallback to 0.75 if too large)
      let figmaScreenshots: Record<string, string | null> = { desktop: null };
      if (siteProfile.figma_personal_token && build.figma_node_ids?.length > 0) {
        try {
          const figmaClient = createFigmaClient(siteProfile.figma_personal_token);
          let vqaScale = 1;
          const imageResponse = await figmaGetImages(figmaClient, build.figma_file_key, [build.figma_node_ids[0]], { format: 'jpg', scale: vqaScale });
          const firstUrl = Object.values(imageResponse.images).find(Boolean);
          if (firstUrl) {
            const buffer = await figmaDownloadImage(firstUrl);
            console.log(`[pageforge] Figma desktop VQA screenshot raw: ${Math.round(buffer.length / 1024)}KB (scale ${vqaScale})`);
            let resized = await resizeIfNeeded(buffer.toString('base64'));
            // If still too large after resize, retry at lower scale
            if (Buffer.from(resized, 'base64').length > 4_500_000 && vqaScale > 0.75) {
              console.log(`[pageforge] VQA image too large at scale ${vqaScale}, retrying at 0.75`);
              const fallbackResp = await figmaGetImages(figmaClient, build.figma_file_key, [build.figma_node_ids[0]], { format: 'jpg', scale: 0.75 });
              const fallbackUrl = Object.values(fallbackResp.images).find(Boolean);
              if (fallbackUrl) {
                const fallbackBuf = await figmaDownloadImage(fallbackUrl);
                resized = await resizeIfNeeded(fallbackBuf.toString('base64'));
              }
            }
            figmaScreenshots.desktop = resized;
            console.log(`[pageforge] Figma desktop VQA screenshot ready: ${Math.round(Buffer.from(resized, 'base64').length / 1024)}KB`);
          }
        } catch (err) {
          console.warn('[pageforge] Failed to export Figma desktop VQA screenshot:', err);
        }
      }

      await updateBuildArtifacts(supabase, buildId, 'vqa_capture', { wpScreenshots, figmaScreenshots });
      console.log(`[pageforge] VQA desktop capture complete: WP=${!!desktopShot}, Figma=${!!figmaScreenshots.desktop}`);
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 11: VQA COMPARISON - Desktop-only AI vision comparison
    // -----------------------------------------------------------------------
    case 'vqa_comparison': {
      const captureData = artifacts.vqa_capture;
      if (!captureData) throw new Error('Missing vqa_capture artifacts');

      const { wpScreenshots, figmaScreenshots } = captureData;
      const threshold = siteProfile.vqa_pass_threshold || 80;
      const classifications = artifacts.section_classification;
      const results: Record<string, { score: number; differences: any[] }> = {};

      // Build section context for the VQA agent
      const sectionContext = classifications?.length
        ? `\nPage sections (top to bottom):\n${classifications.map((c: any, i: number) => `${i + 1}. "${c.sectionName}" (${c.type})`).join('\n')}`
        : '';

      // DESKTOP ONLY comparison (mobile VQA is a separate phase with mobile Figma)
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

BE STRICT. A page with wrong text, missing sections, or wrong colors cannot score above 60%.

Score EACH category 0-100, then calculate the weighted average:

1. TEXT ACCURACY (20%): Does the page show the EXACT same text as the Figma design?
   - Compare headlines word-for-word. Wrong headline text = 0 for this category.
   - Placeholder/lorem ipsum text = 0.
   - Made-up text that doesn't appear in Figma = 0.

2. SECTION COMPLETENESS (15%): Are ALL sections from Figma present in WP?
   - Each missing section = -15 points.
   - Extra sections not in Figma = -5 points.

3. SECTION ORDER (10%): Do sections appear top-to-bottom in the same order as Figma?
   - Wrong order = max 30 for this category.

4. LAYOUT STRUCTURE (15%): Column counts, grid layouts, card arrangements match Figma?
   - 3-column grid showing as 2-column = max 40.
   - Missing tab/accordion interface = max 30.

5. COLOR ACCURACY (10%): Background colors, text colors match Figma palette?
   - Wrong primary color (e.g. purple instead of navy) = max 30.
   - Text unreadable on background = 0.

6. TYPOGRAPHY (10%): Font sizes, weights, hierarchy match?
   - System fonts instead of design fonts = max 40.
   - Wrong heading hierarchy = -20.

7. IMAGES (8%): Real images in correct positions, correct aspect ratios?
   - Broken/missing images = 0.
   - Wrong aspect ratio = -20.

8. BUTTONS/CTAs (5%): Styled correctly, text matches Figma?
   - Missing CTA = 0.

9. FOOTER (4%): Structure matches Figma (columns, links, content)?
   - Generic single-line footer when Figma has multi-column = max 30.

10. VISUAL ARTIFACTS (3%): No random shapes, dots, lines, or rendering glitches?
    - Any visible artifact = 0 for this category.

Final = text*0.20 + sections*0.15 + order*0.10 + layout*0.15 + color*0.10 + typo*0.10 + images*0.08 + buttons*0.05 + footer*0.04 + artifacts*0.03

CRITICAL SCORING RULES:
- If ANY heading text doesn't match Figma, overall score CANNOT exceed 70%.
- If a major section is missing entirely, overall score CANNOT exceed 60%.
- If section order is wrong, overall score CANNOT exceed 75%.

DIVI 5 CSS SELECTORS (use these in suggestedFix, NOT made-up class names):
- Sections: .et_pb_section_0, .et_pb_section_1, etc. (0-indexed, top to bottom)
- Text: .et_pb_section_N .et_pb_text_inner
- Headings: .et_pb_section_N h1, .et_pb_section_N h2
- Cards: .et_pb_section_N .et_pb_blurb_content
- Images: .et_pb_section_N .et_pb_image_wrap img
- Buttons: .et_pb_button

Respond with JSON:
{"score":N,"categoryScores":{"text":N,"sections":N,"order":N,"layout":N,"color":N,"typography":N,"images":N,"buttons":N,"footer":N,"artifacts":N},"differences":[{"area":"element","severity":"critical|major|minor","description":"specific issue","suggestedFix":"CSS rule using Divi 5 selectors above"}]}`,
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

      // NOTE: Tablet/mobile VQA is now handled by separate mobile_vqa_* phases
      // using the mobile Figma as reference (not the same desktop image)

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

      // Run structural QA (text-based, no screenshots) to detect content accuracy issues
      let structuralScore = 100;
      let structuralPenalties: string[] = [];
      let structuralAutoFixes: StructuralFix[] = [];
      const markupForQA = artifacts.markup_generation?.markup || '';
      const figmaTextForQA: FigmaTextContent[] = artifacts.figma_analysis?.textContent || [];
      const figmaColorsForQA: string[] = (artifacts.figma_analysis?.colors || []).map((c: any) => c.hex as string);
      if (markupForQA && figmaTextForQA.length > 0) {
        const sqaResult = structuralQA(markupForQA, figmaTextForQA, classifications || [], figmaColorsForQA);
        structuralScore = sqaResult.score;
        structuralPenalties = sqaResult.penalties;
        structuralAutoFixes = sqaResult.autoFixes;
        if (sqaResult.penalties.length > 0) {
          console.log(`[pageforge] Structural QA score: ${sqaResult.score}% (${sqaResult.penalties.length} issues, ${sqaResult.autoFixes.length} auto-fixes)`);
          for (const penalty of sqaResult.penalties) {
            console.log(`[pageforge]   - ${penalty}`);
          }
        }
      }

      // Desktop-only scoring - cap visual score with structural score to prevent inflation
      const desktopScore = results.desktop?.score || 0;
      const adjustedDesktopScore = Math.max(0, desktopScore - layoutPenalty);
      const overallScore = Math.min(adjustedDesktopScore, structuralScore + 10);
      if (layoutPenalty > 0) {
        console.log(`[pageforge] Layout penalty: -${layoutPenalty}% (raw: ${desktopScore}%, adjusted: ${adjustedDesktopScore}%)`);
      }
      if (overallScore < adjustedDesktopScore) {
        console.log(`[pageforge] Structural cap: visual=${adjustedDesktopScore}% capped to ${overallScore}% (structural=${structuralScore}%)`);
      }
      const passed = overallScore >= threshold;

      await supabase.from('pageforge_builds').update({
        vqa_score_desktop: desktopScore, vqa_score_overall: overallScore,
        build_stage: 'desktop',
        updated_at: new Date().toISOString(),
      }).eq('id', buildId);

      const fixSuggestions = Object.values(results).flatMap(r => r.differences.filter((d: any) => d.suggestedFix).map((d: any) => d.suggestedFix));

      await updateBuildArtifacts(supabase, buildId, 'vqa_comparison', {
        results, overallScore, passed, threshold, fixSuggestions,
        structuralScore, structuralPenalties, structuralAutoFixes,
      });

      const scoreBreakdown = structuralScore < 100 ? ` (structural=${structuralScore}%)` : '';
      await postBuildMessage(supabase, buildId,
        `Desktop VQA: ${desktopScore}%${layoutPenalty > 0 ? ` (-${layoutPenalty}% layout)` : ''}${scoreBreakdown} = ${overallScore}% (threshold=${threshold}%, ${passed ? 'PASSED' : 'needs fixes'})`,
        'vqa_comparison');

      console.log(`[pageforge] Desktop VQA: ${desktopScore}% (adjusted: ${overallScore}%, threshold=${threshold}, passed=${passed})`);
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
      // C2: Apply structural auto-fixes BEFORE CSS fix loop
      // These fix wrong text content that CSS patches cannot address
      const structAutoFixes: StructuralFix[] = comparisonData.structuralAutoFixes || [];
      if (structAutoFixes.length > 0) {
        let structFixCount = 0;
        for (const fix of structAutoFixes) {
          if (fix.type === 'replace_text' && currentMarkup.includes(fix.wrongText)) {
            currentMarkup = currentMarkup.split(fix.wrongText).join(fix.correctText);
            structFixCount++;
            console.log(`[pageforge] Structural fix: ${fix.description}`);
          }
        }
        if (structFixCount > 0) {
          console.log(`[pageforge] Applied ${structFixCount} structural text fixes before CSS fix loop`);
          // Re-deploy fixed markup
          if (build.wp_page_id && siteProfile.wp_username && siteProfile.wp_app_password) {
            const wpClient = createWpClient({ restUrl: siteProfile.wp_rest_url, username: siteProfile.wp_username, appPassword: siteProfile.wp_app_password });
            const fixBuilder = build.page_builder || 'gutenberg';
            await wpUpdatePage(wpClient, build.wp_page_id, { content: prepareMarkupForDeploy(currentMarkup, fixBuilder) });
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for WP to process
          }
          // Update markup artifacts
          await updateBuildArtifacts(supabase, buildId, 'markup_generation', { ...markupData, markup: currentMarkup });
        }
      }

      const allChanges: string[] = [];
      const failedPatches: Array<{ search: string; description: string; iteration: number }> = [];
      let lastScore = comparisonData.overallScore || 0;
      // Re-run structural QA after text fixes to get updated structural score
      let currentStructuralScore = comparisonData.structuralScore || 100;
      // Hoist structural QA inputs to outer scope so they can be re-used inside the fix loop
      const figmaTextForStructural: FigmaTextContent[] = artifacts.figma_analysis?.textContent || [];
      const figmaColorsForStructural: string[] = (artifacts.figma_analysis?.colors || []).map((c: any) => c.hex as string);
      const classificationsForStructural = artifacts.section_classification || [];
      if (structAutoFixes.length > 0) {
        const recheck = structuralQA(currentMarkup, figmaTextForStructural, classificationsForStructural, figmaColorsForStructural);
        currentStructuralScore = recheck.score;
        console.log(`[pageforge] Structural score after auto-fixes: ${recheck.score}% (was ${comparisonData.structuralScore || '?'}%)`);
      }
      let stallCount = 0;
      let rollbackCount = 0;
      let previousMarkup: string | null = null;
      let previousDiffs: any[] | null = null; // Save pre-patch diffs for rollback
      let previousWasRollback = false; // Track if last iteration was rolled back
      const scoreHistory: Array<{ iteration: number; score: number }> = [];
      let lastCategoryScores: Record<string, number> | null = null; // Track category scores for targeted fixing
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
        // Always include ALL diffs (including minor) - minor diffs add up for the final score
        let allDiffs = Object.values(comparisonData.results as Record<string, any>)
          .flatMap((r: any) => (r.differences || []));

        if (allDiffs.length === 0 && lastScore < threshold) {
          // No diffs found but below threshold - force a deep re-analysis
          console.log(`[pageforge] No diffs but score ${lastScore}% < threshold ${threshold}% - running deep analysis`);
          try {
            const deepResult = await callPageForgeAgent(supabase, buildId, 'pageforge_vqa', 'vqa_fix_loop',
              getSystemPrompt('pageforge_vqa'),
              `DEEP ANALYSIS: The WordPress page scores ${lastScore}% against the Figma design but the threshold is ${threshold}%.
Previous analysis found no differences, but there MUST be remaining issues causing the ${threshold - lastScore}% gap.

Image 1: Figma design (reference)
Image 2: WordPress page (current)

Look VERY carefully for SUBTLE differences in these 10 categories:
- TEXT ACCURACY (20%): heading text, body text, labels - exact wording match
- SECTION COMPLETENESS (15%): all Figma sections present in the page
- SECTION ORDER (10%): sections appear in the same top-to-bottom order as Figma
- LAYOUT STRUCTURE (15%): columns, grids, flexbox alignment, spacing
- COLOR ACCURACY (10%): background colors, text colors, gradients
- TYPOGRAPHY (10%): font sizes, weights, line-heights, letter-spacing
- IMAGES (8%): image sizing, cropping, placeholders
- BUTTONS/CTAs (5%): button styles, text, colors, borders
- FOOTER (4%): footer content and styling
- VISUAL ARTIFACTS (3%): border-radius, box-shadows, opacity, decorative elements

You MUST find at least 3-5 differences. Score each category 0-100.

Respond with JSON:
{"score":N,"categoryScores":{"text":N,"sections":N,"order":N,"layout":N,"color":N,"typography":N,"images":N,"buttons":N,"footer":N,"artifacts":N},"differences":[{"area":"...","severity":"critical|major|minor","description":"...","suggestedFix":"CSS rule..."}]}`,
              anthropic, {
                images: [
                  ...(figmaDesktop ? [{ data: figmaDesktop, mimeType: 'image/jpeg' as const }] : []),
                  ...(currentWpScreenshot ? [{ data: currentWpScreenshot, mimeType: 'image/jpeg' as const }] : []),
                ],
              }
            );
            const deepJson = deepResult.text.match(/\{[\s\S]*\}/);
            if (deepJson) {
              const deepParsed = JSON.parse(deepJson[0]);
              if (deepParsed.differences?.length > 0) {
                allDiffs = deepParsed.differences;
                // Update comparison data with new diffs
                comparisonData = {
                  ...comparisonData,
                  results: { desktop: { score: deepParsed.score || lastScore, differences: allDiffs } },
                };
                console.log(`[pageforge] Deep analysis found ${allDiffs.length} subtle differences`);
              }
            }
          } catch (err) {
            console.warn('[pageforge] Deep analysis failed:', err);
          }
        }

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

        // Build category-aware targeting guidance (Change 2)
        let categoryGuidance = '';
        if (lastCategoryScores) {
          const weights: Record<string, number> = {
            text: 0.20, sections: 0.15, order: 0.10, layout: 0.15,
            color: 0.10, typography: 0.10, images: 0.08, buttons: 0.05,
            footer: 0.04, artifacts: 0.03
          };
          const gaps = Object.entries(lastCategoryScores)
            .map(([cat, score]) => ({ cat, score: score as number, weight: weights[cat] || 0,
              potentialGain: (100 - (score as number)) * (weights[cat] || 0) }))
            .filter(g => g.potentialGain > 0)
            .sort((a, b) => b.potentialGain - a.potentialGain);

          if (gaps.length > 0) {
            categoryGuidance = `\nCATEGORY SCORE BREAKDOWN (fix highest-impact gaps FIRST):
${gaps.slice(0, 5).map((g, i) =>
  `${i+1}. ${g.cat.toUpperCase()}: ${g.score}/100 (weight ${Math.round(g.weight*100)}%) - fixing to 100 gains +${g.potentialGain.toFixed(1)}% overall`
).join('\n')}
FOCUS on the top 2-3 categories. One text fix is worth more than five spacing fixes.\n`;
          }
        }

        // Build fix history context (Change 4)
        let fixHistoryContext = '';
        if (allChanges.length > 0) {
          const recentFixes = allChanges.slice(-15).map((c, i) => `${i+1}. ${c}`).join('\n');
          fixHistoryContext = `\nALREADY FIXED IN PREVIOUS ITERATIONS (DO NOT re-fix these):\n${recentFixes}\nFocus ONLY on remaining differences listed below.\n`;
        }

        // For Divi 5: use search/replace patches (safer for long JSON lines)
        // For Gutenberg: use line-based edits
        let fixPrompt: string;
        let formattedMarkup: string;

        if (isDivi5Fix) {
          // Show markup as-is (blocks are already one-per-line)
          formattedMarkup = currentMarkup;

          // Dynamic scaling: early iterations focus on fewer diffs, late iterations sweep more
          // After rollback, halve the diffs to reduce corruption probability
          let maxDiffs = currentIteration <= 4 ? 8 : currentIteration <= 8 ? 12 : 16;
          if (previousWasRollback) {
            maxDiffs = Math.max(4, Math.floor(maxDiffs / 2));
            console.log(`[pageforge] Post-rollback: reducing max diffs to ${maxDiffs}`);
          }
          const topDiffs = sortedDiffs.slice(0, maxDiffs);

          fixPrompt = `Fix this Divi 5 WordPress page to better match the Figma design.

${imageContext}

This is NATIVE Divi 5 block markup using <!-- wp:divi/{module} {JSON} --> format.
Each block has JSON attributes that control its appearance. DO NOT convert to Gutenberg or HTML.

Iteration ${currentIteration}/${maxLoops} - Current VQA score: ${lastScore}% (target: ${threshold}%)
${categoryGuidance}${fixHistoryContext}${sectionMapContext}
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
2. Keep patches SMALL and TARGETED. Max ${previousWasRollback ? Math.max(4, Math.floor((currentIteration <= 4 ? 16 : 24) / 2)) : (currentIteration <= 4 ? 16 : 24)} patches per iteration.
3. Make sure the "search" string is unique and exists exactly as-is in the markup.
4. DO NOT remove or modify EXISTING CSS rules in the <style> block. Only ADD new rules before </style>.
5. DO NOT add new HTML elements or convert Divi 5 blocks to Gutenberg/HTML.
6. Focus on the TOP 3-5 most impactful changes. Quality over quantity.

SCORING HARD CAPS (you CANNOT exceed these scores without fixing the issue):
- Wrong heading/body text = max 70% overall. FIX TEXT FIRST.
- Missing section = max 60% overall.
- Wrong section order = max 75% overall.
If any of these exist in the diffs above, they MUST be your #1 priority.

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
            temperature: 0.15,
            images: images.length > 0 ? images : undefined,
          }
        );

        // Save markup, structural score, and diffs before edits for potential rollback
        previousMarkup = currentMarkup;
        const previousStructuralScore = currentStructuralScore;
        previousDiffs = Object.values(comparisonData.results as Record<string, any>)
          .flatMap((r: any) => (r.differences || []));
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
                    // No fuzzy matching - failed patches get reported to AI for next iteration
                    skippedCount++;
                    iterationFailedPatches.push({
                      search: patch.search.substring(0, 200),
                      description: patch.description || 'unknown fix',
                    });
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
            currentStructuralScore = previousStructuralScore;
            fixApplied = false;
            stallCount++;
            if (stallCount >= 4) break;
            continue;
          }
        }

        // 3.55. Validate Divi 5 block JSON integrity after patches
        if ((build.page_builder || 'gutenberg') === 'divi5') {
          const blockJsonRegex = /<!-- wp:divi\/\w+\s+(\{[\s\S]*?\})\s*-->/g;
          let jsonMatch2;
          let brokenJsonCount = 0;
          while ((jsonMatch2 = blockJsonRegex.exec(currentMarkup)) !== null) {
            try { JSON.parse(jsonMatch2[1]); } catch { brokenJsonCount++; }
          }
          if (brokenJsonCount > 0) {
            console.warn(`[pageforge] ${brokenJsonCount} Divi 5 blocks have broken JSON after patches - rolling back`);
            currentMarkup = previousMarkup || currentMarkup;
            currentStructuralScore = previousStructuralScore;
            fixApplied = false;
            stallCount++;
            if (stallCount >= 4) break;
            continue;
          }
        }

        // 3.6. Re-run structural QA inside the loop to update score cap dynamically
        // This is critical: without this, structuralScore stays frozen at its pre-loop value
        // and the visual score is capped at structuralScore+10 forever
        const sqaRecheck = structuralQA(currentMarkup, figmaTextForStructural, classificationsForStructural, figmaColorsForStructural);
        if (sqaRecheck.score > currentStructuralScore) {
          // Only update if score IMPROVED - we don't want patches to lower the cap
          console.log(`[pageforge] Structural score improved: ${currentStructuralScore}% -> ${sqaRecheck.score}%`);
          currentStructuralScore = sqaRecheck.score;
          // Apply any new auto-fixes found (e.g., hallucinated text replacements)
          if (sqaRecheck.autoFixes && sqaRecheck.autoFixes.length > 0) {
            for (const fix of sqaRecheck.autoFixes) {
              if (fix.type === 'replace_text' && currentMarkup.includes(fix.wrongText)) {
                currentMarkup = currentMarkup.split(fix.wrongText).join(fix.correctText);
                console.log(`[pageforge] In-loop structural fix: ${fix.description}`);
                allChanges.push(`Structural fix: ${fix.description}`);
              }
            }
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
          // Update currentWpScreenshot so deep analysis and next iteration use the latest
          currentWpScreenshot = newWpDesktop;
        }

        // 7. Re-compare desktop against Figma
        let newScore = lastScore;
        let newDiffs: any[] = [];

        if (figmaDesktop && newWpDesktop) {
          try {
            const compareResult = await callPageForgeAgent(supabase, buildId, 'pageforge_vqa', 'vqa_fix_loop',
              getSystemPrompt('pageforge_vqa'),
              `Re-evaluate after fix iteration ${currentIteration}. Compare the Figma design against the WordPress page.

Image 1: Figma design (reference)
Image 2: WordPress page (after fix iteration ${currentIteration})

Previous score was ${lastScore}%. Score FRESH - do NOT anchor to this number.
BE STRICT. Wrong text or missing sections = low score regardless of visual polish.
${sectionMapContext}
Score EACH category 0-100, then calculate weighted average:

1. TEXT ACCURACY (20%): Same headlines/body text as Figma? Wrong text = 0.
2. SECTION COMPLETENESS (15%): All Figma sections present? Missing = -15 each.
3. SECTION ORDER (10%): Sections in same top-to-bottom order? Wrong = max 30.
4. LAYOUT STRUCTURE (15%): Column counts, grids, card layouts match? Wrong columns = max 40.
5. COLOR ACCURACY (10%): Backgrounds and text colors match Figma palette? Wrong = max 30.
6. TYPOGRAPHY (10%): Font sizes, weights, hierarchy match? System fonts = max 40.
7. IMAGES (8%): Real images visible, correct positions? Broken = 0.
8. BUTTONS/CTAs (5%): Present and styled correctly? Missing = 0.
9. FOOTER (4%): Structure matches Figma? Generic = max 30.
10. VISUAL ARTIFACTS (3%): No random shapes/dots/lines? Any artifact = 0.

Final = text*0.20 + sections*0.15 + order*0.10 + layout*0.15 + color*0.10 + typo*0.10 + images*0.08 + buttons*0.05 + footer*0.04 + artifacts*0.03

HARD CAPS: Wrong heading text = max 70% overall. Missing section = max 60%. Wrong order = max 75%.

DIVI 5 CSS SELECTORS for suggestedFix:
- .et_pb_section_0, .et_pb_section_1, etc. (0-indexed)
- .et_pb_section_N .et_pb_text_inner, .et_pb_section_N h1/h2, .et_pb_blurb_content, .et_pb_button, .et_pb_image_wrap img

Respond with JSON:
{"score":N,"categoryScores":{"text":N,"sections":N,"order":N,"layout":N,"color":N,"typography":N,"images":N,"buttons":N,"footer":N,"artifacts":N},"differences":[{"area":"...","severity":"critical|major|minor","description":"...","suggestedFix":"CSS rule"}]}`,
              anthropic, {
                temperature: 0.1, // Lower temperature for more deterministic scoring (reduces +-3-5% noise)
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
              // Log category scores and save for targeted fixing
              if (parsed.categoryScores) {
                lastCategoryScores = parsed.categoryScores;
                const cs = parsed.categoryScores;
                console.log(`[pageforge] Category scores: text=${cs.text} sec=${cs.sections} order=${cs.order} lay=${cs.layout} color=${cs.color} typ=${cs.typography} img=${cs.images} btn=${cs.buttons} footer=${cs.footer} art=${cs.artifacts}`);
              }
            }
          } catch (err) {
            console.warn('[pageforge] Re-comparison failed:', err);
          }
        }

        // A3: Cap VQA score with structural score to prevent inflation
        const uncappedScore = newScore;
        newScore = Math.min(newScore, currentStructuralScore + 10);
        if (newScore < uncappedScore) {
          console.log(`[pageforge] Score capped: visual=${uncappedScore}% -> ${newScore}% (structural cap=${currentStructuralScore + 10}%)`);
        }

        scoreHistory.push({ iteration: currentIteration, score: newScore });
        const improvement = newScore - lastScore;

        console.log(`[pageforge] Iteration ${currentIteration}: score ${lastScore}% -> ${newScore}% (${improvement >= 0 ? '+' : ''}${improvement}%)`);

        // ROLLBACK: If score dropped significantly, revert to previous markup
        if (improvement < -5 && previousMarkup) {
          console.log(`[pageforge] Score dropped ${Math.abs(improvement)}% - rolling back to previous markup`);
          currentMarkup = previousMarkup;
          currentStructuralScore = previousStructuralScore; // restore structural score on rollback
          newScore = lastScore; // restore previous score
          if (previousDiffs) { newDiffs = previousDiffs; } // restore pre-patch diffs so next iteration sees real problems
          previousWasRollback = true;
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
        } else {
          previousWasRollback = false; // Reset rollback flag on successful iteration
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

      // Update final desktop score (mobile VQA is handled by separate phases)
      if (currentIteration > 0) {
        await supabase.from('pageforge_builds').update({
          vqa_score_desktop: lastScore,
          vqa_score_overall: lastScore,
          build_stage: 'desktop',
          updated_at: new Date().toISOString(),
        }).eq('id', buildId);
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
    // PHASE 13: FUNCTIONAL QA - Desktop links, Lighthouse, a11y
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
    // PHASE 22: SEO CONFIG - Meta tags, headings, Yoast
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
    // PHASE 23: REPORT GENERATION - AI compiles final report
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

    // -----------------------------------------------------------------------
    // PHASE 14: MOBILE MARKUP GENERATION - Responsive CSS from Mobile Figma
    // -----------------------------------------------------------------------
    case 'mobile_markup_generation': {
      const markupData = artifacts.markup_generation;
      if (!markupData?.markup) throw new Error('Missing markup_generation artifacts');

      // Skip if no mobile Figma provided
      if (!build.figma_file_key_mobile) {
        console.log('[pageforge] No mobile Figma - generating basic responsive CSS');
        // Run mobile audit to find issues to fix
        const deployData = artifacts.deploy_draft;
        if (deployData?.draftUrl) {
          const mobileAudit = await runMobileAudit(deployData.draftUrl);
          if (mobileAudit.hasHorizontalScroll || mobileAudit.fixedWidthElements.length > 0) {
            const mobileCSS = `@media (max-width: 768px) {
  .et_pb_section, .et_pb_row { max-width: 100vw !important; overflow-x: hidden !important; padding-left: 15px !important; padding-right: 15px !important; }
  .et_pb_column { width: 100% !important; }
  img { max-width: 100% !important; height: auto !important; }
}`;
            await updateBuildArtifacts(supabase, buildId, 'mobile_markup_generation', { mobileCSS, source: 'auto-generated', hasMobileFigma: false });
          } else {
            await updateBuildArtifacts(supabase, buildId, 'mobile_markup_generation', { mobileCSS: '', source: 'none-needed', hasMobileFigma: false });
          }
        } else {
          await updateBuildArtifacts(supabase, buildId, 'mobile_markup_generation', { mobileCSS: '', source: 'skipped', hasMobileFigma: false });
        }
        break;
      }

      // Fetch mobile Figma design data
      const figmaClient = createFigmaClient(siteProfile.figma_personal_token!);
      const mobileNodeIds = build.figma_node_ids_mobile || [];
      let mobileFigmaData: any = null;

      if (mobileNodeIds.length > 0) {
        const mobileNodes = await figmaGetFileNodes(figmaClient, build.figma_file_key_mobile, mobileNodeIds);
        mobileFigmaData = mobileNodes;
      } else {
        const mobileFile = await figmaGetFile(figmaClient, build.figma_file_key_mobile);
        mobileFigmaData = mobileFile;
      }

      // Extract mobile design tokens
      const mobileColors = figmaExtractColors(mobileFigmaData);
      const mobileTypography = figmaExtractTypography(mobileFigmaData);
      const mobileSections = figmaExtractSections(mobileFigmaData);

      // Get mobile Figma screenshot for reference
      let mobileFigmaScreenshot: string | null = null;
      try {
        const nodeId = mobileNodeIds[0] || mobileFigmaData?.document?.children?.[0]?.id;
        if (nodeId) {
          const imgResp = await figmaGetImages(figmaClient, build.figma_file_key_mobile, [nodeId], { format: 'jpg', scale: 0.5 });
          const imgUrl = Object.values(imgResp.images).find(Boolean);
          if (imgUrl) {
            const buffer = await figmaDownloadImage(imgUrl);
            mobileFigmaScreenshot = await resizeIfNeeded(buffer.toString('base64'));
          }
        }
      } catch (err) {
        console.warn('[pageforge] Failed to get mobile Figma screenshot:', err);
      }

      // AI generates responsive CSS by comparing desktop markup with mobile Figma
      const existingMarkup = markupData.markup.substring(0, 4000);
      const mobileSectionSummary = mobileSections.map((s: FigmaSection, i: number) =>
        `${i + 1}. "${s.name}" - ${s.width}x${s.height}px`
      ).join('\n');

      const mobileGenResult = await callPageForgeAgent(supabase, buildId, 'pageforge_builder', 'mobile_markup_generation',
        getSystemPrompt('pageforge_builder'),
        `Generate responsive CSS overrides to make the desktop WordPress page match this MOBILE Figma design.

MOBILE FIGMA SECTIONS:
${mobileSectionSummary}

MOBILE TYPOGRAPHY: ${JSON.stringify(mobileTypography).substring(0, 1000)}
MOBILE COLORS: ${JSON.stringify(mobileColors).substring(0, 500)}

CURRENT DESKTOP MARKUP (first 4000 chars):
${existingMarkup}

Generate ONLY @media CSS rules that adapt the desktop layout to match the mobile Figma design.
Rules:
1. Use @media (max-width: 768px) for tablet and @media (max-width: 480px) for mobile-specific
2. Target Divi 5 classes: .et_pb_section_N, .et_pb_row, .et_pb_column, etc.
3. Use !important to override Divi inline styles
4. Stack columns vertically, adjust font sizes, padding, margins
5. Ensure no horizontal scroll (max-width: 100vw, overflow-x: hidden)

${mobileFigmaScreenshot ? 'Image 1: Mobile Figma design reference' : ''}

Respond with JSON:
{"mobileCSS":"@media (max-width: 768px) { ... }","changes":["description of each change"]}`,
        anthropic, {
          ...(mobileFigmaScreenshot ? { images: [{ data: mobileFigmaScreenshot, mimeType: 'image/jpeg' }] } : {}),
          maxTokens: 8000,
        }
      );

      let mobileCSS = '';
      try {
        const jsonMatch = mobileGenResult.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          mobileCSS = parsed.mobileCSS || '';
        }
      } catch { /* use empty */ }

      await updateBuildArtifacts(supabase, buildId, 'mobile_markup_generation', {
        mobileCSS,
        mobileFigmaScreenshot,
        hasMobileFigma: true,
        source: 'figma-guided',
      });
      console.log(`[pageforge] Mobile CSS generated: ${mobileCSS.length} chars`);
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 15: MOBILE DEPLOY - Push mobile responsive styles to WordPress
    // -----------------------------------------------------------------------
    case 'mobile_deploy': {
      const mobileData = artifacts.mobile_markup_generation;
      const markupData = artifacts.markup_generation;
      if (!markupData?.markup) throw new Error('Missing markup_generation artifacts');

      const mobileCSS = mobileData?.mobileCSS || '';
      if (!mobileCSS) {
        console.log('[pageforge] No mobile CSS to deploy');
        await updateBuildArtifacts(supabase, buildId, 'mobile_deploy', { skipped: true, reason: 'No mobile CSS' });
        break;
      }

      // Inject mobile CSS into existing markup
      let currentMarkup = markupData.markup;
      const styleMatch = currentMarkup.match(/<\/style>/);
      if (styleMatch) {
        currentMarkup = currentMarkup.replace('</style>', `\n/* Mobile responsive overrides */\n${mobileCSS}\n</style>`);
      } else {
        currentMarkup = `<style>\n${mobileCSS}\n</style>\n${currentMarkup}`;
      }

      // Deploy to WordPress
      if (build.wp_page_id && siteProfile.wp_username && siteProfile.wp_app_password) {
        const wpClient = createWpClient({ restUrl: siteProfile.wp_rest_url, username: siteProfile.wp_username, appPassword: siteProfile.wp_app_password });
        const fixBuilder = build.page_builder || 'gutenberg';
        await wpUpdatePage(wpClient, build.wp_page_id, { content: prepareMarkupForDeploy(currentMarkup, fixBuilder) });
        await new Promise(resolve => setTimeout(resolve, 10000)); // wait for WP cache
      }

      await updateBuildArtifacts(supabase, buildId, 'markup_generation', { ...markupData, markup: currentMarkup });
      await updateBuildArtifacts(supabase, buildId, 'mobile_deploy', { deployed: true, cssLength: mobileCSS.length });
      console.log(`[pageforge] Mobile CSS deployed (${mobileCSS.length} chars)`);
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 16: MOBILE VQA CAPTURE - Screenshot at 375px + mobile Figma
    // -----------------------------------------------------------------------
    case 'mobile_vqa_capture': {
      const deployData = artifacts.deploy_draft;
      if (!deployData?.draftUrl) throw new Error('Missing deploy_draft artifacts');

      // Capture WordPress at mobile width
      const wpMobile = await captureScreenshotAtBreakpoint(deployData.draftUrl, 375);

      // Export mobile Figma screenshot (use mobile Figma file if available, else desktop)
      let figmaMobileScreenshot: string | null = null;
      const mobileFigmaKey = build.figma_file_key_mobile || build.figma_file_key;
      const mobileNodeIds = build.figma_node_ids_mobile || build.figma_node_ids;

      if (siteProfile.figma_personal_token && mobileNodeIds?.length > 0) {
        try {
          const figmaClient = createFigmaClient(siteProfile.figma_personal_token);
          const imageResponse = await figmaGetImages(figmaClient, mobileFigmaKey, [mobileNodeIds[0]], { format: 'jpg', scale: 0.5 });
          const firstUrl = Object.values(imageResponse.images).find(Boolean);
          if (firstUrl) {
            const buffer = await figmaDownloadImage(firstUrl);
            figmaMobileScreenshot = await resizeIfNeeded(buffer.toString('base64'));
          }
        } catch (err) {
          console.warn('[pageforge] Failed to export mobile Figma screenshot:', err);
        }
      }

      await updateBuildArtifacts(supabase, buildId, 'mobile_vqa_capture', {
        wpMobile,
        figmaMobileScreenshot,
        hasMobileFigma: !!build.figma_file_key_mobile,
      });
      console.log(`[pageforge] Mobile VQA capture: WP=${!!wpMobile}, Figma=${!!figmaMobileScreenshot}`);
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 17: MOBILE VQA COMPARISON - Compare WP mobile vs Mobile Figma
    // -----------------------------------------------------------------------
    case 'mobile_vqa_comparison': {
      const captureData = artifacts.mobile_vqa_capture;
      if (!captureData) throw new Error('Missing mobile_vqa_capture artifacts');

      const { wpMobile, figmaMobileScreenshot, hasMobileFigma } = captureData;
      const threshold = siteProfile.vqa_pass_threshold || 80;
      let mobileScore = 0;
      let differences: any[] = [];

      if (wpMobile && figmaMobileScreenshot && hasMobileFigma) {
        // Full comparison: mobile WP vs mobile Figma
        try {
          const vqaResult = await callPageForgeAgent(supabase, buildId, 'pageforge_vqa', 'mobile_vqa_comparison',
            getSystemPrompt('pageforge_vqa'),
            `Compare the MOBILE Figma design against the WordPress page at MOBILE (375px).

Image 1: Mobile Figma design (the SOURCE OF TRUTH for mobile layout)
Image 2: WordPress page at 375px (what was built)

This is a MOBILE-SPECIFIC comparison. The mobile Figma may have different layout than desktop:
- Different column stacking
- Different font sizes
- Different spacing/padding
- Different image sizes or cropping
- Elements may be hidden or reordered on mobile

Evaluate:
1. LAYOUT MATCH: Does the WP mobile layout match the mobile Figma layout? Columns stacked correctly?
2. TYPOGRAPHY: Font sizes match mobile Figma? Headings proportional?
3. SPACING: Padding and margins match mobile design?
4. IMAGES: Correct sizing and cropping for mobile?
5. NAVIGATION: Mobile nav matches Figma (hamburger menu, etc.)?
6. NO HORIZONTAL SCROLL: Critical mobile issue

Scoring: 0-100 (100 = perfect mobile match)
Respond with JSON:
{"score":N,"differences":[{"area":"element","severity":"critical|major|minor","description":"specific issue","suggestedFix":"CSS @media fix"}]}`,
            anthropic, {
              images: [
                { data: figmaMobileScreenshot, mimeType: 'image/jpeg' },
                { data: wpMobile, mimeType: 'image/jpeg' },
              ],
            }
          );

          const jsonMatch = vqaResult.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            mobileScore = parsed.score || 0;
            differences = parsed.differences || [];
          }
        } catch (err) {
          console.warn('[pageforge] Mobile VQA comparison failed:', err);
        }
      } else if (wpMobile) {
        // No mobile Figma - just evaluate responsive quality
        try {
          const mobileAudit = await runMobileAudit(artifacts.deploy_draft?.draftUrl || '');
          const auditContext = mobileAudit.hasHorizontalScroll
            ? `CRITICAL: Page has ${mobileAudit.overflowPx}px horizontal overflow`
            : 'No horizontal scroll (good)';

          const vqaResult = await callPageForgeAgent(supabase, buildId, 'pageforge_vqa', 'mobile_vqa_comparison',
            getSystemPrompt('pageforge_vqa'),
            `Evaluate this WordPress page at MOBILE (375px) for responsive quality.
Image 1: WordPress page at 375px.
${auditContext}
Score 0-100 for mobile usability.
Respond with JSON: {"score":N,"differences":[{"area":"...","severity":"critical|major|minor","description":"...","suggestedFix":"..."}]}`,
            anthropic, { images: [{ data: wpMobile, mimeType: 'image/jpeg' }] }
          );
          const jsonMatch = vqaResult.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            mobileScore = parsed.score || 60;
            differences = parsed.differences || [];
          }
        } catch (err) {
          mobileScore = 60;
        }
      }

      const passed = mobileScore >= threshold;

      await supabase.from('pageforge_builds').update({
        vqa_score_mobile: mobileScore,
        vqa_score_mobile_figma: hasMobileFigma ? mobileScore : null,
        build_stage: 'mobile',
        updated_at: new Date().toISOString(),
      }).eq('id', buildId);

      const fixSuggestions = differences.filter((d: any) => d.suggestedFix).map((d: any) => d.suggestedFix);
      await updateBuildArtifacts(supabase, buildId, 'mobile_vqa_comparison', {
        mobileScore, differences, passed, threshold, fixSuggestions, hasMobileFigma,
      });

      await postBuildMessage(supabase, buildId,
        `Mobile VQA: ${mobileScore}% ${hasMobileFigma ? '(vs mobile Figma)' : '(responsive check)'} (threshold=${threshold}%, ${passed ? 'PASSED' : 'needs fixes'})`,
        'mobile_vqa_comparison');

      console.log(`[pageforge] Mobile VQA: ${mobileScore}% (figma=${hasMobileFigma}, passed=${passed})`);
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 18: MOBILE VQA FIX LOOP - Fix mobile issues
    // -----------------------------------------------------------------------
    case 'mobile_vqa_fix_loop': {
      const compData = artifacts.mobile_vqa_comparison;
      const markupData = artifacts.markup_generation;
      if (!compData || !markupData) throw new Error('Missing upstream artifacts');

      if (compData.passed) {
        await updateBuildArtifacts(supabase, buildId, 'mobile_vqa_fix_loop', { skipped: true, reason: 'Mobile VQA passed' });
        console.log('[pageforge] Mobile VQA passed, skipping fix loop');
        break;
      }

      const maxLoops = Math.min(siteProfile.max_vqa_fix_loops || 10, 10); // Cap mobile fixes at 10
      const threshold = siteProfile.vqa_pass_threshold || 80;
      let currentMarkup = markupData.markup;
      let lastMobileScore = compData.mobileScore || 0;
      const deployData = artifacts.deploy_draft;
      const draftUrl = deployData?.draftUrl;
      if (!draftUrl) throw new Error('Missing draft URL');

      const figmaMobileScreenshot = artifacts.mobile_vqa_capture?.figmaMobileScreenshot;

      for (let iter = 0; iter < maxLoops; iter++) {
        console.log(`[pageforge] Mobile fix iteration ${iter + 1}/${maxLoops} (score: ${lastMobileScore}%)`);

        // Run mobile audit for concrete issues
        const mobileAudit = await runMobileAudit(draftUrl);
        const diffs = compData.differences || [];
        const issueReport = [];

        if (mobileAudit.hasHorizontalScroll) {
          issueReport.push(`Horizontal scroll: ${mobileAudit.overflowPx}px overflow`);
        }
        for (const fw of mobileAudit.fixedWidthElements.slice(0, 5)) {
          issueReport.push(`Fixed width: ${fw.selector} = ${fw.computedWidth}px`);
        }
        for (const d of diffs.slice(0, 8)) {
          issueReport.push(`${d.severity}: ${d.description}`);
        }

        if (issueReport.length === 0 && lastMobileScore >= threshold) break;

        // AI generates mobile CSS fixes
        const fixResult = await callPageForgeAgent(supabase, buildId, 'pageforge_vqa_fix', 'mobile_vqa_fix_loop',
          getSystemPrompt('pageforge_vqa'),
          `Fix these MOBILE issues (375px viewport):

${issueReport.join('\n')}

Current score: ${lastMobileScore}%, target: ${threshold}%

${figmaMobileScreenshot ? 'Image 1: Mobile Figma reference\nImage 2: Current WordPress at 375px' : 'Image 1: Current WordPress at 375px'}

Generate @media CSS fixes. Use !important. Target Divi 5 classes.
Respond with JSON:
{"patches":[{"search":"</style>","replace":"@media (max-width: 768px) { ... }\\n</style>","description":"fix"}]}`,
          anthropic, {
            images: [
              ...(figmaMobileScreenshot ? [{ data: figmaMobileScreenshot, mimeType: 'image/jpeg' as const }] : []),
              ...(await (async () => {
                const shot = await captureScreenshotAtBreakpoint(draftUrl, 375);
                return shot ? [{ data: shot, mimeType: 'image/jpeg' as const }] : [];
              })()),
            ],
            maxTokens: 6000,
          }
        );

        const fixJson = fixResult.text.match(/\{[\s\S]*\}/);
        if (!fixJson) break;

        const fixParsed = JSON.parse(fixJson[0]);
        let patchesApplied = 0;
        for (const patch of (fixParsed.patches || [])) {
          if (patch.search && patch.replace && currentMarkup.includes(patch.search)) {
            currentMarkup = currentMarkup.replace(patch.search, patch.replace);
            patchesApplied++;
          }
        }

        if (patchesApplied === 0) {
          console.log('[pageforge] No mobile patches applied, stopping');
          break;
        }

        // Deploy updated markup
        if (build.wp_page_id && siteProfile.wp_username && siteProfile.wp_app_password) {
          const wpClient = createWpClient({ restUrl: siteProfile.wp_rest_url, username: siteProfile.wp_username, appPassword: siteProfile.wp_app_password });
          await wpUpdatePage(wpClient, build.wp_page_id, { content: prepareMarkupForDeploy(currentMarkup, build.page_builder || 'gutenberg') });
          await new Promise(resolve => setTimeout(resolve, 10000));
        }

        await updateBuildArtifacts(supabase, buildId, 'markup_generation', { ...markupData, markup: currentMarkup });

        // Re-score
        const newShot = await captureScreenshotAtBreakpoint(draftUrl, 375);
        if (newShot && figmaMobileScreenshot) {
          try {
            const reScoreResult = await callPageForgeAgent(supabase, buildId, 'pageforge_vqa', 'mobile_vqa_fix_loop',
              getSystemPrompt('pageforge_vqa'),
              `Re-score: Compare mobile Figma (Image 1) vs WordPress at 375px (Image 2). Score 0-100.
Respond with JSON: {"score":N,"differences":[]}`,
              anthropic, {
                images: [
                  { data: figmaMobileScreenshot, mimeType: 'image/jpeg' },
                  { data: newShot, mimeType: 'image/jpeg' },
                ],
              }
            );
            const scoreJson = reScoreResult.text.match(/\{[\s\S]*\}/);
            if (scoreJson) {
              const scoreParsed = JSON.parse(scoreJson[0]);
              lastMobileScore = scoreParsed.score || lastMobileScore;
              compData.differences = scoreParsed.differences || [];
            }
          } catch { /* keep last score */ }
        }

        console.log(`[pageforge] Mobile fix iter ${iter + 1}: applied ${patchesApplied} patches, score=${lastMobileScore}%`);

        if (lastMobileScore >= threshold) {
          console.log(`[pageforge] Mobile VQA PASSED at iteration ${iter + 1}`);
          break;
        }
      }

      await supabase.from('pageforge_builds').update({
        vqa_score_mobile: lastMobileScore,
        vqa_score_mobile_figma: build.figma_file_key_mobile ? lastMobileScore : null,
        updated_at: new Date().toISOString(),
      }).eq('id', buildId);

      // Compute final combined score (desktop 60% + mobile 40%)
      const desktopScore = build.vqa_score_desktop || 0;
      const combinedScore = Math.round(desktopScore * 0.6 + lastMobileScore * 0.4);
      await supabase.from('pageforge_builds').update({
        vqa_score_overall: combinedScore,
        updated_at: new Date().toISOString(),
      }).eq('id', buildId);

      await updateBuildArtifacts(supabase, buildId, 'mobile_vqa_fix_loop', { finalMobileScore: lastMobileScore, combinedScore });
      console.log(`[pageforge] Mobile fix loop done: mobile=${lastMobileScore}%, combined=${combinedScore}%`);
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 19: MOBILE FUNCTIONAL QA - Mobile-specific checks
    // -----------------------------------------------------------------------
    case 'mobile_functional_qa': {
      const deployData = artifacts.deploy_draft;
      if (!deployData?.draftUrl) throw new Error('Missing deploy_draft artifacts');

      const pageUrl = deployData.draftUrl;
      const mobileAudit = await runMobileAudit(pageUrl);

      // Lighthouse mobile audit
      let mobileLighthouse = { performance: 0, accessibility: 0, bestPractices: 0, seo: 0 };
      try {
        const lighthouse = (await import('lighthouse')).default;
        const chromeLauncher = await import('chrome-launcher');
        if (!process.env.CHROME_PATH) process.env.CHROME_PATH = puppeteer.executablePath();
        const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'] });
        try {
          const lhResult = await lighthouse(pageUrl, {
            port: chrome.port, output: 'json', logLevel: 'error',
            onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
            formFactor: 'mobile',
            screenEmulation: { mobile: true, width: 375, height: 812, deviceScaleFactor: 2, disabled: false },
          });
          if (lhResult?.lhr) {
            const cats = lhResult.lhr.categories || {};
            mobileLighthouse = {
              performance: Math.round((cats.performance?.score || 0) * 100),
              accessibility: Math.round((cats.accessibility?.score || 0) * 100),
              bestPractices: Math.round((cats['best-practices']?.score || 0) * 100),
              seo: Math.round((cats.seo?.score || 0) * 100),
            };
          }
        } finally { await chrome.kill(); }
      } catch (err) {
        console.warn('[pageforge] Mobile Lighthouse failed:', err instanceof Error ? err.message : err);
      }

      const checks = {
        noHorizontalScroll: !mobileAudit.hasHorizontalScroll,
        noFixedWidthOverflow: mobileAudit.fixedWidthElements.length === 0,
        adequateTapTargets: mobileAudit.smallTapTargets <= 3,
        lighthousePerf: mobileLighthouse.performance >= (siteProfile.lighthouse_min_score || 70),
        lighthouseA11y: mobileLighthouse.accessibility >= 80,
      };
      const passed = Object.values(checks).filter(Boolean).length;
      const total = Object.keys(checks).length;

      await updateBuildArtifacts(supabase, buildId, 'mobile_functional_qa', {
        mobileAudit: {
          hasHorizontalScroll: mobileAudit.hasHorizontalScroll,
          overflowPx: mobileAudit.overflowPx,
          fixedWidthElements: mobileAudit.fixedWidthElements.length,
          smallTapTargets: mobileAudit.smallTapTargets,
        },
        mobileLighthouse,
        checks,
        passed, total,
      });

      await supabase.from('pageforge_builds').update({
        build_stage: 'complete',
        updated_at: new Date().toISOString(),
      }).eq('id', buildId);

      await postBuildMessage(supabase, buildId,
        `Mobile QA: ${passed}/${total} checks passed. Lighthouse: P=${mobileLighthouse.performance} A=${mobileLighthouse.accessibility}. H-scroll: ${mobileAudit.hasHorizontalScroll ? 'YES' : 'no'}`,
        'mobile_functional_qa');
      console.log(`[pageforge] Mobile QA: ${passed}/${total}, LH P=${mobileLighthouse.performance}`);
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 20: ANIMATION DETECTION - Parse animation annotations from Figma
    // -----------------------------------------------------------------------
    case 'animation_detection': {
      if (!build.has_animation_plan) {
        console.log('[pageforge] No animation plan - skipping');
        await updateBuildArtifacts(supabase, buildId, 'animation_detection', { skipped: true, reason: 'No animation plan' });
        break;
      }

      // Look for animation annotations in the Figma file
      let animationPlan: any[] = [];
      if (siteProfile.figma_personal_token) {
        try {
          const figmaClient = createFigmaClient(siteProfile.figma_personal_token);
          const figmaFile = await figmaGetFile(figmaClient, build.figma_file_key);
          const pages = figmaFile.document.children || [];

          // Check for a second page (common animation plan location) or frames named "Animation"/"Motion"
          let animationNodes: any[] = [];

          // Check second page
          if (pages.length > 1) {
            animationNodes = pages[1].children || [];
            console.log(`[pageforge] Found second Figma page: "${pages[1].name}" with ${animationNodes.length} nodes`);
          }

          // Also check for animation-named frames on first page
          const firstPage = pages[0];
          if (firstPage?.children) {
            const animFrames = firstPage.children.filter((n: any) =>
              /animation|motion|interact|hover/i.test(n.name) && n.visible !== false
            );
            if (animFrames.length > 0) {
              animationNodes = [...animationNodes, ...animFrames];
            }
          }

          // If specific animation node was provided
          if (build.animation_figma_node) {
            const nodeResult = await figmaGetFileNodes(figmaClient, build.figma_file_key, [build.animation_figma_node]);
            if (nodeResult?.nodes) {
              const node = Object.values(nodeResult.nodes)[0];
              if (node) animationNodes = [node];
            }
          }

          if (animationNodes.length > 0) {
            // Get Figma image of animation plan for AI analysis
            const animNodeIds = animationNodes.slice(0, 3).map((n: any) => n.id).filter(Boolean);
            let animScreenshot: string | null = null;
            if (animNodeIds.length > 0) {
              try {
                const imgResp = await figmaGetImages(figmaClient, build.figma_file_key, animNodeIds, { format: 'jpg', scale: 0.5 });
                const imgUrl = Object.values(imgResp.images).find(Boolean);
                if (imgUrl) {
                  const buffer = await figmaDownloadImage(imgUrl);
                  animScreenshot = await resizeIfNeeded(buffer.toString('base64'));
                }
              } catch { /* no screenshot */ }
            }

            // AI parses animation annotations
            const aiResult = await callPageForgeAgent(supabase, buildId, 'pageforge_builder', 'animation_detection',
              getSystemPrompt('pageforge_builder'),
              `Parse these animation annotations from the Figma design into a structured plan.

Look for:
- Scroll-triggered animations (fade in, slide up, etc.)
- Hover effects (scale, color change, shadow)
- Page load animations (hero entrance, staggered cards)
- Parallax effects
- Transition timing and easing

${animScreenshot ? 'Image 1: Animation plan from Figma' : ''}

Node names found: ${animationNodes.map((n: any) => n.name).join(', ')}

Respond with JSON:
{"animations":[{"target":"CSS selector or section name","trigger":"scroll|hover|load","type":"fadeIn|slideUp|scale|parallax|custom","duration":"0.5s","delay":"0s","easing":"ease-out","description":"what it does"}]}`,
              anthropic, {
                ...(animScreenshot ? { images: [{ data: animScreenshot, mimeType: 'image/jpeg' }] } : {}),
              }
            );

            try {
              const jsonMatch = aiResult.text.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                animationPlan = parsed.animations || [];
              }
            } catch { /* empty plan */ }
          }
        } catch (err) {
          console.warn('[pageforge] Animation detection failed:', err);
        }
      }

      await updateBuildArtifacts(supabase, buildId, 'animation_detection', {
        animationPlan,
        animationCount: animationPlan.length,
      });
      console.log(`[pageforge] Detected ${animationPlan.length} animations`);
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 21: ANIMATION IMPLEMENTATION - Apply animations
    // -----------------------------------------------------------------------
    case 'animation_implementation': {
      const animData = artifacts.animation_detection;
      if (!animData || animData.skipped || !animData.animationPlan?.length) {
        console.log('[pageforge] No animations to implement');
        await updateBuildArtifacts(supabase, buildId, 'animation_implementation', { skipped: true, reason: 'No animation plan' });
        break;
      }

      const markupData = artifacts.markup_generation;
      if (!markupData?.markup) throw new Error('Missing markup_generation artifacts');

      const animationPlan = animData.animationPlan;

      // AI generates CSS animations and applies them
      const animResult = await callPageForgeAgent(supabase, buildId, 'pageforge_builder', 'animation_implementation',
        getSystemPrompt('pageforge_builder'),
        `Implement these animations in the WordPress page markup:

ANIMATION PLAN:
${JSON.stringify(animationPlan, null, 2)}

CURRENT MARKUP (first 3000 chars):
${markupData.markup.substring(0, 3000)}

DIVI 5 NATIVE ANIMATIONS (prefer these when possible):
- Module Settings > Advanced > Animation has: fadeIn, slideUp, slideDown, slideLeft, slideRight, bounce, zoom, flip, fold, roll
- Properties: animation_style, animation_direction, animation_duration, animation_delay, animation_intensity, animation_starting_opacity

For animations that Divi 5 can't handle natively, generate CSS @keyframes.

Rules:
1. Use Divi 5 native animation module settings when the animation type matches
2. For custom animations, inject CSS @keyframes + IntersectionObserver JS
3. For hover effects, use CSS :hover transitions
4. For scroll-triggered, use IntersectionObserver with .animate class toggle
5. Keep animations subtle and professional (not distracting)
6. All animation CSS goes in @media (prefers-reduced-motion: no-preference) block

Respond with JSON:
{"patches":[{"search":"string to find in markup","replace":"replacement with animation attributes","description":"what animation this adds"}],"customCSS":"any @keyframes or animation CSS to inject","customJS":"any IntersectionObserver JS to inject"}`,
        anthropic, { maxTokens: 8000 }
      );

      let patchesApplied = 0;
      let currentMarkup = markupData.markup;

      try {
        const jsonMatch = animResult.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);

          // Apply markup patches
          for (const patch of (parsed.patches || [])) {
            if (patch.search && patch.replace && currentMarkup.includes(patch.search)) {
              currentMarkup = currentMarkup.replace(patch.search, patch.replace);
              patchesApplied++;
            }
          }

          // Inject custom CSS
          if (parsed.customCSS) {
            const cssBlock = `\n/* PageForge animations */\n@media (prefers-reduced-motion: no-preference) {\n${parsed.customCSS}\n}`;
            if (currentMarkup.includes('</style>')) {
              currentMarkup = currentMarkup.replace('</style>', `${cssBlock}\n</style>`);
            } else {
              currentMarkup = `<style>${cssBlock}</style>\n${currentMarkup}`;
            }
          }

          // Inject custom JS
          if (parsed.customJS) {
            currentMarkup += `\n<script>\n/* PageForge animation observers */\n${parsed.customJS}\n</script>`;
          }
        }
      } catch (err) {
        console.warn('[pageforge] Animation implementation parsing failed:', err);
      }

      // Deploy if patches were applied
      if (patchesApplied > 0 && build.wp_page_id && siteProfile.wp_username && siteProfile.wp_app_password) {
        const wpClient = createWpClient({ restUrl: siteProfile.wp_rest_url, username: siteProfile.wp_username, appPassword: siteProfile.wp_app_password });
        await wpUpdatePage(wpClient, build.wp_page_id, { content: prepareMarkupForDeploy(currentMarkup, build.page_builder || 'gutenberg') });
        await updateBuildArtifacts(supabase, buildId, 'markup_generation', { ...markupData, markup: currentMarkup });
        await new Promise(resolve => setTimeout(resolve, 8000));
      }

      await updateBuildArtifacts(supabase, buildId, 'animation_implementation', {
        animationsApplied: patchesApplied,
        totalPlanned: animationPlan.length,
      });
      console.log(`[pageforge] Animations: ${patchesApplied}/${animationPlan.length} applied`);
      break;
    }

    default:
      console.warn(`[pageforge] Unknown phase: ${phase}`);
  }
}

// ============================================================================
// ELEMENT MAPPING KNOWLEDGE BASE SEED
// Seeds default Figma-to-Divi5 mappings when knowledge base is empty.
// ============================================================================

const DEFAULT_ELEMENT_MAPPINGS: Array<{ figma_element_type: string; divi5_module: string; confidence_score: number }> = [
  { figma_element_type: 'hero', divi5_module: 'divi/section + divi/image + divi/text + divi/button', confidence_score: 0.8 },
  { figma_element_type: 'hero_banner', divi5_module: 'divi/hero', confidence_score: 0.85 },
  { figma_element_type: 'features', divi5_module: 'divi/section + divi/blurb (repeated)', confidence_score: 0.8 },
  { figma_element_type: 'services', divi5_module: 'divi/section + divi/blurb (repeated)', confidence_score: 0.8 },
  { figma_element_type: 'gallery', divi5_module: 'divi/section + divi/gallery', confidence_score: 0.75 },
  { figma_element_type: 'image_grid', divi5_module: 'divi/section + divi/image (grid)', confidence_score: 0.7 },
  { figma_element_type: 'testimonials', divi5_module: 'divi/section + divi/testimonial', confidence_score: 0.85 },
  { figma_element_type: 'contact', divi5_module: 'divi/section + divi/contact-form', confidence_score: 0.9 },
  { figma_element_type: 'cta', divi5_module: 'divi/section + divi/cta', confidence_score: 0.85 },
  { figma_element_type: 'about', divi5_module: 'divi/section + divi/text + divi/image', confidence_score: 0.75 },
  { figma_element_type: 'text_block', divi5_module: 'divi/section + divi/text', confidence_score: 0.9 },
  { figma_element_type: 'pricing', divi5_module: 'divi/section + divi/pricing-table', confidence_score: 0.85 },
  { figma_element_type: 'team', divi5_module: 'divi/section + divi/person', confidence_score: 0.85 },
  { figma_element_type: 'stats', divi5_module: 'divi/section + divi/number-counter', confidence_score: 0.8 },
  { figma_element_type: 'counters', divi5_module: 'divi/section + divi/number-counter', confidence_score: 0.8 },
  { figma_element_type: 'video', divi5_module: 'divi/section + divi/video', confidence_score: 0.9 },
  { figma_element_type: 'faq', divi5_module: 'divi/section + divi/accordion', confidence_score: 0.9 },
  { figma_element_type: 'accordion', divi5_module: 'divi/section + divi/accordion', confidence_score: 0.9 },
  { figma_element_type: 'tabs', divi5_module: 'divi/section + divi/tabs', confidence_score: 0.85 },
  { figma_element_type: 'blog', divi5_module: 'divi/section + divi/blog', confidence_score: 0.85 },
  { figma_element_type: 'footer', divi5_module: 'divi/section + divi/text (multi-column)', confidence_score: 0.7 },
  { figma_element_type: 'navigation', divi5_module: 'divi/section + divi/menu', confidence_score: 0.8 },
  { figma_element_type: 'slider', divi5_module: 'divi/section + divi/slider', confidence_score: 0.85 },
  { figma_element_type: 'carousel', divi5_module: 'divi/section + divi/group-carousel', confidence_score: 0.8 },
  { figma_element_type: 'before_after', divi5_module: 'divi/section + divi/before-after-image', confidence_score: 0.9 },
  { figma_element_type: 'map', divi5_module: 'divi/section + divi/map', confidence_score: 0.9 },
  { figma_element_type: 'social', divi5_module: 'divi/section + divi/social-media-follow', confidence_score: 0.85 },
  { figma_element_type: 'login', divi5_module: 'divi/section + divi/login', confidence_score: 0.9 },
  { figma_element_type: 'portfolio', divi5_module: 'divi/section + divi/filterable-portfolio', confidence_score: 0.8 },
  { figma_element_type: 'countdown', divi5_module: 'divi/section + divi/countdown-timer', confidence_score: 0.9 },
  { figma_element_type: 'icon_list', divi5_module: 'divi/section + divi/icon-list', confidence_score: 0.85 },
  { figma_element_type: 'progress_bar', divi5_module: 'divi/section + divi/bar-counters', confidence_score: 0.85 },
];

async function seedKnowledgeBaseIfEmpty(siteProfileId: string): Promise<void> {
  const { count } = await supabase
    .from('pageforge_element_mappings')
    .select('id', { count: 'exact', head: true })
    .eq('site_profile_id', siteProfileId);

  if (count && count > 0) return; // Already seeded

  const rows = DEFAULT_ELEMENT_MAPPINGS.map(m => ({
    site_profile_id: siteProfileId,
    figma_element_type: m.figma_element_type,
    divi5_module: m.divi5_module,
    confidence_score: m.confidence_score,
    times_approved: 1,
    times_overridden: 0,
  }));

  const { error } = await supabase.from('pageforge_element_mappings').insert(rows);
  if (error) {
    console.warn('[pageforge] Failed to seed knowledge base:', error.message);
  } else {
    console.log(`[pageforge] Seeded knowledge base with ${rows.length} default mappings for site ${siteProfileId}`);
  }
}

// ============================================================================
// ELEMENT MAPPING PROPOSAL (called before element_mapping_gate)
// ============================================================================

async function executeElementMappingProposal(
  buildId: string,
  siteProfile: PageForgeSiteProfile,
  build: PageForgeBuild,
  anthropic: Anthropic
): Promise<void> {
  const artifacts = (build.artifacts || {}) as Record<string, any>;
  const classifications = artifacts.section_classification;

  if (!classifications?.length) {
    console.log('[pageforge] No section classifications - skipping mapping proposal');
    return;
  }

  // Seed knowledge base with defaults if empty (first build for this site)
  await seedKnowledgeBaseIfEmpty(build.site_profile_id);

  // Check if proposals already exist (e.g., on resume)
  const { count } = await supabase
    .from('pageforge_build_mappings')
    .select('id', { count: 'exact', head: true })
    .eq('build_id', buildId);
  if (count && count > 0) {
    console.log(`[pageforge] Mapping proposals already exist (${count}), skipping`);
    return;
  }

  // Fetch knowledge base for this site profile
  const { data: knowledgeBase } = await supabase
    .from('pageforge_element_mappings')
    .select('figma_element_type, divi5_module, confidence_score, times_approved, times_overridden')
    .eq('site_profile_id', build.site_profile_id)
    .order('confidence_score', { ascending: false });

  const kbContext = knowledgeBase?.length
    ? `\nKNOWN MAPPINGS (from previous builds):\n${knowledgeBase.map((k: any) => `- ${k.figma_element_type} -> ${k.divi5_module} (confidence: ${Math.round(k.confidence_score * 100)}%, approved: ${k.times_approved}, overridden: ${k.times_overridden})`).join('\n')}`
    : '';

  const sectionsJson = classifications.map((c: any, i: number) => ({
    index: i,
    name: c.sectionName || c.name || `Section ${i}`,
    type: c.type || 'unknown',
    childCount: c.childCount || 0,
    hasImages: c.hasImages || false,
    dimensions: c.dimensions || null,
  }));

  // AI proposes Divi 5 module mapping for each section
  const result = await callPageForgeAgent(supabase, buildId, 'pageforge_builder', 'element_mapping_gate',
    getSystemPrompt('pageforge_builder'),
    `Propose the best Divi 5 module for each Figma section.

SECTIONS:
${JSON.stringify(sectionsJson, null, 2)}
${kbContext}

PAGE BUILDER: ${build.page_builder}

For each section, recommend the best Divi 5 module combination. Common mappings:
- hero/banner -> divi/section + divi/image + divi/text + divi/button
- features/services -> divi/section + divi/blurb (repeated)
- gallery -> divi/section + divi/gallery or divi/image (grid)
- testimonials -> divi/section + divi/testimonial
- contact -> divi/section + divi/contact-form
- cta -> divi/section + divi/cta
- text/about -> divi/section + divi/text
- pricing -> divi/section + divi/pricing-table
- team -> divi/section + divi/person
- stats/counters -> divi/section + divi/number-counter
- video -> divi/section + divi/video
- accordion/faq -> divi/section + divi/accordion
- tabs -> divi/section + divi/tabs
- blog -> divi/section + divi/blog
- footer -> divi/section + multiple divi/text

Respond with JSON:
{"mappings":[{"section_index":0,"section_name":"...","figma_element_type":"hero","proposed_divi5_module":"divi/section + divi/image + divi/text + divi/button","proposed_config":{},"proposal_reasoning":"why this module combo fits"}]}`,
    anthropic
  );

  try {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const mappings = parsed.mappings || [];

      if (mappings.length > 0) {
        const rows = mappings.map((m: any) => ({
          build_id: buildId,
          section_index: m.section_index,
          section_name: m.section_name || `Section ${m.section_index}`,
          figma_element_type: m.figma_element_type || 'unknown',
          proposed_divi5_module: m.proposed_divi5_module,
          proposed_config: m.proposed_config || {},
          proposal_reasoning: m.proposal_reasoning || null,
          decision: 'pending',
        }));

        await supabase.from('pageforge_build_mappings').insert(rows);
        console.log(`[pageforge] Inserted ${rows.length} mapping proposals`);
      }
    }
  } catch (err) {
    console.warn('[pageforge] Failed to parse mapping proposals:', err);
  }

  await updateBuildArtifacts(supabase, buildId, 'element_mapping_gate', { proposalsGenerated: true });
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

// ============================================================================
// COLOR ANALYSIS HELPERS
// ============================================================================

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (!match) return null;
  return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) };
}

function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  const sRGB = [rgb.r / 255, rgb.g / 255, rgb.b / 255];
  const linear = sRGB.map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function getSaturation(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const l = (max + min) / 2;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

function findPrimaryDark(colors: string[]): string {
  const sorted = colors
    .filter(c => c.startsWith('#') && c.length >= 7)
    .map(c => ({ hex: c, lum: relativeLuminance(c) }))
    .sort((a, b) => a.lum - b.lum);
  return sorted.find(c => c.lum < 0.15)?.hex || '#001738';
}

function findAccentColor(colors: string[]): string {
  const sorted = colors
    .filter(c => c.startsWith('#') && c.length >= 7)
    .map(c => ({ hex: c, sat: getSaturation(c), lum: relativeLuminance(c) }))
    .filter(c => c.lum > 0.15 && c.lum < 0.85) // Not too dark, not too light
    .sort((a, b) => b.sat - a.sat);
  return sorted[0]?.hex || '#cc2336';
}

// ============================================================================
// COLUMN COUNT DETECTION FROM FIGMA LAYOUT
// ============================================================================

function detectColumnCount(sectionNode: FigmaNode): number {
  const directChildren = (sectionNode.children || [])
    .filter(c => c.absoluteBoundingBox && c.visible !== false);
  if (directChildren.length < 2) return 1;

  // Group children by similar Y position (within 50px tolerance)
  const yGroups: Map<number, number> = new Map();
  for (const child of directChildren) {
    const y = Math.round((child.absoluteBoundingBox!.y) / 50) * 50;
    yGroups.set(y, (yGroups.get(y) || 0) + 1);
  }

  // Max children at same Y level = probable column count
  const maxCols = Math.max(...yGroups.values());
  return maxCols > 1 ? maxCols : 1;
}

// ============================================================================
// STRUCTURAL QA - Text-based content validation (no screenshots)
// ============================================================================

interface StructuralFix {
  type: 'replace_text';
  wrongText: string;
  correctText: string;
  description: string;
}

function fuzzyTextMatch(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const na = normalize(a), nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  // Word overlap ratio
  const wordsA = new Set(na.split(' '));
  const wordsB = new Set(nb.split(' '));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

function structuralQA(
  markup: string,
  figmaTextContent: FigmaTextContent[],
  classifications: Array<{ sectionId: string; sectionName: string; type: string }>,
  figmaColors: string[]
): { score: number; penalties: string[]; autoFixes: StructuralFix[] } {
  const penalties: string[] = [];
  const autoFixes: StructuralFix[] = [];
  let score = 100;

  // 1. Check for missing Figma headings in markup
  const figmaHeadings = figmaTextContent.filter(t => t.role === 'heading');
  for (const heading of figmaHeadings) {
    const headingLower = heading.text.toLowerCase().trim();
    if (headingLower.length < 3) continue; // skip very short text
    if (!markup.toLowerCase().includes(headingLower.slice(0, 30))) {
      score -= 5;
      penalties.push(`Missing heading: "${heading.text.slice(0, 60)}" from section "${heading.sectionName}"`);
    }
  }

  // 2. Check for hallucinated headings (h1-h3 text not matching ANY Figma text)
  const markupHeadings: string[] = [];
  const headingRegex = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let match;
  while ((match = headingRegex.exec(markup)) !== null) {
    const text = match[1].replace(/<[^>]+>/g, '').trim();
    if (text.length > 3) markupHeadings.push(text);
  }
  // Also check text content in Divi 5 JSON attrs
  const jsonTextRegex = /"value":"(<h[1-3][^"]*>([^<]+)<\/h[1-3]>)"/gi;
  while ((match = jsonTextRegex.exec(markup)) !== null) {
    const text = match[2]?.trim();
    if (text && text.length > 3) markupHeadings.push(text);
  }

  for (const heading of markupHeadings) {
    const bestMatch = figmaTextContent
      .map(t => ({ text: t.text, score: fuzzyTextMatch(heading, t.text) }))
      .sort((a, b) => b.score - a.score)[0];
    if (!bestMatch || bestMatch.score < 0.4) {
      score -= 3;
      penalties.push(`Hallucinated heading: "${heading.slice(0, 60)}" - not found in Figma text`);
      // Try to find the correct heading for this section
      const correctHeading = figmaHeadings.find(h =>
        !markupHeadings.some(mh => fuzzyTextMatch(mh, h.text) > 0.6)
      );
      if (correctHeading) {
        autoFixes.push({
          type: 'replace_text',
          wrongText: heading,
          correctText: correctHeading.text,
          description: `Replace hallucinated "${heading.slice(0, 40)}" with Figma text "${correctHeading.text.slice(0, 40)}"`,
        });
      }
    }
  }

  // 3. Check section count
  const sectionCount = (markup.match(/et_pb_section/g) || []).length / 2; // open + close
  const expectedCount = classifications.length;
  if (sectionCount < expectedCount - 1) {
    score -= 10 * (expectedCount - sectionCount);
    penalties.push(`Missing sections: found ${Math.round(sectionCount)} but expected ${expectedCount}`);
  }

  // 4. Check section ordering (via admin labels in JSON attrs)
  const adminLabels: string[] = [];
  const labelRegex = /"adminLabel":\{"desktop":\{"value":"([^"]+)"\}\}/g;
  while ((match = labelRegex.exec(markup)) !== null) {
    adminLabels.push(match[1].toLowerCase());
  }
  if (adminLabels.length >= 2) {
    const expectedOrder = classifications.map(c => c.sectionName.toLowerCase());
    let orderCorrect = true;
    let lastFoundIdx = -1;
    for (const label of adminLabels) {
      const expectedIdx = expectedOrder.findIndex((name, idx) =>
        idx > lastFoundIdx && (name.includes(label) || label.includes(name))
      );
      if (expectedIdx >= 0) {
        if (expectedIdx < lastFoundIdx) { orderCorrect = false; break; }
        lastFoundIdx = expectedIdx;
      }
    }
    if (!orderCorrect) {
      score -= 8;
      penalties.push('Section order does not match Figma layout');
    }
  }

  // 5. Check for missing buttons/CTAs
  const figmaButtons = figmaTextContent.filter(t => t.role === 'button');
  for (const btn of figmaButtons) {
    if (btn.text.length < 2) continue;
    if (!markup.toLowerCase().includes(btn.text.toLowerCase().slice(0, 20))) {
      score -= 3;
      penalties.push(`Missing button: "${btn.text}" from section "${btn.sectionName}"`);
    }
  }

  // 6. Check primary dark color usage
  const primaryDark = findPrimaryDark(figmaColors);
  if (primaryDark && !markup.toLowerCase().includes(primaryDark.toLowerCase())) {
    // Check for rgba equivalent
    const rgb = hexToRgb(primaryDark);
    const rgbaCheck = rgb ? `${rgb.r},${rgb.g},${rgb.b}` : '';
    if (!rgbaCheck || !markup.includes(rgbaCheck)) {
      score -= 5;
      penalties.push(`Primary dark color ${primaryDark} not found in markup`);
    }
  }

  return { score: Math.max(0, score), penalties, autoFixes };
}

// ============================================================================
// DESIGN PREP SUB-TASKS
// ============================================================================

interface FontValidation {
  fontFamily: string;
  status: 'google_fonts' | 'system_font' | 'unavailable';
  substitute?: string;
}

interface FontMap {
  validated: FontValidation[];
  substitutions: Record<string, string>;
  googleFontsToLoad: string[];
}

// Known Figma-internal and system fonts that need substitution
const FONT_SUBSTITUTION_MAP: Record<string, string> = {
  'Figma Hand': 'Caveat',
  'SF Pro': 'Inter',
  'SF Pro Display': 'Inter',
  'SF Pro Text': 'Inter',
  'SF Mono': 'JetBrains Mono',
  'Segoe UI': 'Open Sans',
  'Helvetica Neue': 'Inter',
  'Apple Color Emoji': 'Noto Color Emoji',
};

const SYSTEM_FONTS = new Set([
  'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana',
  'Courier New', 'Trebuchet MS', 'Comic Sans MS', 'Impact',
  'sans-serif', 'serif', 'monospace',
]);

async function validateFonts(nonStandardFonts: string[], allUsedFonts: string[]): Promise<FontMap> {
  const validated: FontValidation[] = [];
  const substitutions: Record<string, string> = {};
  const googleFontsToLoad: string[] = [];

  for (const font of nonStandardFonts) {
    // Check substitution map first
    if (FONT_SUBSTITUTION_MAP[font]) {
      validated.push({ fontFamily: font, status: 'unavailable', substitute: FONT_SUBSTITUTION_MAP[font] });
      substitutions[font] = FONT_SUBSTITUTION_MAP[font];
      googleFontsToLoad.push(FONT_SUBSTITUTION_MAP[font]);
      continue;
    }

    // Check if it's a system font
    if (SYSTEM_FONTS.has(font)) {
      validated.push({ fontFamily: font, status: 'system_font' });
      continue;
    }

    // Check Google Fonts API
    try {
      const encodedFont = font.replace(/\s+/g, '+');
      const res = await fetch(
        `https://fonts.googleapis.com/css2?family=${encodedFont}:wght@400;700&display=swap`,
        { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      if (res.ok) {
        validated.push({ fontFamily: font, status: 'google_fonts' });
        googleFontsToLoad.push(font);
      } else {
        // Not on Google Fonts - use primary design font as fallback
        const primaryFont = allUsedFonts.find(f => !nonStandardFonts.includes(f)) || 'Inter';
        validated.push({ fontFamily: font, status: 'unavailable', substitute: primaryFont });
        substitutions[font] = primaryFont;
      }
    } catch {
      // Network error - assume available (conservative)
      validated.push({ fontFamily: font, status: 'google_fonts' });
      googleFontsToLoad.push(font);
    }

    // Small delay between requests
    await new Promise(r => setTimeout(r, 200));
  }

  // Add fonts that were already considered "standard" (common web fonts) to the load list
  const commonGoogleFonts = allUsedFonts.filter(f =>
    !nonStandardFonts.includes(f) && !SYSTEM_FONTS.has(f)
  );
  for (const f of commonGoogleFonts) {
    if (!googleFontsToLoad.includes(f)) googleFontsToLoad.push(f);
  }

  return { validated, substitutions, googleFontsToLoad };
}

interface SectionLayout {
  sectionId: string;
  sectionName: string;
  layout: {
    direction: 'horizontal' | 'vertical';
    columns: number;
    gap: number;
    padding: { top: number; right: number; bottom: number; left: number };
    alignment: 'start' | 'center' | 'end' | 'space-between';
    childSizing: 'equal' | 'variable';
    source: 'auto-layout' | 'inferred';
  };
}

interface LayoutMap {
  sections: SectionLayout[];
}

function extractLayoutMap(sections: Array<{ id: string; name: string; node: FigmaNode }>): LayoutMap {
  const result: SectionLayout[] = [];

  for (const section of sections) {
    const node = section.node;
    const children = (node.children || []).filter(c => c.visible !== false && c.absoluteBoundingBox);

    if (children.length === 0) {
      result.push({
        sectionId: section.id,
        sectionName: section.name,
        layout: {
          direction: 'vertical', columns: 1, gap: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          alignment: 'center', childSizing: 'equal', source: 'inferred',
        },
      });
      continue;
    }

    // Check if node has auto-layout
    if (node.layoutMode) {
      const direction = node.layoutMode === 'HORIZONTAL' ? 'horizontal' : 'vertical';
      const columns = direction === 'horizontal' ? children.length : 1;
      result.push({
        sectionId: section.id,
        sectionName: section.name,
        layout: {
          direction,
          columns,
          gap: node.itemSpacing || 0,
          padding: {
            top: node.paddingTop || 0,
            right: node.paddingRight || 0,
            bottom: node.paddingBottom || 0,
            left: node.paddingLeft || 0,
          },
          alignment: 'center',
          childSizing: 'equal',
          source: 'auto-layout',
        },
      });
      continue;
    }

    // Infer layout from absolute positions
    const colCount = detectColumnCount(node);
    const parentBounds = node.absoluteBoundingBox || { x: 0, y: 0, width: 1440, height: 800 };

    // Compute gap: average horizontal distance between same-Y children
    let avgGap = 0;
    if (colCount > 1) {
      const childBounds = children
        .map(c => c.absoluteBoundingBox!)
        .sort((a, b) => a.x - b.x);

      // Group by Y row (50px tolerance)
      const yGroups: Map<number, typeof childBounds> = new Map();
      for (const b of childBounds) {
        const yKey = Math.round(b.y / 50) * 50;
        const group = yGroups.get(yKey) || [];
        group.push(b);
        yGroups.set(yKey, group);
      }

      // Find gaps in the widest row
      const widestRow = [...yGroups.values()].sort((a, b) => b.length - a.length)[0] || [];
      if (widestRow.length > 1) {
        const sorted = widestRow.sort((a, b) => a.x - b.x);
        const gaps: number[] = [];
        for (let i = 1; i < sorted.length; i++) {
          gaps.push(sorted[i].x - (sorted[i - 1].x + sorted[i - 1].width));
        }
        avgGap = gaps.length > 0 ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;
      }
    }

    // Infer alignment from children positions relative to parent
    const firstChild = children[0]?.absoluteBoundingBox;
    const lastChild = children[children.length - 1]?.absoluteBoundingBox;
    let alignment: SectionLayout['layout']['alignment'] = 'center';
    if (firstChild && lastChild && parentBounds.width > 0) {
      const leftMargin = firstChild.x - parentBounds.x;
      const rightMargin = (parentBounds.x + parentBounds.width) - (lastChild.x + lastChild.width);
      if (Math.abs(leftMargin - rightMargin) < 30) alignment = 'center';
      else if (leftMargin < rightMargin * 0.5) alignment = 'start';
      else if (rightMargin < leftMargin * 0.5) alignment = 'end';
    }

    // Check if children have equal widths
    const widths = children.map(c => c.absoluteBoundingBox!.width);
    const avgWidth = widths.reduce((a, b) => a + b, 0) / widths.length;
    const maxDeviation = Math.max(...widths.map(w => Math.abs(w - avgWidth)));
    const childSizing = maxDeviation < avgWidth * 0.15 ? 'equal' : 'variable';

    // Estimate padding from parent bounds vs content area
    const minChildX = Math.min(...children.map(c => c.absoluteBoundingBox!.x));
    const maxChildRight = Math.max(...children.map(c => c.absoluteBoundingBox!.x + c.absoluteBoundingBox!.width));
    const minChildY = Math.min(...children.map(c => c.absoluteBoundingBox!.y));
    const maxChildBottom = Math.max(...children.map(c => c.absoluteBoundingBox!.y + c.absoluteBoundingBox!.height));

    result.push({
      sectionId: section.id,
      sectionName: section.name,
      layout: {
        direction: colCount > 1 ? 'horizontal' : 'vertical',
        columns: colCount,
        gap: Math.max(0, avgGap),
        padding: {
          top: Math.max(0, Math.round(minChildY - parentBounds.y)),
          right: Math.max(0, Math.round((parentBounds.x + parentBounds.width) - maxChildRight)),
          bottom: Math.max(0, Math.round((parentBounds.y + parentBounds.height) - maxChildBottom)),
          left: Math.max(0, Math.round(minChildX - parentBounds.x)),
        },
        alignment,
        childSizing,
        source: 'inferred',
      },
    });
  }

  return { sections: result };
}

interface MobileRule {
  sectionId: string;
  sectionName: string;
  desktop: { columns: number; fontSize: string; padding: string };
  tablet: { columns: number; fontSize: string; padding: string };
  phone: { columns: number; fontSize: string; padding: string };
}

interface MobileRules {
  breakpoints: { tablet: number; phone: number };
  sections: MobileRule[];
  globalRules: string[];
}

function generateMobileRules(
  layoutMap: LayoutMap,
  figmaTextContent: FigmaTextContent[]
): MobileRules {
  const sections: MobileRule[] = [];

  for (const section of layoutMap.sections) {
    const { columns, padding } = section.layout;

    // Get max font size in this section
    const sectionTexts = figmaTextContent.filter(t =>
      t.sectionName.toLowerCase().includes(section.sectionName.toLowerCase()) ||
      section.sectionName.toLowerCase().includes(t.sectionName.toLowerCase())
    );
    const maxFontSize = sectionTexts.length > 0
      ? Math.max(...sectionTexts.map(t => t.fontSize))
      : 16;

    const tabletCols = columns >= 4 ? Math.ceil(columns / 2) : (columns >= 3 ? 2 : columns);
    const phoneCols = 1;

    sections.push({
      sectionId: section.sectionId,
      sectionName: section.sectionName,
      desktop: {
        columns,
        fontSize: `${maxFontSize}px`,
        padding: `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`,
      },
      tablet: {
        columns: tabletCols,
        fontSize: `${Math.floor(maxFontSize * 0.75)}px`,
        padding: `${Math.floor(padding.top * 0.6)}px ${Math.floor(padding.right * 0.6)}px ${Math.floor(padding.bottom * 0.6)}px ${Math.floor(padding.left * 0.6)}px`,
      },
      phone: {
        columns: phoneCols,
        fontSize: `${Math.floor(maxFontSize * 0.58)}px`,
        padding: `${Math.floor(padding.top * 0.4)}px ${Math.floor(padding.right * 0.4)}px ${Math.floor(padding.bottom * 0.4)}px ${Math.floor(padding.left * 0.4)}px`,
      },
    });
  }

  return {
    breakpoints: { tablet: 980, phone: 480 },
    sections,
    globalRules: [
      'overflow-x: hidden',
      'img { max-width: 100%; height: auto; }',
      '.et_pb_column { width: 100% !important; } /* phone only */',
    ],
  };
}

interface NamingIssue {
  nodeId: string;
  name: string;
  type: string;
  pattern: string;
  depth: number;
  parentName?: string;
  resolved?: boolean;
}

function runDeterministicRenaming(issues: NamingIssue[]): Record<string, string> {
  const nameMap: Record<string, string> = {};
  const usedNames = new Set<string>();

  function uniqueName(base: string): string {
    if (!usedNames.has(base)) { usedNames.add(base); return base; }
    let i = 2;
    while (usedNames.has(`${base}-${i}`)) i++;
    const name = `${base}-${i}`;
    usedNames.add(name);
    return name;
  }

  for (const issue of issues) {
    const parentPrefix = issue.parentName
      ? issue.parentName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 20)
      : '';

    let suggestedName = '';
    const type = issue.type.toLowerCase();
    const pattern = issue.pattern;

    if (pattern === 'generic_frame' || type === 'frame') {
      suggestedName = parentPrefix ? `${parentPrefix}-content` : 'content-frame';
    } else if (pattern === 'generic_group' || type === 'group') {
      suggestedName = parentPrefix ? `${parentPrefix}-group` : 'content-group';
    } else if (pattern === 'generic_shape' || type === 'rectangle') {
      suggestedName = parentPrefix ? `${parentPrefix}-bg` : 'background-shape';
    } else if (pattern === 'generic_vector' || type === 'vector') {
      suggestedName = parentPrefix ? `${parentPrefix}-icon` : 'decorative-icon';
    } else if (pattern === 'generic_component') {
      suggestedName = parentPrefix ? `${parentPrefix}-component` : 'ui-component';
    } else if (pattern === 'generic_image') {
      suggestedName = parentPrefix ? `${parentPrefix}-image` : 'content-image';
    } else if (pattern === 'numeric_only') {
      suggestedName = parentPrefix ? `${parentPrefix}-element` : `element-${issue.name}`;
    } else if (pattern === 'untitled') {
      suggestedName = parentPrefix ? `${parentPrefix}-item` : 'untitled-element';
    } else {
      suggestedName = parentPrefix ? `${parentPrefix}-child` : 'nested-element';
    }

    nameMap[issue.nodeId] = uniqueName(suggestedName);
  }

  return nameMap;
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

/**
 * Flatten Divi 5 native block markup into raw HTML.
 * Divi 4 classic builder wraps <!-- wp:divi/* --> block comments in its own
 * et_pb_section/row/text modules, rendering the page blank. By converting
 * blocks to actual HTML elements with matching CSS class names, the CSS
 * fallback from buildDivi5Markup() continues to work and the content renders
 * correctly regardless of Divi version.
 */
function flattenDivi5ToHtml(markup: string): string {
  if (!markup.includes('<!-- wp:divi/')) return markup;
  let content = markup;

  // --- Leaf module blocks (replace BEFORE structural blocks) ---

  // Text modules: extract inner HTML + font styling
  content = content.replace(/<!-- wp:divi\/text\s+([\s\S]+?)\s*-->[\s\S]*?<!-- \/wp:divi\/text -->/g, (_, jsonStr) => {
    try {
      const attrs = JSON.parse(jsonStr);
      const html = attrs?.content?.innerContent?.desktop?.value || '';
      const font = attrs?.content?.decoration?.bodyFont?.body?.font?.desktop?.value;
      const textAlign = attrs?.module?.advanced?.textAlign?.desktop?.value;
      const styles: string[] = [];
      if (font?.family) styles.push(`font-family:'${font.family}',sans-serif`);
      if (font?.size) styles.push(`font-size:${font.size}`);
      if (font?.weight) styles.push(`font-weight:${font.weight}`);
      if (font?.color) styles.push(`color:${font.color}`);
      if (font?.lineHeight) styles.push(`line-height:${font.lineHeight}`);
      if (textAlign) styles.push(`text-align:${textAlign}`);
      const style = styles.length > 0 ? ` style="${styles.join(';')}"` : '';
      return `<div class="et_pb_module et_pb_text"><div class="et_pb_text_inner"${style}>${html}</div></div>`;
    } catch { return ''; }
  });

  // Image modules
  content = content.replace(/<!-- wp:divi\/image\s+([\s\S]+?)\s*-->[\s\S]*?<!-- \/wp:divi\/image -->/g, (_, jsonStr) => {
    try {
      const attrs = JSON.parse(jsonStr);
      const imgData = attrs?.image?.innerContent?.desktop?.value;
      const src = imgData?.url || imgData?.src || '';
      const alt = imgData?.alt || '';
      const br = attrs?.module?.decoration?.border?.radius?.topLeft?.desktop?.value;
      const imgStyle = `width:100%;height:auto;object-fit:cover${br ? ';border-radius:' + br : ''}`;
      return `<div class="et_pb_module et_pb_image"><div class="et_pb_image_wrap"><img src="${src}" alt="${alt}" style="${imgStyle}"></div></div>`;
    } catch { return ''; }
  });

  // Button modules
  content = content.replace(/<!-- wp:divi\/button\s+([\s\S]+?)\s*-->[\s\S]*?<!-- \/wp:divi\/button -->/g, (_, jsonStr) => {
    try {
      const attrs = JSON.parse(jsonStr);
      const btn = attrs?.button?.innerContent?.desktop?.value;
      const text = btn?.text || 'Button';
      const url = btn?.linkUrl || '#';
      const target = btn?.linkTarget || '_self';
      const bg = attrs?.button?.decoration?.background?.color?.desktop?.value;
      const font = attrs?.button?.decoration?.font?.font?.desktop?.value;
      const spacing = attrs?.button?.decoration?.spacing?.padding;
      const br = attrs?.button?.decoration?.border?.radius?.topLeft?.desktop?.value || '8px';
      const styles: string[] = [];
      if (bg) styles.push(`background-color:${bg}`);
      styles.push(`color:${font?.color || '#fff'}`);
      styles.push(`font-size:${font?.size || '16px'}`);
      styles.push(`font-weight:${font?.weight || '600'}`);
      styles.push(`border-radius:${br}`);
      styles.push('display:inline-block;text-decoration:none');
      if (spacing) {
        styles.push(`padding:${spacing.top?.desktop?.value || '14px'} ${spacing.right?.desktop?.value || '32px'} ${spacing.bottom?.desktop?.value || '14px'} ${spacing.left?.desktop?.value || '32px'}`);
      }
      const align = attrs?.module?.advanced?.alignment?.desktop?.value;
      const wrap = align ? ` style="text-align:${align}"` : '';
      return `<div class="et_pb_module et_pb_button_module"${wrap}><a class="et_pb_button" href="${url}" target="${target}" style="${styles.join(';')}">${text}</a></div>`;
    } catch { return ''; }
  });

  // Blurb modules (cards)
  content = content.replace(/<!-- wp:divi\/blurb\s+([\s\S]+?)\s*-->[\s\S]*?<!-- \/wp:divi\/blurb -->/g, (_, jsonStr) => {
    try {
      const attrs = JSON.parse(jsonStr);
      const titleData = attrs?.title?.innerContent?.desktop?.value;
      const title = titleData?.text || '';
      const bodyHtml = attrs?.content?.innerContent?.desktop?.value || '';
      const tf = attrs?.title?.decoration?.font?.font?.desktop?.value;
      const bf = attrs?.content?.decoration?.bodyFont?.body?.font?.desktop?.value;
      const img = attrs?.imageIcon?.innerContent?.desktop?.value;
      const mod = attrs?.module?.decoration;
      const ts: string[] = [];
      if (tf?.color) ts.push(`color:${tf.color}`);
      if (tf?.size) ts.push(`font-size:${tf.size}`);
      if (tf?.weight) ts.push(`font-weight:${tf.weight}`);
      const bs: string[] = [];
      if (bf?.color) bs.push(`color:${bf.color}`);
      if (bf?.size) bs.push(`font-size:${bf.size}`);
      if (bf?.lineHeight) bs.push(`line-height:${bf.lineHeight}`);
      const cs: string[] = [];
      if (mod?.background?.color?.desktop?.value) cs.push(`background:${mod.background.color.desktop.value}`);
      const cbr = mod?.border?.radius?.topLeft?.desktop?.value;
      if (cbr) cs.push(`border-radius:${cbr}`);
      const sh = mod?.boxShadow;
      if (sh) cs.push(`box-shadow:${sh.horizontal?.desktop?.value||'0px'} ${sh.vertical?.desktop?.value||'4px'} ${sh.blur?.desktop?.value||'20px'} ${sh.spread?.desktop?.value||'0px'} ${sh.color?.desktop?.value||'rgba(0,0,0,0.08)'}`);
      const pad = mod?.spacing?.padding;
      if (pad) cs.push(`padding:${pad.top?.desktop?.value||'30px'} ${pad.right?.desktop?.value||'30px'} ${pad.bottom?.desktop?.value||'30px'} ${pad.left?.desktop?.value||'30px'}`);
      cs.push('overflow:hidden');
      let imgHtml = '';
      if (img?.src) imgHtml = `<img src="${img.src}" alt="${title}" style="width:100%;height:auto;object-fit:cover;border-radius:8px 8px 0 0">`;
      const hl = tf?.headingLevel || 'h4';
      return `<div class="et_pb_module et_pb_blurb"><div class="et_pb_blurb_content" style="${cs.join(';')}">${imgHtml}<${hl} style="${ts.join(';')}">${title}</${hl}><div style="${bs.join(';')}">${bodyHtml}</div></div></div>`;
    } catch { return ''; }
  });

  // Code modules (raw HTML pass-through)
  content = content.replace(/<!-- wp:divi\/code\s+([\s\S]+?)\s*-->[\s\S]*?<!-- \/wp:divi\/code -->/g, (_, jsonStr) => {
    try {
      const attrs = JSON.parse(jsonStr);
      return attrs?.content?.innerContent?.desktop?.value || '';
    } catch { return ''; }
  });

  // Divider modules
  content = content.replace(/<!-- wp:divi\/divider\s+[\s\S]+?\s*-->[\s\S]*?<!-- \/wp:divi\/divider -->/g,
    '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0">');

  // --- Structural blocks (section > row > column) ---
  let sectionIdx = 0;
  content = content.replace(/<!-- wp:divi\/section\s+[\s\S]+?\s*-->/g, () =>
    `<div class="et_pb_section et_pb_section_${sectionIdx++}">`);
  content = content.replace(/<!-- \/wp:divi\/section\s*-->/g, '</div>');

  content = content.replace(/<!-- wp:divi\/row\s+[\s\S]+?\s*-->/g, '<div class="et_pb_row">');
  content = content.replace(/<!-- \/wp:divi\/row\s*-->/g, '</div>');

  content = content.replace(/<!-- wp:divi\/column\s+[\s\S]+?\s*-->/g, '<div class="et_pb_column">');
  content = content.replace(/<!-- \/wp:divi\/column\s*-->/g, '</div>');

  // Catch-all: strip any remaining Divi 5 block comments
  content = content.replace(/<!-- \/?wp:divi\/\w+[^>]*-->/g, '');

  return content;
}

/** Sanitize markup and prepare for deploy. Flattens Divi 5 blocks to raw HTML. */
function prepareMarkupForDeploy(markup: string, builder: string = 'gutenberg'): string {
  const sanitized = sanitizeMarkup(markup, builder === 'divi5');
  if (builder === 'divi5') {
    // Flatten Divi 5 native blocks into raw HTML divs with matching CSS classes.
    // This prevents Divi 4 classic builder from wrapping block comments in its
    // own et_pb modules (which renders the page blank).
    const flattened = flattenDivi5ToHtml(sanitized);
    return DIVI5_HEADER_SCRIPT + '\n' + flattened;
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
  // Divi 5 image module uses "url" field name (not "src") for the image URL
  const attrs: Record<string, any> = {
    builderVersion: D5V, modulePreset: "default", themeBuilderArea: D5_AREA,
    image: { innerContent: d5Val({ url: src, src, alt: alt || "", title: "" }) },
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
        : 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.72) 100%)'; // Dark for text readability
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

  // Grid gap CSS for multi-column sections
  // Use :not(:first-child) to target the cards row (not the heading row) in multi-row sections
  sections.forEach((section, i) => {
    if (section.columns && section.columns > 1) {
      // Apply grid to all rows that hold cards (skip heading-only rows by checking column count)
      cssFallback.push(`.et_pb_section_${i} .et_pb_row { display: grid !important; grid-template-columns: repeat(${section.columns}, 1fr) !important; gap: 30px !important; align-items: start !important; }`);
      cssFallback.push(`.et_pb_section_${i} .et_pb_column { min-width: 0 !important; }`);
      cssFallback.push(`@media (max-width: 768px) { .et_pb_section_${i} .et_pb_row { grid-template-columns: 1fr !important; gap: 20px !important; } }`);
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

  // Responsive base - typography and overflow protection for mobile
  cssFallback.push(`@media (max-width: 768px) { h1 { font-size: 32px !important; } h2 { font-size: 26px !important; } h3 { font-size: 20px !important; } .et_pb_section { padding-left: 20px !important; padding-right: 20px !important; overflow-x: hidden !important; } body, html { overflow-x: hidden !important; } }`);
  // Prevent fixed-width elements from causing horizontal scroll
  cssFallback.push(`@media (max-width: 768px) { .et_pb_row, .et_pb_column, .et_pb_module, img, video, iframe { max-width: 100% !important; box-sizing: border-box !important; } }`);
  // Hero sections: ensure text is visible above image backgrounds on mobile
  cssFallback.push(`@media (max-width: 768px) { [class*="et_pb_section"] .et_pb_text_inner, [class*="et_pb_section"] h1, [class*="et_pb_section"] h2 { text-shadow: 0 1px 4px rgba(0,0,0,0.6) !important; } }`);

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

// Mobile audit - uses Puppeteer to find concrete responsive issues at 375px
interface MobileAuditResult {
  hasHorizontalScroll: boolean;
  overflowPx: number;
  fixedWidthElements: Array<{ selector: string; widthRule: string; computedWidth: number }>;
  noWrapContainers: Array<{ selector: string; display: string; computedWidth: number; gridCols?: string }>;
  smallTapTargets: number;
  totalHeight: number;
}

async function runMobileAudit(pageUrl: string): Promise<MobileAuditResult> {
  const defaultResult: MobileAuditResult = {
    hasHorizontalScroll: false, overflowPx: 0, fixedWidthElements: [], noWrapContainers: [], smallTapTargets: 0, totalHeight: 0,
  };
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    await page.setExtraHTTPHeaders({ 'Cache-Control': 'no-cache, no-store' });
    await page.setViewport({ width: 375, height: 812 });
    await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 3000));

    const result = await page.evaluate(() => {
      const vw = window.innerWidth; // 375
      const bodyW = document.body.scrollWidth;

      // Find elements with inline fixed widths larger than viewport
      const fixedWidthElements: Array<{ selector: string; widthRule: string; computedWidth: number }> = [];
      document.querySelectorAll('[style]').forEach(el => {
        const style = el.getAttribute('style') || '';
        const widthMatch = style.match(/(?:min-)?width:\s*(\d+)px/);
        if (widthMatch && parseInt(widthMatch[1]) > vw) {
          // Build a usable CSS selector
          const classes = el.className && typeof el.className === 'string'
            ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
            : '';
          const selector = classes || el.tagName.toLowerCase();
          fixedWidthElements.push({
            selector,
            widthRule: widthMatch[0],
            computedWidth: Math.round(el.getBoundingClientRect().width),
          });
        }
      });

      // Find flex/grid containers that overflow and don't wrap
      const noWrapContainers: Array<{ selector: string; display: string; computedWidth: number; gridCols?: string }> = [];
      document.querySelectorAll('*').forEach(el => {
        const cs = getComputedStyle(el);
        if ((cs.display === 'flex' || cs.display === 'grid' || cs.display === 'inline-flex') && el.scrollWidth > vw + 10) {
          const classes = el.className && typeof el.className === 'string'
            ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
            : '';
          const selector = classes || el.tagName.toLowerCase();
          noWrapContainers.push({
            selector,
            display: cs.display,
            computedWidth: Math.round(el.scrollWidth),
            gridCols: cs.display === 'grid' ? cs.gridTemplateColumns?.substring(0, 100) : undefined,
          });
        }
      });

      // Count small tap targets
      let smallTapTargets = 0;
      document.querySelectorAll('a, button, [role="button"], input[type="submit"]').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)) {
          smallTapTargets++;
        }
      });

      return {
        hasHorizontalScroll: bodyW > vw,
        overflowPx: Math.max(0, bodyW - vw),
        fixedWidthElements: fixedWidthElements.slice(0, 10),
        noWrapContainers: noWrapContainers.slice(0, 10),
        smallTapTargets,
        totalHeight: document.body.scrollHeight,
      };
    });

    await page.close();
    return result as MobileAuditResult;
  } catch (err) {
    console.error('[pageforge] Mobile audit failed:', err);
    return defaultResult;
  } finally {
    if (browser) await browser.close();
  }
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

/**
 * Capture a single breakpoint screenshot (lighter than captureScreenshots which does all 3).
 * Used by desktop-only VQA and mobile VQA phases.
 */
async function captureScreenshotAtBreakpoint(pageUrl: string, width: number): Promise<string | null> {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    await page.setExtraHTTPHeaders({ 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' });
    await page.setViewport({ width, height: 900 });
    await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 45000 });
    try { await page.evaluate(() => (document as any).fonts?.ready); } catch { /* fonts API not available */ }
    await new Promise(r => setTimeout(r, 3000));
    const buffer = await page.screenshot({ fullPage: true, type: 'png' });
    console.log(`[pageforge] Screenshot at ${width}px: ${Math.round(Buffer.from(buffer).length / 1024)}KB`);
    const base64 = await resizeIfNeeded(Buffer.from(buffer).toString('base64'));
    await page.close();
    return base64;
  } catch (err) {
    console.error(`[pageforge] Screenshot at ${width}px failed:`, err);
    return null;
  } finally {
    if (browser) await browser.close();
  }
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

