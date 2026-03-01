// ============================================================================
// PAGEFORGE AUTO-NAME - VPS-compatible copy for AI-powered Figma layer renaming
// Adapted from src/lib/ai/pageforge-auto-name.ts with VPS import paths.
// ============================================================================

import {
  createFigmaClient,
  figmaGetFile,
  figmaGetImages,
  figmaDownloadImage,
  type FigmaNode,
} from './figma-client.js';

// ============================================================================
// TYPES (local definition to avoid importing from Next.js project)
// ============================================================================

interface PageForgeNamingIssue {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  depth: number;
  issue: string;
  suggested?: string;
}

export interface AutoNameRename {
  nodeId: string;
  currentName: string;
  suggestedName: string;
  reason: string;
}

export interface AutoNameResult {
  renames: AutoNameRename[];
  generated_at: string;
  model: string;
  issue_count: number;
  rename_count: number;
  had_screenshot: boolean;
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
}

export interface RunAutoNameParams {
  figmaFileKey: string;
  figmaPersonalToken: string;
  figmaNodeIds?: string[];
  namingIssues: PageForgeNamingIssue[];
  googleApiKey: string;
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
// NODE TREE HELPERS
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
// MAIN EXPORT
// ============================================================================

/**
 * Run AI-powered auto-naming on Figma layers with generic names.
 * Fetches the Figma file, builds a filtered node tree, optionally captures
 * a screenshot, and calls Gemini 2.5 Flash for semantic name suggestions.
 */
export async function runAutoName(params: RunAutoNameParams): Promise<AutoNameResult> {
  const startTime = Date.now();

  // 1. Build issue node ID set
  const issueNodeIds = new Set(params.namingIssues.map((i) => i.nodeId));

  // 2. Fetch Figma file tree
  let figmaFile;
  try {
    const client = createFigmaClient(params.figmaPersonalToken);
    figmaFile = await figmaGetFile(client, params.figmaFileKey);
  } catch (err) {
    throw new Error(
      `Failed to fetch Figma file: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 3. Build a compact text tree for the prompt
  const document = figmaFile.document;
  const pages = document.children || [];

  // Use figmaNodeIds if available, otherwise use all pages
  const targetNodeIds: string[] = params.figmaNodeIds?.length
    ? params.figmaNodeIds
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

  // 4. Export page-level screenshot from Figma (optional)
  let screenshotBase64: string | null = null;
  try {
    const client = createFigmaClient(params.figmaPersonalToken);
    const pageNodeIds = pagesToProcess.map((p: FigmaNode) => p.id);

    const imgResponse = await figmaGetImages(client, params.figmaFileKey, pageNodeIds, {
      format: 'jpg',
      scale: 1,
    });

    if (imgResponse.images) {
      const imageUrls = Object.values(imgResponse.images).filter((u): u is string => !!u);
      if (imageUrls.length > 0) {
        const imageBuffer = await figmaDownloadImage(imageUrls[0]);
        screenshotBase64 = imageBuffer.toString('base64');
      }
    }
  } catch (err) {
    // Screenshot is optional - continue without it
    console.warn('[auto-name] Failed to export Figma screenshot, proceeding without image:', err);
  }

  // 5. Call Gemini 2.5 Flash with screenshot + node tree
  let renames: AutoNameRename[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');

    const genAI = new GoogleGenerativeAI(params.googleApiKey);
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
        maxOutputTokens: 32768,
      },
    });

    const responseText = result.response.text();
    const usage = result.response.usageMetadata;
    inputTokens = usage?.promptTokenCount || 0;
    outputTokens = usage?.candidatesTokenCount || 0;

    // 6. Parse JSON response - handle potential markdown code fences and truncation
    let cleanJson = responseText.trim();
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (parseErr) {
      // JSON may be truncated - try to recover partial results
      // Find the last complete object in the renames array
      const lastGoodClose = cleanJson.lastIndexOf('}');
      if (lastGoodClose > 0) {
        const truncated = cleanJson.substring(0, lastGoodClose + 1) + ']}';
        try {
          parsed = JSON.parse(truncated);
        } catch {
          // Try one more level - maybe we need to close an extra brace
          try {
            parsed = JSON.parse(truncated + '}');
          } catch {
            throw parseErr; // Give up, rethrow original error
          }
        }
      } else {
        throw parseErr;
      }
    }

    renames = Array.isArray(parsed.renames) ? parsed.renames : [];

    // 7. Validate and filter renames
    renames = renames.filter(
      (r) =>
        r &&
        typeof r.nodeId === 'string' &&
        typeof r.suggestedName === 'string' &&
        r.nodeId.length > 0 &&
        r.suggestedName.length > 0
    );
  } catch (err) {
    const durationMs = Date.now() - startTime;
    throw new Error(
      `AI naming failed (${durationMs}ms): ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const durationMs = Date.now() - startTime;

  // 8. Return results
  return {
    renames,
    generated_at: new Date().toISOString(),
    model: 'gemini-2.5-flash',
    issue_count: params.namingIssues.length,
    rename_count: renames.length,
    had_screenshot: !!screenshotBase64,
    duration_ms: durationMs,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  };
}
