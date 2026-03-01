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
      console.error(`[pageforge] Phase ${phase} failed:`, errorMsg);

      await failPhaseRecord(supabase, phaseRecordId, errorMsg, Date.now() - phaseStart);
      await appendBuildError(supabase, build_id, phase, errorMsg);

      await postBuildMessage(supabase, build_id,
        `Phase "${phase}" failed: ${errorMsg}`,
        phase, 'system');

      await supabase.from('pageforge_builds').update({
        status: 'failed', updated_at: new Date().toISOString(),
      }).eq('id', build_id);

      await updateJobProgress(vps_job_id, {
        status: 'failed', completed_at: new Date().toISOString(),
        progress_message: `Failed at ${phase}: ${errorMsg}`,
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

      const sections = figmaExtractSections(pageNode);
      const colors = figmaExtractColors(pageNode);
      const fonts = figmaExtractTypography(pageNode);

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

      const result = await callPageForgeAgent(supabase, buildId, 'pageforge_markup_gen', 'markup_generation',
        getSystemPrompt('pageforge_builder'),
        `Generate WordPress ${builder} markup.\n\n${builderInstructions}\n\nDesign Tokens:\n- Colors: ${figmaData.colors.slice(0, 10).map((c: any) => `${c.hex} (${c.name})`).join(', ')}\n- Fonts: ${figmaData.fonts.map((f: any) => `${f.family} ${f.weight} ${f.size}px`).join(', ')}\n${siteProfile.global_css ? `\nGlobal CSS:\n${siteProfile.global_css.slice(0, 1000)}` : ''}\n\nSections:\n${classifications.map((c: any, i: number) => `${i + 1}. "${c.sectionName}" (${c.type}, Tier ${c.tier})`).join('\n')}\n\nRespond with JSON: {"markup":"full page markup","sections":[{"name":"...","markup":"..."}]}`,
        anthropic, { maxTokens: 16384 }
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
      const threshold = siteProfile.vqa_pass_threshold || 95;
      const breakpoints = ['desktop', 'tablet', 'mobile'] as const;
      const results: Record<string, { score: number; differences: any[] }> = {};

      for (const bp of breakpoints) {
        const figmaImg = figmaScreenshots?.[bp];
        const wpImg = wpScreenshots?.[bp];

        if (!figmaImg || !wpImg) {
          results[bp] = { score: 0, differences: [{ area: 'full', severity: 'critical', description: 'Screenshot not available' }] };
          continue;
        }

        try {
          const vqaResult = await callPageForgeAgent(supabase, buildId, 'pageforge_vqa', 'vqa_comparison',
            getSystemPrompt('pageforge_vqa'),
            `Compare these two images at ${bp} breakpoint.\nImage 1: Figma design (reference)\nImage 2: WordPress page (actual)\n\nScore 0-100. Respond with JSON: {"score":N,"differences":[{"area":"...","severity":"critical|major|minor","description":"...","suggestedFix":"..."}]}`,
            anthropic, {
              images: [
                { data: figmaImg, mimeType: 'image/png' },
                { data: wpImg, mimeType: 'image/png' },
              ],
            }
          );

          const jsonMatch = vqaResult.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            results[bp] = { score: parsed.score || 0, differences: parsed.differences || [] };
          } else {
            results[bp] = { score: 50, differences: [] };
          }
        } catch (err) {
          results[bp] = { score: 0, differences: [{ area: 'comparison', severity: 'critical', description: `Failed: ${err instanceof Error ? err.message : String(err)}` }] };
        }
      }

      const desktopScore = results.desktop?.score || 0;
      const tabletScore = results.tablet?.score || 0;
      const mobileScore = results.mobile?.score || 0;
      const overallScore = Math.round(desktopScore * 0.5 + tabletScore * 0.25 + mobileScore * 0.25);
      const passed = overallScore >= threshold;

      await supabase.from('pageforge_builds').update({
        vqa_score_desktop: desktopScore, vqa_score_tablet: tabletScore,
        vqa_score_mobile: mobileScore, vqa_score_overall: overallScore,
        updated_at: new Date().toISOString(),
      }).eq('id', buildId);

      const fixSuggestions = Object.values(results).flatMap(r => r.differences.filter((d: any) => d.suggestedFix).map((d: any) => d.suggestedFix));

      await updateBuildArtifacts(supabase, buildId, 'vqa_comparison', { results, overallScore, passed, threshold, fixSuggestions });
      console.log(`[pageforge] VQA scores: D=${desktopScore} T=${tabletScore} M=${mobileScore} Overall=${overallScore} (threshold=${threshold}, passed=${passed})`);
      break;
    }

    // -----------------------------------------------------------------------
    // PHASE 9: VQA FIX LOOP - Apply AI-suggested fixes
    // -----------------------------------------------------------------------
    case 'vqa_fix_loop': {
      const comparisonData = artifacts.vqa_comparison;
      const markupData = artifacts.markup_generation;
      if (!comparisonData || !markupData) throw new Error('Missing upstream artifacts');

      if (comparisonData.passed) {
        await updateBuildArtifacts(supabase, buildId, 'vqa_fix_loop', { skipped: true, reason: 'VQA passed threshold' });
        console.log('[pageforge] VQA passed, skipping fix loop');
        break;
      }

      const maxLoops = siteProfile.max_vqa_fix_loops || 3;
      let currentIteration = build.vqa_fix_iteration || 0;
      let currentMarkup = markupData.markup;
      const allChanges: string[] = [];

      while (currentIteration < maxLoops) {
        currentIteration++;
        console.log(`[pageforge] VQA fix iteration ${currentIteration}/${maxLoops}`);

        // Gather differences to fix
        const allDiffs = Object.values(comparisonData.results as Record<string, any>)
          .flatMap((r: any) => (r.differences || []).filter((d: any) => d.severity !== 'minor'));

        if (allDiffs.length === 0) break;

        // AI suggest fixes
        const fixResult = await callPageForgeAgent(supabase, buildId, 'pageforge_vqa_fix', 'vqa_fix_loop',
          getSystemPrompt('pageforge_vqa'),
          `Apply fixes to this markup:\n\n\`\`\`html\n${currentMarkup.slice(0, 8000)}\n\`\`\`\n\nDifferences:\n${allDiffs.map((d: any, i: number) => `${i + 1}. ${d.area}: ${d.description}${d.suggestedFix ? ` (Fix: ${d.suggestedFix})` : ''}`).join('\n')}\n\nRespond with JSON: {"fixedMarkup":"...","changesApplied":["..."]}`,
          anthropic, { maxTokens: 16384 }
        );

        try {
          const jsonMatch = fixResult.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.fixedMarkup) {
              currentMarkup = parsed.fixedMarkup;
              allChanges.push(...(parsed.changesApplied || []));
            }
          }
        } catch { /* continue with current markup */ }

        // Re-deploy with fixed markup
        if (build.wp_page_id && siteProfile.wp_username && siteProfile.wp_app_password) {
          const wpClient = createWpClient({ restUrl: siteProfile.wp_rest_url, username: siteProfile.wp_username, appPassword: siteProfile.wp_app_password });
          await wpUpdatePage(wpClient, build.wp_page_id, { content: currentMarkup });
        }

        // Update iteration counter
        await supabase.from('pageforge_builds').update({
          vqa_fix_iteration: currentIteration, updated_at: new Date().toISOString(),
        }).eq('id', buildId);

        // Update markup artifact for downstream phases
        await updateBuildArtifacts(supabase, buildId, 'markup_generation', { ...markupData, markup: currentMarkup });
        break; // One fix iteration per phase execution
      }

      await updateBuildArtifacts(supabase, buildId, 'vqa_fix_loop', { iterations: currentIteration, changesApplied: allChanges, maxLoops });
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
