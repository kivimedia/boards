import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse, successResponse } from '@/lib/api-helpers';
import {
  createFigmaClient,
  figmaGetFile,
  figmaGetImages,
  figmaDownloadImage,
  FigmaNode,
} from '@/lib/integrations/figma-client';
import { getProviderKey } from '@/lib/ai/providers';
import { logUsage } from '@/lib/ai/cost-tracker';
import type { PageForgeNamingIssue } from '@/lib/types';

interface Params {
  params: { id: string };
}

interface AutoNameRename {
  nodeId: string;
  currentName: string;
  suggestedName: string;
  reason: string;
}

// ============================================================================
// NODE TREE BUILDER
// ============================================================================

/**
 * Collect all node IDs that are ancestors of issue nodes.
 * This lets us prune the tree to only relevant branches.
 */
function collectAncestorIds(
  node: FigmaNode,
  issueNodeIds: Set<string>,
  ancestors: string[] = []
): Set<string> {
  const result = new Set<string>();

  if (issueNodeIds.has(node.id)) {
    // Mark all ancestors as relevant
    for (const ancestorId of ancestors) {
      result.add(ancestorId);
    }
    result.add(node.id);
  }

  if (node.children) {
    const newAncestors = [...ancestors, node.id];
    for (const child of node.children) {
      const childResult = collectAncestorIds(child, issueNodeIds, newAncestors);
      childResult.forEach((id) => result.add(id));
    }
  }

  return result;
}

/**
 * Build a filtered node tree that only includes:
 * - Nodes with naming issues
 * - Ancestors of nodes with naming issues
 * - Direct children of ancestor nodes (for context)
 */
function buildFilteredNodeTree(
  node: FigmaNode,
  issueNodeIds: Set<string>,
  relevantIds: Set<string>,
  depth: number = 0
): string[] {
  const lines: string[] = [];
  const isRelevant = relevantIds.has(node.id) || issueNodeIds.has(node.id);

  // Always include root-level pages and relevant nodes
  if (depth <= 1 || isRelevant) {
    const indent = '  '.repeat(depth);
    const hasIssue = issueNodeIds.has(node.id);
    const marker = hasIssue ? ' [!]' : '';
    lines.push(`${indent}[${node.id}] ${node.type} "${node.name}"${marker}`);

    if (node.children) {
      for (const child of node.children) {
        lines.push(
          ...buildFilteredNodeTree(child, issueNodeIds, relevantIds, depth + 1)
        );
      }
    }
  }

  return lines;
}

// ============================================================================
// GEMINI SYSTEM PROMPT
// ============================================================================

const SYSTEM_PROMPT = `You are a Figma layer naming expert. You are given a screenshot of a web page design and a tree of Figma layers.
Many layers have generic auto-generated names like "Frame 427", "Rectangle 12", "Group 5", etc.
These are marked with [!] in the node tree.

Your job is to analyze the screenshot visually, understand what each section/element represents,
and suggest proper semantic names following these conventions:
- Use kebab-case (e.g., hero-section, cta-button, footer-nav)
- Name should describe the visual/functional role (e.g., testimonials-grid, pricing-card, social-links)
- For text layers, include the content type (e.g., hero-heading, subtitle-text, price-label)
- For images/icons, describe what they show (e.g., logo-icon, hero-background, team-photo)
- Group containers by what they contain (e.g., features-section, pricing-cards-row)
- Keep names concise but descriptive (max 3-4 words joined by hyphens)

Respond ONLY with valid JSON (no markdown code fences, no extra text):
{
  "renames": [
    {"nodeId": "1:23", "currentName": "Frame 427", "suggestedName": "hero-section", "reason": "Top banner area with headline and CTA"}
  ]
}

Only include nodes that need renaming (marked with [!] that have generic/meaningless names). Skip nodes that already have good descriptive names.`;

// ============================================================================
// POST HANDLER
// ============================================================================

