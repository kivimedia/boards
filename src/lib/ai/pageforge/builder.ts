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

  const builderInstructions = builder === 'divi5'
    ? getDivi5Instructions()
    : getGutenbergInstructions();

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
      let finalMarkup = parsed.markup || result.text;

      // For Divi 5: auto-inject CSS grid override to fix column width issues
      if (builder === 'divi5') {
        const gridOverride = generateDivi5GridOverride(finalMarkup);
        if (gridOverride) {
          // Prepend the CSS override block before the Divi placeholder
          const placeholderIdx = finalMarkup.indexOf('<!-- wp:divi/placeholder -->');
          if (placeholderIdx > -1) {
            finalMarkup = finalMarkup.slice(0, placeholderIdx) + gridOverride + '\n' + finalMarkup.slice(placeholderIdx);
          } else {
            finalMarkup = gridOverride + '\n' + finalMarkup;
          }
        }
      }

      return {
        markup: finalMarkup,
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
    // Divi 5 uses wp:divi/* block comments, not raw JSON
    if (!markup.includes('<!-- wp:divi/')) {
      errors.push('No Divi 5 block markers found (expected <!-- wp:divi/... -->)');
    }
    if (!markup.includes('<!-- wp:divi/placeholder')) {
      warnings.push('Missing divi/placeholder wrapper — page may not render in Divi 5 visual builder');
    }
    if (!markup.includes('<!-- wp:divi/section')) {
      errors.push('No divi/section blocks found — page needs at least one section');
    }
    // Validate nesting: sections should exist
    const openSections = (markup.match(/<!-- wp:divi\/section\b/g) || []).length;
    const closeSections = (markup.match(/<!-- \/wp:divi\/section/g) || []).length;
    if (openSections !== closeSections) {
      errors.push(`Unbalanced divi/section blocks: ${openSections} open, ${closeSections} close`);
    }
    const openRows = (markup.match(/<!-- wp:divi\/row\b/g) || []).length;
    const closeRows = (markup.match(/<!-- \/wp:divi\/row/g) || []).length;
    if (openRows !== closeRows) {
      errors.push(`Unbalanced divi/row blocks: ${openRows} open, ${closeRows} close`);
    }
    const openCols = (markup.match(/<!-- wp:divi\/column\b/g) || []).length;
    const closeCols = (markup.match(/<!-- \/wp:divi\/column/g) || []).length;
    // Self-closing columns are valid, so only flag if close > open
    if (closeCols > openCols) {
      errors.push(`More closing divi/column tags (${closeCols}) than opening (${openCols})`);
    }
    // Validate JSON in block attributes
    const blockJsonMatches = markup.match(/<!-- wp:divi\/\w+\s+(\{.*?\})\s*\/?-->/g) || [];
    for (const block of blockJsonMatches) {
      const jsonMatch = block.match(/\{.*\}/);
      if (jsonMatch) {
        try {
          JSON.parse(jsonMatch[0]);
        } catch {
          const blockType = block.match(/wp:divi\/(\w+)/)?.[1] || 'unknown';
          errors.push(`Invalid JSON in divi/${blockType} block`);
          break; // Report first error only
        }
      }
    }
  }

  if (builder === 'gutenberg') {
    // General HTML validation — only for Gutenberg (Divi 5 is block comments, not HTML)
    const unclosedTags = findUnclosedTags(markup);
    if (unclosedTags.length > 0) {
      warnings.push(`Potentially unclosed tags: ${unclosedTags.join(', ')}`);
    }
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
  return `## Divi 5 Native Block Format

Divi 5 uses WordPress block comments with JSON attributes. The page is wrapped in \`<!-- wp:divi/placeholder -->\` and uses a strict nesting hierarchy:

### Nesting Rules
section → row → column → module (text, image, button, heading, blurb, divider, code)
Columns can also contain nested rows. Groups (\`divi/group\`) can wrap modules inside columns.

### Block Syntax
- **Structural blocks** (section, row, column, group) use open/close comments:
  \`<!-- wp:divi/section {JSON} -->...<!-- /wp:divi/section -->\`
- **Content modules** (text, image, button, heading, blurb, divider, code) are self-closing:
  \`<!-- wp:divi/text {JSON} /-->\`

### Responsive Breakpoints
All style values use breakpoint wrappers: \`desktop\`, \`phone\`, \`tablet\`, \`tabletWide\`
Format: \`{ "desktop": { "value": ... }, "phone": { "value": ... } }\`

### Module Attribute Schema

**divi/section** — Top-level page section
\`\`\`json
{"module":{"decoration":{"background":{"desktop":{"value":{"color":"#000000","image":{"url":"URL","size":"cover","position":"center center"}}}},"spacing":{"desktop":{"value":{"padding":{"top":"100px","bottom":"100px","syncVertical":"off","syncHorizontal":"off"}}}}}},"builderVersion":"5.0.0-public-beta.1"}
\`\`\`

**divi/row** — Container for columns
\`\`\`json
{"module":{"advanced":{"flexColumnStructure":{"desktop":{"value":"equal-columns_1"}}},"decoration":{"layout":{"desktop":{"value":{"flexWrap":"nowrap"}}}}},"builderVersion":"5.0.0-public-beta.1"}
\`\`\`

**divi/column** — Container for modules
\`\`\`json
{"module":{"decoration":{"sizing":{"desktop":{"value":{"flexType":"24_24"}}}}},"builderVersion":"5.0.0-public-beta.1"}
\`\`\`
Column widths use flexType fractions of 24: "24_24" (full), "12_24" (half), "8_24" (third), "6_24" (quarter).

**divi/text** — Rich text content
\`\`\`json
{"module":{"decoration":{"layout":{"desktop":{"value":{"display":"block"}}}}},"content":{"innerContent":{"desktop":{"value":"Your text here"}},"decoration":{"bodyFont":{"body":{"font":{"desktop":{"value":{"family":"Poppins","color":"#ffffff","size":"18px","weight":"400","lineHeight":"1.6em","textAlign":"center"}}}}}}},"builderVersion":"5.0.0-public-beta.1"}
\`\`\`

**divi/heading** — Heading element
\`\`\`json
{"module":{"decoration":{"layout":{"desktop":{"value":{"display":"block"}}}}},"title":{"innerContent":{"desktop":{"value":"Heading Text"}},"decoration":{"font":{"font":{"desktop":{"value":{"headingLevel":"h2","color":"#333333","size":"36px","weight":"700","textAlign":"center"}}}}}},"builderVersion":"5.0.0-public-beta.1"}
\`\`\`

**divi/image** — Image module
\`\`\`json
{"module":{"advanced":{"align":{"desktop":{"value":"center"}},"sizing":{"desktop":{"value":{"width":"100%"}}}},"decoration":{"layout":{"desktop":{"value":{"display":"block"}}}}},"image":{"innerContent":{"desktop":{"value":{"src":"IMAGE_URL","alt":"description"}}}},"builderVersion":"5.0.0-public-beta.1"}
\`\`\`

**divi/button** — Button module
\`\`\`json
{"module":{"advanced":{"alignment":{"desktop":{"value":"center"}}},"decoration":{"spacing":{"desktop":{"value":{"padding":{"left":"45px","right":"45px","top":"15px","bottom":"15px","syncVertical":"on","syncHorizontal":"on"}}}},"background":{"desktop":{"value":{"color":"#cc2336"}}},"border":{"desktop":{"value":{"radius":{"sync":"on","topLeft":"8px"}}}},"layout":{"desktop":{"value":{"display":"block"}}}}},"button":{"innerContent":{"desktop":{"value":{"text":"Button Text","url":"#"}}},"decoration":{"font":{"font":{"desktop":{"value":{"color":"#ffffff","size":"16px","weight":"600"}}}}}},"builderVersion":"5.0.0-public-beta.1"}
\`\`\`

**divi/blurb** — Card with image, title, and body text
\`\`\`json
{"imageIcon":{"innerContent":{"desktop":{"value":{"src":"IMAGE_URL"}}},"advanced":{"width":{"desktop":{"value":{"image":"50%"}}}}},"module":{"advanced":{"text":{"text":{"desktop":{"value":{"orientation":"center"}}}}},"decoration":{"layout":{"desktop":{"value":{"display":"block"}}}}},"title":{"innerContent":{"desktop":{"value":{"text":"Card Title"}}},"decoration":{"font":{"font":{"desktop":{"value":{"family":"Poppins","color":"#333333","size":"24px","weight":"600"}}}}}},"content":{"innerContent":{"desktop":{"value":"Card description text"}},"decoration":{"bodyFont":{"body":{"font":{"desktop":{"value":{"family":"Poppins","color":"#666666","size":"16px"}}}}}}},"builderVersion":"5.0.0-public-beta.1"}
\`\`\`

**divi/divider** — Visual separator
\`\`\`json
{"divider":{"advanced":{"line":{"desktop":{"value":{"color":"#ebebeb","position":"center"}}}}},"builderVersion":"5.0.0-public-beta.1"}
\`\`\`
Use \`"show":"off"\` for spacing-only dividers.

**divi/code** — Raw HTML/shortcode embed
\`\`\`json
{"content":{"innerContent":{"desktop":{"value":"<div>Raw HTML here</div>"}}},"builderVersion":"5.0.0-public-beta.1"}
\`\`\`

### Page Template
\`\`\`
<!-- wp:divi/placeholder -->
<!-- wp:divi/section {SECTION_ATTRS} -->
<!-- wp:divi/row {ROW_ATTRS} -->
<!-- wp:divi/column {COL_ATTRS} -->
<!-- wp:divi/text {TEXT_ATTRS} /-->
<!-- wp:divi/button {BTN_ATTRS} /-->
<!-- /wp:divi/column -->
<!-- /wp:divi/row -->
<!-- /wp:divi/section -->
<!-- /wp:divi/placeholder -->
\`\`\`

### Important Rules
1. Always wrap the entire page in \`<!-- wp:divi/placeholder -->...<!-- /wp:divi/placeholder -->\`
2. Always include \`"builderVersion":"5.0.0-public-beta.1"\` in every block
3. Content modules are SELF-CLOSING: \`<!-- wp:divi/text {...} /-->\` (note the \`/-->\`)
4. Structural blocks have open AND close tags
5. JSON must be valid — no trailing commas, proper escaping
6. Use Figma design tokens for colors, fonts, and spacing
7. For dark overlays on images, use background color with rgba: \`"color":"rgba(0,0,0,0.7)"\` plus image
8. Use \`disabledOn\` to hide elements per breakpoint: \`"disabledOn":{"phone":{"value":"on"}}\`
9. For multi-column layouts, use multiple columns in a single row with appropriate flexType values
10. CRITICAL Divi 5 rendering bug: The class \`et_flex_column_24_24\` (generated for full-width columns) forces \`width: calc(100%)\` on EVERY column. If you place multiple columns in a row (e.g. 3 blurb cards), Divi will render each column at 100% width, stacking them vertically instead of side-by-side. Always use the CORRECT flexType for the intended column count: "8_24" for 3-column layouts, "6_24" for 4-column layouts, "12_24" for 2-column layouts. NEVER use "24_24" for columns that should share a row.
11. For sections with a title row + content row, use TWO separate rows: first row with single "24_24" column for the heading, second row with multiple columns using the correct flexType for the grid layout.
12. WordPress strips \`<script>\` tags from \`<!-- wp:html -->\` blocks. Only use \`<style>\` for CSS overrides. JavaScript will NOT execute.`;
}


