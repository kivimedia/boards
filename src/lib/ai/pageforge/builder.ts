import { SupabaseClient } from '@supabase/supabase-js';
import {
  createFigmaClient,
  figmaGetFile,
  figmaGetFileNodes,
  figmaGetImages,
  figmaDownloadImage,
  figmaExtractSections,
  figmaExtractColors,
  figmaExtractTypography,
  type FigmaNode,
  type FigmaSection,
  type FigmaDesignTokens,
} from '../../integrations/figma-client';
import {
  createWpClient,
  wpCreatePage,
  wpUpdatePage,
  wpUploadMedia,
  type WpClient,
  type WpPage,
  type WpMedia,
} from '../../integrations/wordpress-client';
import { callPageForgeAgent } from '../pageforge-pipeline';
import { getSystemPrompt } from '../prompt-templates';
import type { PageForgeSiteProfile, PageForgeBuild, PageForgeBuilderType } from '../../types';

// ============================================================================
// BUILDER AGENT
// Analyzes Figma designs, generates markup, deploys to WordPress.
// The heaviest agent - handles the core conversion pipeline.
// ============================================================================

export interface FigmaAnalysisResult {
  sections: FigmaSection[];
  colors: FigmaDesignTokens['colors'];
  fonts: FigmaDesignTokens['fonts'];
  imageNodeIds: string[];
  designSummary: string;
}

export interface SectionClassification {
  sectionId: string;
  sectionName: string;
  type: string; // hero, features, cta, testimonials, pricing, footer, etc.
  tier: 1 | 2 | 3 | 4;
  description: string;
}

export interface MarkupResult {
  markup: string;
  builder: PageForgeBuilderType;
  sections: Array<{ name: string; markup: string }>;
}

export interface DeployResult {
  pageId: number;
  draftUrl: string;
  previewUrl: string;
}

export interface ImageOptResult {
  uploaded: number;
  failed: number;
  mediaIds: number[];
}

// ============================================================================
// FIGMA ANALYSIS
// ============================================================================

export async function analyzeFigmaDesign(
  supabase: SupabaseClient,
  buildId: string,
  siteProfile: PageForgeSiteProfile,
  figmaFileKey: string,
  figmaNodeIds: string[]
): Promise<FigmaAnalysisResult> {
  const client = createFigmaClient(siteProfile.figma_personal_token!);

  let pageNode: FigmaNode;

  if (figmaNodeIds.length > 0) {
    const nodes = await figmaGetFileNodes(client, figmaFileKey, figmaNodeIds);
    const firstNode = Object.values(nodes)[0];
    if (!firstNode) throw new Error('No Figma nodes found for the specified IDs');
    pageNode = firstNode.document;
  } else {
    const file = await figmaGetFile(client, figmaFileKey);
    // Get the first page's first frame
    const firstPage = file.document.children?.[0];
    if (!firstPage) throw new Error('Figma file has no pages');
    pageNode = firstPage;
  }

  const sections = figmaExtractSections(pageNode);
  const colors = figmaExtractColors(pageNode);
  const fonts = figmaExtractTypography(pageNode);

  // Collect image node IDs (nodes with image fills)
  const imageNodeIds: string[] = [];
  function findImages(node: FigmaNode) {
    if (node.fills) {
      for (const fill of node.fills) {
        if (fill.type === 'IMAGE' && fill.imageRef) {
          imageNodeIds.push(node.id);
          break;
        }
      }
    }
    if (node.children) {
      for (const child of node.children) findImages(child);
    }
  }
  findImages(pageNode);

  // Generate AI summary of the design
  const designContext = {
    sections: sections.map(s => ({ name: s.name, type: s.type, bounds: s.bounds })),
    colorCount: colors.length,
    fontCount: fonts.length,
    imageCount: imageNodeIds.length,
  };

  const result = await callPageForgeAgent(
    supabase,
    buildId,
    'pageforge_analyzer',
    'figma_analysis',
    getSystemPrompt('pageforge_builder'),
    `Analyze this Figma design structure and provide a brief summary of the page layout:

Sections (top to bottom):
${sections.map((s, i) => `${i + 1}. "${s.name}" (${s.type}) - ${s.bounds.width}x${s.bounds.height}px`).join('\n')}

Design tokens:
- ${colors.length} unique colors
- ${fonts.length} font styles
- ${imageNodeIds.length} images

Provide a 2-3 sentence summary of this page design.`,
    { activity: 'pageforge_builder' }
  );

  return {
    sections,
    colors,
    fonts,
    imageNodeIds,
    designSummary: result.text,
  };
}