/**
 * POST /api/pageforge/builds/[id]/auto-name
 * Use AI vision to suggest proper Figma layer names for layers with generic names.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const buildId = params.id;
  const startTime = Date.now();

  // -----------------------------------------------------------------------
  // 1. Fetch build + site profile
  // -----------------------------------------------------------------------
  let build: any;
  try {
    const { data, error } = await supabase
      .from('pageforge_builds')
      .select('*, site_profile:pageforge_site_profiles(*)')
      .eq('id', buildId)
      .single();

    if (error || !data) {
      return errorResponse('Build not found', 404);
    }
    build = data;
  } catch (err) {
    console.error('[auto-name] Failed to fetch build:', err);
    return errorResponse('Failed to fetch build', 500);
  }

  const siteProfile = build.site_profile;

  // -----------------------------------------------------------------------
  // 2. Validate required fields
  // -----------------------------------------------------------------------
  if (!build.figma_file_key) {
    return errorResponse('Build has no Figma file key');
  }

  if (!siteProfile?.figma_personal_token) {
    return errorResponse('Site profile has no Figma personal token configured');
  }

  const artifacts = (build.artifacts || {}) as Record<string, any>;
  const namingData = artifacts.preflight?.figma_naming;

  if (!namingData?.issues || namingData.issues.length === 0) {
    return errorResponse('No naming issues found in preflight data');
  }

  const namingIssues: PageForgeNamingIssue[] = namingData.issues;
  const issueNodeIds = new Set(namingIssues.map((i) => i.nodeId));

  // -----------------------------------------------------------------------
  // 3. Get the Figma file tree
  // -----------------------------------------------------------------------
  let figmaFile;
  try {
    const client = createFigmaClient(siteProfile.figma_personal_token);
    figmaFile = await figmaGetFile(client, build.figma_file_key);
  } catch (err) {
    console.error('[auto-name] Failed to fetch Figma file:', err);
    return errorResponse(
      `Failed to fetch Figma file: ${err instanceof Error ? err.message : String(err)}`,
      502
    );
  }

  // -----------------------------------------------------------------------
  // 4. Build a compact text tree for the prompt
  // -----------------------------------------------------------------------
  const document = figmaFile.document;
  const pages = document.children || [];

  // Use figma_node_ids if available, otherwise use all pages
  const targetNodeIds: string[] = build.figma_node_ids?.length
    ? build.figma_node_ids
    : pages.map((p: FigmaNode) => p.id);

  // Find the target page nodes
  const targetPages = pages.filter((p: FigmaNode) =>
    targetNodeIds.some((nid: string) => nid === p.id || nid.startsWith(p.id))
  );

  // If no pages matched, fall back to first page
  const pagesToProcess = targetPages.length > 0 ? targetPages : pages.slice(0, 1);

  // Build the filtered node trees
  let nodeTreeText = '';
  for (const page of pagesToProcess) {
    const relevantIds = collectAncestorIds(page, issueNodeIds);
    const treeLines = buildFilteredNodeTree(page, issueNodeIds, relevantIds);
    nodeTreeText += treeLines.join('\n') + '\n';
  }

  // Truncate if tree is too large (keep under 20k chars for Gemini context)
  const MAX_TREE_LENGTH = 20000;
  if (nodeTreeText.length > MAX_TREE_LENGTH) {
    nodeTreeText = nodeTreeText.substring(0, MAX_TREE_LENGTH) + '\n... (truncated)';
  }

  // -----------------------------------------------------------------------
  // 5. Export page-level screenshot from Figma
  // -----------------------------------------------------------------------
  let screenshotBase64: string | null = null;
  try {
    const client = createFigmaClient(siteProfile.figma_personal_token);
    const pageNodeIds = pagesToProcess.map((p: FigmaNode) => p.id);

    const imgResponse = await figmaGetImages(client, build.figma_file_key, pageNodeIds, {
      format: 'jpg',
      scale: 1,
    });

    if (imgResponse.images) {
      // Get the first available image URL
      const imageUrls = Object.values(imgResponse.images).filter(Boolean);
      if (imageUrls.length > 0) {
        const imageBuffer = await figmaDownloadImage(imageUrls[0]);
        screenshotBase64 = imageBuffer.toString('base64');
      }
    }
  } catch (err) {
    // Screenshot is optional - continue without it
    console.warn('[auto-name] Failed to export Figma screenshot, proceeding without image:', err);
  }

  // -----------------------------------------------------------------------
  // 6. Call Gemini 2.0 Flash with screenshot + node tree
  // -----------------------------------------------------------------------
  let renames: AutoNameRename[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const apiKey = await getProviderKey(supabase, 'google');
    if (!apiKey) {
      return errorResponse('Google AI API key not configured');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Build parts array - image first (if available), then text
    const parts: any[] = [];

    if (screenshotBase64) {
      parts.push({
        inlineData: { mimeType: 'image/jpeg', data: screenshotBase64 },
      });
    }

    const userMessage = screenshotBase64
      ? `Analyze this Figma page screenshot alongside the node tree below. Suggest proper semantic names for all nodes marked with [!].\n\nNode tree:\n${nodeTreeText}`
      : `I don't have a screenshot available, but here is the Figma node tree. Based on the node types, nesting structure, and any naming patterns, suggest proper semantic names for all nodes marked with [!].\n\nNode tree:\n${nodeTreeText}`;

    parts.push({ text: userMessage });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      systemInstruction: { role: 'model', parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
      },
    });

    const responseText = result.response.text();
    const usage = result.response.usageMetadata;
    inputTokens = usage?.promptTokenCount || 0;
    outputTokens = usage?.candidatesTokenCount || 0;

    // Parse JSON response - handle potential markdown code fences
    let cleanJson = responseText.trim();
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleanJson);
    renames = Array.isArray(parsed.renames) ? parsed.renames : [];

    // Validate rename entries
    renames = renames.filter(
      (r) =>
        r &&
        typeof r.nodeId === 'string' &&
        typeof r.suggestedName === 'string' &&
        r.nodeId.length > 0 &&
        r.suggestedName.length > 0
    );
  } catch (err) {
    console.error('[auto-name] Gemini vision call failed:', err);

    const durationMs = Date.now() - startTime;
    // Log the failed attempt
    try {
      await logUsage(supabase, {
        userId,
        activity: 'pageforge_orchestrator',
        provider: 'google',
        modelId: 'gemini-2.5-flash',
        inputTokens,
        outputTokens,
        latencyMs: durationMs,
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
        metadata: { buildId, endpoint: 'auto-name' },
      });
    } catch (logErr) {
      console.error('[auto-name] Failed to log usage:', logErr);
    }

    return errorResponse(
      `AI naming failed: ${err instanceof Error ? err.message : String(err)}`,
      502
    );
  }

  const durationMs = Date.now() - startTime;

  // -----------------------------------------------------------------------
  // 7. Log usage
  // -----------------------------------------------------------------------
  try {
    await logUsage(supabase, {
      userId,
      activity: 'pageforge_orchestrator',
      provider: 'google',
      modelId: 'gemini-2.5-flash',
      inputTokens,
      outputTokens,
      latencyMs: durationMs,
      status: 'success',
      metadata: {
        buildId,
        endpoint: 'auto-name',
        issueCount: namingIssues.length,
        renameCount: renames.length,
        hadScreenshot: !!screenshotBase64,
      },
    });
  } catch (logErr) {
    console.error('[auto-name] Failed to log usage:', logErr);
  }

  // -----------------------------------------------------------------------
  // 8. Store results in build artifacts
  // -----------------------------------------------------------------------
  const autoNameResults = {
    renames,
    generated_at: new Date().toISOString(),
    model: 'gemini-2.5-flash',
    issue_count: namingIssues.length,
    rename_count: renames.length,
    had_screenshot: !!screenshotBase64,
    duration_ms: durationMs,
  };

  try {
    const updatedArtifacts = {
      ...artifacts,
      auto_name_results: autoNameResults,
    };

    const { error: updateError } = await supabase
      .from('pageforge_builds')
      .update({
        artifacts: updatedArtifacts,
        updated_at: new Date().toISOString(),
      })
      .eq('id', buildId);

    if (updateError) {
      console.error('[auto-name] Failed to save results to build artifacts:', updateError);
      // Still return results even if storage fails
    }
  } catch (saveErr) {
    console.error('[auto-name] Failed to save results:', saveErr);
  }

  // -----------------------------------------------------------------------
  // 9. Return results
  // -----------------------------------------------------------------------
  return successResponse({
    renames,
    issue_count: namingIssues.length,
    rename_count: renames.length,
    had_screenshot: !!screenshotBase64,
    duration_ms: durationMs,
  });
}
