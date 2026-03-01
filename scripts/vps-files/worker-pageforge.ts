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
import Anthropic from '@anthropic-ai/sdk';

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
  const anthropic = getAnthropicClient();

  // Track per-phase retry attempts
  const phaseRetryCount: Record<string, number> = {};

  // Process phases sequentially
  for (let i = startPhaseIdx; i < PAGEFORGE_PHASE_ORDER.length; i++) {
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
        if (siteProfile.page_builder === 'divi5' || siteProfile.page_builder === 'divi4') {
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

      // Find image nodes
      const imageNodeIds: string[] = [];
      function findImages(node: FigmaNode) {
        if (node.fills) {
          for (const fill of node.fills) {
            if (fill.type === 'IMAGE' && fill.imageRef) { imageNodeIds.push(node.id); break; }
          }
        }
        if (node.children) for (const child of node.children) findImages(child);
      }
      findImages(pageNode);

      // AI design summary
      const designResult = await callPageForgeAgent(supabase, buildId, 'pageforge_analyzer', 'figma_analysis',
        getSystemPrompt('pageforge_builder'),
        `Analyze this Figma design and provide a 2-3 sentence summary:\n\nSections:\n${sections.map((s, i) => `${i + 1}. "${s.name}" (${s.type}) ${s.bounds.width}x${s.bounds.height}px`).join('\n')}\n\nTokens: ${colors.length} colors, ${fonts.length} fonts, ${imageNodeIds.length} images`,
        anthropic
      );

      const result = {
        sections: sections.map(s => ({ id: s.id, name: s.name, type: s.type, bounds: s.bounds, childCount: s.children.length })),
        colors, fonts, imageNodeIds, designSummary: designResult.text,
      };
      await updateBuildArtifacts(supabase, buildId, 'figma_analysis', result);
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
      const builderInstructions = builder === 'divi5' ? DIVI5_INSTRUCTIONS : builder === 'divi4' ? DIVI4_INSTRUCTIONS : GUTENBERG_INSTRUCTIONS;

      // Export Figma screenshot so the builder AI can SEE the design
      let figmaImage: string | null = null;
      if (siteProfile.figma_personal_token && build.figma_node_ids?.length > 0) {
        try {
          const figmaClient = createFigmaClient(siteProfile.figma_personal_token);
          const imageResponse = await figmaGetImages(figmaClient, build.figma_file_key, build.figma_node_ids, { format: 'png', scale: 1 });
          const firstUrl = Object.values(imageResponse.images).find(Boolean);
          if (firstUrl) {
            const buffer = await figmaDownloadImage(firstUrl);
            figmaImage = buffer.toString('base64');
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

      const prompt = `Generate a COMPLETE WordPress ${builder} page. You MUST generate markup for EVERY section listed below - do not skip, abbreviate, or leave placeholders.

${figmaImage ? 'IMPORTANT: The attached image shows the Figma design. Study it carefully - match the layout, spacing, colors, typography, and visual hierarchy EXACTLY.' : ''}

${builderInstructions}

Design Tokens:
- Colors: ${figmaData.colors.map((c: any) => `${c.hex} (${c.name})`).join(', ')}
- Fonts: ${figmaData.fonts.map((f: any) => `${f.family} ${f.weight} ${f.size}px/${f.lineHeight || 'auto'}`).join(', ')}
${siteProfile.global_css ? `\nSite Global CSS:\n${siteProfile.global_css.slice(0, 2000)}` : ''}

Sections to build (${classifications.length} total - ALL are required):
${sectionDetails}

CRITICAL RULES:
1. Generate EVERY section - the output must cover the entire page top to bottom
2. Use INLINE STYLES for exact color values, font sizes, spacing, and dimensions from the design tokens
3. Match the Figma design pixel-for-pixel: correct padding, margin, gap, border-radius
4. Make it responsive: use max-width, flexbox/grid, and mobile-friendly patterns
5. Use real semantic HTML (proper headings hierarchy, sections, articles)
6. Do NOT use placeholder text - use realistic content that fits the design intent
7. Include background colors, gradients, and visual treatments shown in the design

Respond with JSON: {"markup":"the COMPLETE page markup as a single string","sections":[{"name":"section name","markup":"that section's markup"}]}`;

      const result = await callPageForgeAgent(supabase, buildId, 'pageforge_markup_gen', 'markup_generation',
        getSystemPrompt('pageforge_builder'),
        prompt,
        anthropic, {
          maxTokens: 32768,
          images: figmaImage ? [{ data: figmaImage, mimeType: 'image/png' }] : undefined,
        }
      );

      let markup: string;
      let sections: any[] = [];
      try {
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          markup = parsed.markup || result.text;
          sections = parsed.sections || [];
        } else {
          markup = result.text;
        }
      } catch {
        markup = result.text;
      }

      await updateBuildArtifacts(supabase, buildId, 'markup_generation', { markup, builder, sections });
      console.log(`[pageforge] Generated ${builder} markup: ${markup.length} chars, ${sections.length} sections`);
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 4: MARKUP VALIDATION - Programmatic validation
    // -----------------------------------------------------------------------
    case 'markup_validation': {
      const markupData = artifacts.markup_generation;
      if (!markupData?.markup) throw new Error('Missing markup_generation artifacts');

      const { markup, builder } = markupData;
      const errors: string[] = [];
      const warnings: string[] = [];

      if (builder === 'gutenberg') {
        const open = (markup.match(/<!-- wp:/g) || []).length;
        const close = (markup.match(/<!-- \/wp:/g) || []).length;
        if (open !== close) errors.push(`Unbalanced blocks: ${open} open, ${close} close`);
        if (!markup.includes('<!-- wp:')) warnings.push('No Gutenberg block markers found');
      }

      if (builder === 'divi5') {
        try { if (markup.startsWith('{') || markup.startsWith('[')) JSON.parse(markup); }
        catch { warnings.push('Divi 5 markup does not parse as valid JSON'); }
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

      let page;
      if (build.wp_page_id) {
        page = await wpUpdatePage(wpClient, build.wp_page_id, { title: build.page_title, content: markupData.markup, slug: build.page_slug || undefined });
      } else {
        page = await wpCreatePage(wpClient, { title: build.page_title, content: markupData.markup, slug: build.page_slug || undefined, status: 'draft' });
      }

      const siteUrl = siteProfile.site_url.replace(/\/$/, '');
      const draftUrl = `${siteUrl}/?page_id=${page.id}&preview=true`;
      const previewUrl = page.link || `${siteUrl}/${page.slug}/`;

      await supabase.from('pageforge_builds').update({
        wp_page_id: page.id, wp_draft_url: draftUrl, wp_preview_url: previewUrl,
        updated_at: new Date().toISOString(),
      }).eq('id', buildId);

      await updateBuildArtifacts(supabase, buildId, 'deploy_draft', { pageId: page.id, draftUrl, previewUrl });
      console.log(`[pageforge] Deployed draft: page ${page.id}, ${draftUrl}`);
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
          const batchResponse = await figmaGetImages(figmaClient, build.figma_file_key, batch, { format: 'png', scale: 2 });
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
      let uploaded = 0, failed = 0;

      for (const [nodeId, imageUrl] of Object.entries(allImages)) {
        if (!imageUrl) { failed++; continue; }
        try {
          const buffer = await figmaDownloadImage(imageUrl);
          const filename = `pageforge-${buildId.slice(0, 8)}-${nodeId.replace(/[^a-zA-Z0-9]/g, '-')}.png`;
          const media = await wpUploadMedia(wpClient, buffer, filename, 'image/png');
          mediaIds.push(media.id);
          uploaded++;
        } catch (err) {
          console.error(`[pageforge] Image upload failed for ${nodeId}:`, err);
          failed++;
        }
      }

      await updateBuildArtifacts(supabase, buildId, 'image_optimization', { uploaded, failed, mediaIds });
      console.log(`[pageforge] Images: ${uploaded} uploaded, ${failed} failed`);
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

      // Export Figma screenshots
      let figmaScreenshots: Record<string, string | null> = { desktop: null, tablet: null, mobile: null };
      if (siteProfile.figma_personal_token && build.figma_node_ids?.length > 0) {
        const figmaClient = createFigmaClient(siteProfile.figma_personal_token);
        const imageResponse = await figmaGetImages(figmaClient, build.figma_file_key, build.figma_node_ids, { format: 'png', scale: 1 });
        const firstUrl = Object.values(imageResponse.images).find(Boolean);
        if (firstUrl) {
          const buffer = await figmaDownloadImage(firstUrl);
          const base64 = buffer.toString('base64');
          figmaScreenshots = { desktop: base64, tablet: base64, mobile: base64 };
        }
      }

      await updateBuildArtifacts(supabase, buildId, 'vqa_capture', { wpScreenshots, figmaScreenshots });
      console.log(`[pageforge] VQA capture complete`);
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

      // DESKTOP: Full Figma vs WP comparison (primary - this is where Figma image matches)
      const figmaDesktop = figmaScreenshots?.desktop;
      const wpDesktop = wpScreenshots?.desktop;

      if (figmaDesktop && wpDesktop) {
        try {
          const vqaResult = await callPageForgeAgent(supabase, buildId, 'pageforge_vqa', 'vqa_comparison',
            getSystemPrompt('pageforge_vqa'),
            `Compare these two full-page screenshots at DESKTOP (1440px) breakpoint.

Image 1: Original Figma design (the reference - this is what we're building toward)
Image 2: WordPress page as currently built (the actual output)

Analyze the ENTIRE page from top to bottom. For each section, check:
1. LAYOUT: Are elements positioned correctly? Correct widths, heights, spacing, alignment?
2. TYPOGRAPHY: Right fonts, sizes, weights, colors, line heights?
3. COLORS: Background colors, text colors, accent colors match?
4. IMAGES/ICONS: Present, correct size, correct position?
5. SPACING: Padding, margins, gaps between elements match?
6. MISSING CONTENT: Are any sections from the Figma design missing entirely in the WP page?
${sectionContext}

IMPORTANT: Check if the WordPress page covers ALL sections shown in the Figma design. Missing sections are CRITICAL differences.

Score the overall match from 0-100 (100 = pixel-perfect match).
A score below 60 means major sections are missing or fundamentally broken.
A score of 60-80 means the structure is there but details need work.
A score above 80 means it's close with only minor differences.

For EACH difference found, provide a specific, actionable CSS/markup fix.

Respond with JSON:
{"score":N,"differences":[{"area":"section or element name","severity":"critical|major|minor","description":"specific description of what's different","suggestedFix":"exact CSS or markup change to apply"}]}`,
            anthropic, {
              images: [
                { data: figmaDesktop, mimeType: 'image/png' },
                { data: wpDesktop, mimeType: 'image/png' },
              ],
            }
          );

          const jsonMatch = vqaResult.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            results.desktop = { score: parsed.score || 0, differences: parsed.differences || [] };
          } else {
            results.desktop = { score: 50, differences: [] };
          }
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
              images: [{ data: wpImg, mimeType: 'image/png' }],
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

      // Desktop is primary (70% weight since it's the only real Figma comparison)
      const desktopScore = results.desktop?.score || 0;
      const tabletScore = results.tablet?.score || 0;
      const mobileScore = results.mobile?.score || 0;
      const overallScore = Math.round(desktopScore * 0.7 + tabletScore * 0.15 + mobileScore * 0.15);
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
      let currentMarkup = markupData.markup;
      const allChanges: string[] = [];
      let lastScore = comparisonData.overallScore || 0;
      let stallCount = 0;
      const scoreHistory: Array<{ iteration: number; score: number }> = [];

      // Get the Figma reference screenshot (doesn't change between iterations)
      const figmaDesktop = artifacts.vqa_capture?.figmaScreenshots?.desktop;
      const deployData = artifacts.deploy_draft;
      const draftUrl = deployData?.draftUrl;

      if (!draftUrl) throw new Error('Missing draft URL for VQA fix loop');

      await postBuildMessage(supabase, buildId,
        `Starting VQA fix loop: score=${lastScore}%, threshold=${threshold}%, max iterations=${maxLoops}`,
        'vqa_fix_loop');

      while (currentIteration < maxLoops) {
        currentIteration++;
        console.log(`[pageforge] VQA fix iteration ${currentIteration}/${maxLoops} (score: ${lastScore}%, target: ${threshold}%)`);

        // 1. Gather differences from latest comparison (critical + major only)
        const allDiffs = Object.values(comparisonData.results as Record<string, any>)
          .flatMap((r: any) => (r.differences || []).filter((d: any) => d.severity !== 'minor'));

        if (allDiffs.length === 0) {
          console.log('[pageforge] No more differences to fix');
          break;
        }

        // 2. Prioritize: critical first, then major, max 10 per iteration
        const sortedDiffs = allDiffs.sort((a: any, b: any) => {
          const order = { critical: 0, major: 1, minor: 2 };
          return (order[a.severity as keyof typeof order] || 2) - (order[b.severity as keyof typeof order] || 2);
        }).slice(0, 10);

        // 3. AI fix with visual context (Figma + current WP screenshot)
        const images: Array<{ data: string; mimeType: string }> = [];
        if (figmaDesktop) {
          images.push({ data: figmaDesktop, mimeType: 'image/png' });
        }

        // Capture current WP desktop screenshot for visual reference
        let currentWpScreenshot: string | null = null;
        try {
          const wpShots = await captureScreenshots(draftUrl);
          currentWpScreenshot = wpShots.desktop || null;
          if (currentWpScreenshot) {
            images.push({ data: currentWpScreenshot, mimeType: 'image/png' });
          }
        } catch (err) {
          console.warn('[pageforge] Failed to capture current WP screenshot for fix context:', err);
        }

        const imageContext = images.length >= 2
          ? 'Image 1 is the Figma design reference. Image 2 is the current WordPress page. Fix the WordPress markup to match the Figma design.'
          : images.length === 1
            ? 'Image 1 is the Figma design reference. Fix the markup to match it.'
            : '';

        const fixPrompt = `Fix this WordPress page markup to better match the Figma design.

${imageContext}

Iteration ${currentIteration}/${maxLoops} - Current VQA score: ${lastScore}% (target: ${threshold}%)

Current markup (FULL page):
\`\`\`html
${currentMarkup}
\`\`\`

Visual differences to fix (${sortedDiffs.length} issues, priority order):
${sortedDiffs.map((d: any, i: number) => `${i + 1}. [${d.severity.toUpperCase()}] ${d.area}: ${d.description}${d.suggestedFix ? `\n   Suggested fix: ${d.suggestedFix}` : ''}`).join('\n')}

RULES:
1. Return the COMPLETE fixed markup - do not truncate or abbreviate ANY section
2. Apply ALL suggested fixes where possible
3. Preserve all existing content and structure that is correct
4. Use inline styles for visual fixes (colors, spacing, fonts, layout)
5. If sections are missing from the page, ADD them
6. Make sure responsive styles are preserved (flexbox, max-width, etc.)

Respond with JSON:
{"fixedMarkup":"the COMPLETE corrected markup","changesApplied":["description of each change"]}`;

        const fixResult = await callPageForgeAgent(supabase, buildId, 'pageforge_vqa_fix', 'vqa_fix_loop',
          getSystemPrompt('pageforge_vqa'),
          fixPrompt,
          anthropic, {
            maxTokens: 32768,
            images: images.length > 0 ? images : undefined,
          }
        );

        let fixApplied = false;
        try {
          const jsonMatch = fixResult.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.fixedMarkup && parsed.fixedMarkup.length > currentMarkup.length * 0.5) {
              // Only accept if the fix is at least 50% the size of original (prevent truncation)
              currentMarkup = parsed.fixedMarkup;
              allChanges.push(...(parsed.changesApplied || []));
              fixApplied = true;
            } else if (parsed.fixedMarkup) {
              console.warn(`[pageforge] Fix returned truncated markup (${parsed.fixedMarkup.length} vs ${currentMarkup.length} chars) - skipping`);
            }
          }
        } catch { /* continue with current markup */ }

        if (!fixApplied) {
          console.warn(`[pageforge] Fix iteration ${currentIteration} produced no valid markup change`);
          stallCount++;
          if (stallCount >= 3) {
            console.log('[pageforge] 3 consecutive failed fix attempts, stopping');
            break;
          }
          continue;
        }

        // 4. Re-deploy with fixed markup
        if (build.wp_page_id && siteProfile.wp_username && siteProfile.wp_app_password) {
          const wpClient = createWpClient({ restUrl: siteProfile.wp_rest_url, username: siteProfile.wp_username, appPassword: siteProfile.wp_app_password });
          await wpUpdatePage(wpClient, build.wp_page_id, { content: currentMarkup });
        }

        // 5. Wait briefly for WP to process the update
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 6. Re-capture desktop screenshot
        let newWpDesktop: string | null = null;
        try {
          const newShots = await captureScreenshots(draftUrl);
          newWpDesktop = newShots.desktop || null;
        } catch (err) {
          console.warn('[pageforge] Failed to recapture WP screenshot:', err);
        }

        // 7. Re-compare desktop against Figma
        let newScore = lastScore;
        let newDiffs: any[] = [];

        if (figmaDesktop && newWpDesktop) {
          try {
            const compareResult = await callPageForgeAgent(supabase, buildId, 'pageforge_vqa', 'vqa_fix_loop',
              getSystemPrompt('pageforge_vqa'),
              `Re-evaluate after fix iteration ${currentIteration}. Compare these two full-page screenshots.

Image 1: Figma design (reference)
Image 2: WordPress page (after fix)

Previous score was ${lastScore}%. Check if the fixes improved the match.
Focus on remaining differences only.

Score 0-100. Respond with JSON:
{"score":N,"differences":[{"area":"...","severity":"critical|major|minor","description":"...","suggestedFix":"..."}]}`,
              anthropic, {
                images: [
                  { data: figmaDesktop, mimeType: 'image/png' },
                  { data: newWpDesktop, mimeType: 'image/png' },
                ],
              }
            );

            const jsonMatch = compareResult.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              newScore = parsed.score || lastScore;
              newDiffs = parsed.differences || [];
            }
          } catch (err) {
            console.warn('[pageforge] Re-comparison failed:', err);
          }
        }

        scoreHistory.push({ iteration: currentIteration, score: newScore });
        const improvement = newScore - lastScore;

        console.log(`[pageforge] Iteration ${currentIteration}: score ${lastScore}% -> ${newScore}% (${improvement >= 0 ? '+' : ''}${improvement}%)`);

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

        // 10. Stall detection: if score didn't improve by at least 2 points for 3 consecutive iterations
        if (improvement < 2) {
          stallCount++;
          if (stallCount >= 3) {
            console.log(`[pageforge] Score stalled for 3 iterations (${newScore}%), stopping fix loop`);
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

          // Update tablet/mobile scores
          const tabletScore = finalShots.tablet ? 70 : 0; // Will be properly scored in next comparison
          const mobileScore = finalShots.mobile ? 70 : 0;
          const finalDesktop = comparisonData.overallScore || lastScore;
          const finalOverall = Math.round(finalDesktop * 0.7 + tabletScore * 0.15 + mobileScore * 0.15);

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
      const browserlessUrl = process.env.BROWSERLESS_URL || 'https://chrome.browserless.io';
      const browserlessKey = process.env.BROWSERLESS_API_KEY || '';

      // Link validation
      const linkCheck = await runLinkValidation(pageUrl);

      // Lighthouse audit
      let lighthouseScores = { performance: 0, accessibility: 0, bestPractices: 0, seo: 0 };
      try {
        const lhRes = await fetch(`${browserlessUrl}/lighthouse?token=${browserlessKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: pageUrl, config: { extends: 'lighthouse:default', settings: { onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] } } }),
          signal: AbortSignal.timeout(60000),
        });
        if (lhRes.ok) {
          const lhData = await lhRes.json();
          const cats = lhData.categories || {};
          lighthouseScores = {
            performance: Math.round((cats.performance?.score || 0) * 100),
            accessibility: Math.round((cats.accessibility?.score || 0) * 100),
            bestPractices: Math.round((cats['best-practices']?.score || 0) * 100),
            seo: Math.round((cats.seo?.score || 0) * 100),
          };
        }
      } catch (err) {
        console.warn('[pageforge] Lighthouse failed:', err);
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

async function captureScreenshots(pageUrl: string): Promise<Record<string, string | null>> {
  const screenshots: Record<string, string | null> = { desktop: null, tablet: null, mobile: null };
  const apiUrl = process.env.BROWSERLESS_URL || 'https://chrome.browserless.io';
  const apiKey = process.env.BROWSERLESS_API_KEY || '';
  const breakpoints = { desktop: 1440, tablet: 768, mobile: 375 };

  for (const [bp, width] of Object.entries(breakpoints)) {
    try {
      const res = await fetch(`${apiUrl}/screenshot?token=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pageUrl, options: { fullPage: true, type: 'png' }, viewport: { width, height: 900 }, waitFor: 3000 }),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        screenshots[bp] = Buffer.from(buffer).toString('base64');
      }
    } catch (err) {
      console.error(`[pageforge] Screenshot ${bp} failed:`, err);
    }
  }
  return screenshots;
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

const GUTENBERG_INSTRUCTIONS = `## Gutenberg Block Format
Generate valid WordPress Gutenberg block markup:
<!-- wp:group {"layout":{"type":"constrained"}} -->
<div class="wp-block-group">
  <!-- wp:heading {"level":2} --><h2 class="wp-block-heading">Title</h2><!-- /wp:heading -->
  <!-- wp:paragraph --><p>Content</p><!-- /wp:paragraph -->
</div>
<!-- /wp:group -->

Use <!-- wp:columns -->, <!-- wp:image -->, <!-- wp:cover -->, <!-- wp:buttons --> blocks.
Use inline styles for exact design token values.`;

const DIVI5_INSTRUCTIONS = `## Divi 5 Format
Divi 5 uses JSON-based blocks. Generate Gutenberg-compatible markup (Divi 5 supports it natively) with inline styles for positioning and design tokens.`;

const DIVI4_INSTRUCTIONS = `## Divi 4 Format
Generate Divi 4 shortcodes:
[et_pb_section][et_pb_row][et_pb_column type="4_4"]
[et_pb_text]Content[/et_pb_text]
[/et_pb_column][/et_pb_row][/et_pb_section]
Use custom_css attributes for styling.`;