// ============================================================================
// SECTION CLASSIFICATION
// ============================================================================

export async function classifySections(
  supabase: SupabaseClient,
  buildId: string,
  sections: FigmaSection[]
): Promise<SectionClassification[]> {
  const systemPrompt = getSystemPrompt('pageforge_builder');

  const userMessage = `Classify each page section by type and complexity tier.

Sections:
${sections.map((s, i) => `${i + 1}. "${s.name}" - ${s.bounds.width}x${s.bounds.height}px, ${s.children.length} child elements`).join('\n')}

For each section, respond with JSON array:
[
  {
    "sectionId": "...",
    "sectionName": "...",
    "type": "hero|features|cta|testimonials|pricing|stats|gallery|contact|footer|navigation|content|faq|team|logos|video",
    "tier": 1-4,
    "description": "brief description"
  }
]

Tier guide:
- Tier 1: Simple (text + image, single CTA)
- Tier 2: Standard (cards grid, icon lists, multi-column)
- Tier 3: Complex (interactive elements, custom layouts, animations)
- Tier 4: Advanced (custom components, dynamic content, complex interactions)`;

  const result = await callPageForgeAgent(
    supabase, buildId, 'pageforge_classifier', 'section_classification',
    systemPrompt, userMessage, { activity: 'pageforge_builder' }
  );

  try {
    const jsonMatch = result.text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Fall back to default classification
  }

  return sections.map(s => ({
    sectionId: s.id,
    sectionName: s.name,
    type: 'content',
    tier: 2 as const,
    description: s.name,
  }));
}

// ============================================================================
// MARKUP GENERATION
// ============================================================================

export async function generateMarkup(
  supabase: SupabaseClient,
  buildId: string,
  builder: PageForgeBuilderType,
  sections: FigmaSection[],
  classifications: SectionClassification[],
  designTokens: { colors: FigmaDesignTokens['colors']; fonts: FigmaDesignTokens['fonts'] },
  globalCss?: string | null
): Promise<MarkupResult> {
  const systemPrompt = getSystemPrompt('pageforge_builder');

  const builderInstructions = builder === 'gutenberg'
    ? getGutenbergInstructions()
    : builder === 'divi5'
      ? getDivi5Instructions()
      : getDivi4Instructions();

  const userMessage = `Generate WordPress ${builder} markup for this page.

${builderInstructions}

Design Tokens:
- Colors: ${designTokens.colors.slice(0, 10).map(c => `${c.hex} (${c.name})`).join(', ')}
- Fonts: ${designTokens.fonts.map(f => `${f.family} ${f.weight} ${f.size}px`).join(', ')}
${globalCss ? `\nGlobal CSS:\n${globalCss.slice(0, 1000)}` : ''}

Sections to generate:
${classifications.map((c, i) => `${i + 1}. "${c.sectionName}" (${c.type}, Tier ${c.tier}) - ${c.description}`).join('\n')}

Section details:
${sections.map(s => `"${s.name}": ${s.bounds.width}x${s.bounds.height}px, ${s.children.length} children`).join('\n')}

IMPORTANT:
- Generate complete, valid markup for each section
- Use inline styles for exact colors and typography from the design tokens
- Make responsive with mobile-first approach
- Use semantic HTML elements
- Return the FULL page markup ready to insert into WordPress

Respond with JSON:
{
  "markup": "full page markup as single string",
  "sections": [{"name": "section name", "markup": "section markup"}]
}`;

  const result = await callPageForgeAgent(
    supabase, buildId, 'pageforge_markup_gen', 'markup_generation',
    systemPrompt, userMessage, { activity: 'pageforge_builder' }
  );

  try {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        markup: parsed.markup || result.text,
        builder,
        sections: parsed.sections || [],
      };
    }
  } catch {
    // Fall through
  }

  return {
    markup: result.text,
    builder,
    sections: [],
  };
}