// ============================================================================
// DIVI 5 CSS GRID OVERRIDE GENERATOR
// Divi 5 forces et_flex_column_24_24 (width: 100%) on all columns, breaking
// multi-column layouts. This function analyzes generated markup and produces
// a CSS override block that applies CSS Grid to multi-column rows.
// ============================================================================

export function generateDivi5GridOverride(markup: string): string {
  // Parse rows and count columns per row
  // Use a simple start marker - don't try to parse the JSON attributes
  const rowStartPattern = /<!-- wp:divi\/row\b/g;
  const rowEndPattern = /<!-- \/wp:divi\/row -->/g;

  interface RowInfo {
    rowIndex: number;
    columnCount: number;
  }

  const rows: RowInfo[] = [];

  // Find each row start and end position
  const rowStarts: number[] = [];
  const rowEnds: number[] = [];

  let match;
  while ((match = rowStartPattern.exec(markup)) !== null) {
    rowStarts.push(match.index);
  }

  while ((match = rowEndPattern.exec(markup)) !== null) {
    rowEnds.push(match.index);
  }

  for (let i = 0; i < rowStarts.length && i < rowEnds.length; i++) {
    const rowContent = markup.slice(rowStarts[i], rowEnds[i]);
    // Count direct column blocks (not nested ones)
    const columns = rowContent.match(/<!-- wp:divi\/column\b/g) || [];
    rows.push({ rowIndex: i, columnCount: columns.length });
  }

  // Find rows that need grid layout (more than 1 column)
  const multiColRows = rows.filter(r => r.columnCount > 1);

  if (multiColRows.length === 0) {
    return ''; // No multi-column rows, no override needed
  }

  // Generate CSS rules
  const cssRules: string[] = [
    '/* PageForge Divi 5 Grid Override - Auto-generated */',
    '/* Fixes et_flex_column_24_24 forcing 100% width on columns */',
    '',
  ];

  // Global column reset for all multi-column rows
  const rowSelectors = multiColRows.map(r => `.et_pb_row_${r.rowIndex} > .et_pb_column`);
  cssRules.push(`${rowSelectors.join(',\n')} {`);
  cssRules.push('  width: auto !important;');
  cssRules.push('  max-width: none !important;');
  cssRules.push('  min-width: 0 !important;');
  cssRules.push('  flex: none !important;');
  cssRules.push('  flex-basis: auto !important;');
  cssRules.push('}');
  cssRules.push('');

  // Per-row grid definitions
  for (const row of multiColRows) {
    const gridCols = row.columnCount <= 2 ? 2
      : row.columnCount <= 4 ? row.columnCount
      : row.columnCount <= 6 ? 3
      : 4; // For many columns, use 4-col grid

    cssRules.push(`.et_pb_row_${row.rowIndex} {`);
    cssRules.push(`  display: grid !important;`);
    cssRules.push(`  grid-template-columns: repeat(${gridCols}, 1fr) !important;`);
    cssRules.push(`  gap: 24px !important;`);
    cssRules.push(`  max-width: 1200px !important;`);
    cssRules.push(`  margin: 0 auto !important;`);
    cssRules.push('}');
  }

  // Responsive rules
  cssRules.push('');
  cssRules.push('@media (max-width: 980px) {');
  for (const row of multiColRows) {
    if (row.columnCount > 2) {
      cssRules.push(`  .et_pb_row_${row.rowIndex} { grid-template-columns: repeat(2, 1fr) !important; }`);
    }
  }
  cssRules.push('}');

  cssRules.push('@media (max-width: 768px) {');
  for (const row of multiColRows) {
    cssRules.push(`  .et_pb_row_${row.rowIndex} { grid-template-columns: 1fr !important; gap: 16px !important; }`);
  }
  cssRules.push('}');

  const styleBlock = `<!-- wp:html -->\n<style>\n${cssRules.join('\n')}\n</style>\n<!-- /wp:html -->`;

  return styleBlock;
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