// ============================================================================
// MARKUP VALIDATION
// ============================================================================

export async function validateMarkup(
  supabase: SupabaseClient,
  buildId: string,
  markup: string,
  builder: PageForgeBuilderType
): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (builder === 'gutenberg') {
    // Check for balanced block comments
    const openBlocks = (markup.match(/<!-- wp:/g) || []).length;
    const closeBlocks = (markup.match(/<!-- \/wp:/g) || []).length;
    if (openBlocks !== closeBlocks) {
      errors.push(`Unbalanced Gutenberg blocks: ${openBlocks} open, ${closeBlocks} close`);
    }

    // Check for common block types
    if (!markup.includes('<!-- wp:')) {
      warnings.push('No Gutenberg block markers found - content may not render in the editor');
    }
  }

  if (builder === 'divi5') {
    // Basic JSON validation for Divi 5 format
    try {
      if (markup.startsWith('{') || markup.startsWith('[')) {
        JSON.parse(markup);
      }
    } catch {
      warnings.push('Divi 5 markup does not parse as valid JSON');
    }
  }

  // General HTML validation
  const unclosedTags = findUnclosedTags(markup);
  if (unclosedTags.length > 0) {
    warnings.push(`Potentially unclosed tags: ${unclosedTags.join(', ')}`);
  }

  // Check for empty content
  if (markup.trim().length < 50) {
    errors.push('Markup appears to be empty or too short');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ============================================================================
// DEPLOY DRAFT TO WORDPRESS
// ============================================================================

export async function deployDraftToWP(
  siteProfile: PageForgeSiteProfile,
  build: PageForgeBuild,
  markup: string
): Promise<DeployResult> {
  if (!siteProfile.wp_username || !siteProfile.wp_app_password) {
    throw new Error('WordPress credentials not configured');
  }

  const wpClient = createWpClient({
    restUrl: siteProfile.wp_rest_url,
    username: siteProfile.wp_username,
    appPassword: siteProfile.wp_app_password,
  });

  let page: WpPage;

  if (build.wp_page_id) {
    // Update existing draft
    page = await wpUpdatePage(wpClient, build.wp_page_id, {
      title: build.page_title,
      content: markup,
      slug: build.page_slug || undefined,
    });
  } else {
    // Create new draft
    page = await wpCreatePage(wpClient, {
      title: build.page_title,
      content: markup,
      slug: build.page_slug || undefined,
      status: 'draft',
    });
  }

  const siteUrl = siteProfile.site_url.replace(/\/$/, '');

  return {
    pageId: page.id,
    draftUrl: `${siteUrl}/?page_id=${page.id}&preview=true`,
    previewUrl: page.link || `${siteUrl}/${page.slug}/`,
  };
}

// ============================================================================
// IMAGE OPTIMIZATION
// ============================================================================

export async function optimizeImages(
  supabase: SupabaseClient,
  buildId: string,
  siteProfile: PageForgeSiteProfile,
  figmaFileKey: string,
  imageNodeIds: string[]
): Promise<ImageOptResult> {
  if (imageNodeIds.length === 0) {
    return { uploaded: 0, failed: 0, mediaIds: [] };
  }

  const figmaClient = createFigmaClient(siteProfile.figma_personal_token!);
  const wpClient = createWpClient({
    restUrl: siteProfile.wp_rest_url,
    username: siteProfile.wp_username!,
    appPassword: siteProfile.wp_app_password!,
  });

  // Export images from Figma
  const imageResponse = await figmaGetImages(figmaClient, figmaFileKey, imageNodeIds, {
    format: 'png',
    scale: 2,
  });

  const mediaIds: number[] = [];
  let uploaded = 0;
  let failed = 0;

  // Download and upload each image
  for (const [nodeId, imageUrl] of Object.entries(imageResponse.images)) {
    if (!imageUrl) {
      failed++;
      continue;
    }

    try {
      const buffer = await figmaDownloadImage(imageUrl);
      const filename = `pageforge-${buildId.slice(0, 8)}-${nodeId.replace(/[^a-zA-Z0-9]/g, '-')}.png`;

      const media = await wpUploadMedia(wpClient, buffer, filename, 'image/png');
      mediaIds.push(media.id);
      uploaded++;
    } catch (err) {
      console.error(`[pageforge] Failed to upload image ${nodeId}:`, err);
      failed++;
    }
  }

  return { uploaded, failed, mediaIds };
}

// ============================================================================
// BUILDER INSTRUCTIONS
// ============================================================================

function getGutenbergInstructions(): string {
  return `## Gutenberg Block Format
Generate valid WordPress Gutenberg block markup using these patterns:

<!-- wp:group {"layout":{"type":"constrained"}} -->
<div class="wp-block-group">
  <!-- wp:heading {"level":2} -->
  <h2 class="wp-block-heading">Title</h2>
  <!-- /wp:heading -->
  <!-- wp:paragraph -->
  <p>Content</p>
  <!-- /wp:paragraph -->
</div>
<!-- /wp:group -->

<!-- wp:columns -->
<div class="wp-block-columns">
  <!-- wp:column -->
  <div class="wp-block-column">Content</div>
  <!-- /wp:column -->
</div>
<!-- /wp:columns -->

<!-- wp:image {"sizeSlug":"full"} -->
<figure class="wp-block-image size-full"><img src="PLACEHOLDER" alt=""/></figure>
<!-- /wp:image -->

<!-- wp:cover {"overlayColor":"black","minHeight":500} -->
<div class="wp-block-cover" style="min-height:500px"><span class="wp-block-cover__background has-black-background-color"></span><div class="wp-block-cover__inner-container">
  Content
</div></div>
<!-- /wp:cover -->

<!-- wp:buttons -->
<div class="wp-block-buttons">
  <!-- wp:button {"backgroundColor":"primary"} -->
  <div class="wp-block-button"><a class="wp-block-button__link wp-element-button">CTA Text</a></div>
  <!-- /wp:button -->
</div>
<!-- /wp:buttons -->

Use inline styles for exact design token values. Use custom CSS classes only if critical.`;
}

function getDivi5Instructions(): string {
  return `## Divi 5 Format
Divi 5 uses JSON-based block storage. Generate content using Gutenberg blocks (Divi 5 supports them natively) with Divi-specific wrapper if needed.

For now, generate Gutenberg block markup that Divi 5 can render. We will research the native Divi 5 JSON format separately.

Use inline styles for exact positioning and design token values.`;
}

function getDivi4Instructions(): string {
  return `## Divi 4 Format
Generate Divi 4 shortcode markup using these patterns:

[et_pb_section][et_pb_row][et_pb_column type="4_4"]
[et_pb_text]Content[/et_pb_text]
[/et_pb_column][/et_pb_row][/et_pb_section]

[et_pb_section fullwidth="on"][et_pb_fullwidth_header title="Hero Title" subhead="Subtitle" button_one_text="CTA" background_color="#000000"][/et_pb_fullwidth_header][/et_pb_section]

Use custom_css attributes for exact styling.`;
}

// ============================================================================
// HELPERS
// ============================================================================

function findUnclosedTags(html: string): string[] {
  const selfClosing = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area', 'base', 'col', 'embed', 'track', 'wbr']);
  const openTags: string[] = [];
  const unclosed: string[] = [];

  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*\/?>/g;
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    const fullMatch = match[0];
    const tagName = match[1].toLowerCase();

    if (selfClosing.has(tagName) || fullMatch.endsWith('/>')) continue;

    if (fullMatch.startsWith('</')) {
      const lastOpen = openTags.lastIndexOf(tagName);
      if (lastOpen >= 0) {
        openTags.splice(lastOpen, 1);
      }
    } else {
      openTags.push(tagName);
    }
  }

  return Array.from(new Set(openTags)).slice(0, 5);
}
