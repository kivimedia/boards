import { SupabaseClient } from '@supabase/supabase-js';
import {
  createWpClient,
  wpUpdateYoast,
  type WpYoastMeta,
} from '../../integrations/wordpress-client';
import { callPageForgeAgent } from '../pageforge-pipeline';
import { getSystemPrompt } from '../prompt-templates';
import type { PageForgeSiteProfile, PageForgeBuild } from '../../types';

// ============================================================================
// SEO AGENT
// Configures Yoast meta, generates alt tags, validates heading hierarchy.
// ============================================================================

export interface SeoConfigResult {
  metaTitle: string;
  metaDesc: string;
  focusKeyphrase: string;
  ogTitle: string;
  ogDesc: string;
  altTags: Array<{ imageId: number; altText: string }>;
  headingIssues: string[];
  seoScore: number;
}

export interface SeoReport {
  configured: boolean;
  metaTitle: string;
  metaDesc: string;
  focusKeyphrase: string;
  headingHierarchy: { valid: boolean; issues: string[] };
  altTagsCoverage: { total: number; withAlt: number };
  checks: SeoCheckItem[];
}

export interface SeoCheckItem {
  name: string;
  passed: boolean;
  details: string;
}

// ============================================================================
// GENERATE META TAGS
// ============================================================================

export async function generateMetaTags(
  supabase: SupabaseClient,
  buildId: string,
  pageTitle: string,
  pageContent: string
): Promise<{ metaTitle: string; metaDesc: string; focusKeyphrase: string; ogTitle: string; ogDesc: string }> {
  const systemPrompt = getSystemPrompt('pageforge_seo');

  const contentPreview = pageContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 2000);

  const userMessage = `Generate SEO meta tags for this WordPress page.

Page Title: ${pageTitle}
Content Preview: ${contentPreview}

Generate:
1. Meta Title (max 60 chars, include primary keyword)
2. Meta Description (max 155 chars, include CTA and keyword)
3. Focus Keyphrase (2-4 words)
4. Open Graph Title (can be slightly different from meta title)
5. Open Graph Description (max 200 chars, social-friendly)

Respond with JSON:
{
  "metaTitle": "...",
  "metaDesc": "...",
  "focusKeyphrase": "...",
  "ogTitle": "...",
  "ogDesc": "..."
}`;

  const result = await callPageForgeAgent(
    supabase, buildId, 'pageforge_seo_meta', 'seo_config',
    systemPrompt, userMessage, { activity: 'pageforge_seo' }
  );

  try {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Fall through
  }

  return {
    metaTitle: pageTitle.slice(0, 60),
    metaDesc: `Learn more about ${pageTitle}`.slice(0, 155),
    focusKeyphrase: pageTitle.split(' ').slice(0, 3).join(' '),
    ogTitle: pageTitle.slice(0, 60),
    ogDesc: `Learn more about ${pageTitle}`.slice(0, 200),
  };
}

// ============================================================================
// GENERATE ALT TAGS
// ============================================================================

export async function generateAltTags(
  supabase: SupabaseClient,
  buildId: string,
  pageTitle: string,
  imageDescriptions: Array<{ id: number; filename: string; context?: string }>
): Promise<Array<{ imageId: number; altText: string }>> {
  if (imageDescriptions.length === 0) return [];

  const systemPrompt = getSystemPrompt('pageforge_seo');

  const userMessage = `Generate descriptive, SEO-friendly alt text for these images on a page titled "${pageTitle}".

Images:
${imageDescriptions.map((img, i) => `${i + 1}. ID: ${img.id}, File: ${img.filename}${img.context ? `, Context: ${img.context}` : ''}`).join('\n')}

Requirements:
- Descriptive and specific (avoid "image of")
- Include relevant keywords naturally
- Keep under 125 characters
- Provide context about the image's role on the page

Respond with JSON array:
[{"imageId": number, "altText": "descriptive alt text"}]`;

  const result = await callPageForgeAgent(
    supabase, buildId, 'pageforge_seo_alt', 'seo_config',
    systemPrompt, userMessage, { activity: 'pageforge_seo' }
  );

  try {
    const jsonMatch = result.text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Fall through
  }

  return imageDescriptions.map(img => ({
    imageId: img.id,
    altText: `${pageTitle} - ${img.filename.replace(/[-_]/g, ' ').replace(/\.\w+$/, '')}`,
  }));
}

// ============================================================================
// VALIDATE HEADING HIERARCHY
// ============================================================================

export function validateHeadingHierarchy(html: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const headings: Array<{ level: number; text: string }> = [];
  let match;

  while ((match = headingRegex.exec(html)) !== null) {
    const text = match[2].replace(/<[^>]+>/g, '').trim();
    headings.push({ level: parseInt(match[1]), text: text.slice(0, 50) });
  }

  if (headings.length === 0) {
    issues.push('No headings found on page');
    return { valid: false, issues };
  }

  // Check for exactly one H1
  const h1Count = headings.filter(h => h.level === 1).length;
  if (h1Count === 0) {
    issues.push('Missing H1 heading');
  } else if (h1Count > 1) {
    issues.push(`Multiple H1 headings found (${h1Count})`);
  }

  // Check for proper nesting (no skipping levels)
  let lastLevel = 0;
  for (const h of headings) {
    if (h.level > lastLevel + 1 && lastLevel > 0) {
      issues.push(`Heading level skip: H${lastLevel} -> H${h.level} ("${h.text}")`);
    }
    lastLevel = h.level;
  }

  return { valid: issues.length === 0, issues };
}

// ============================================================================
// CONFIGURE YOAST SEO
// ============================================================================

export async function configureYoast(
  siteProfile: PageForgeSiteProfile,
  pageId: number,
  meta: WpYoastMeta
): Promise<{ success: boolean; error?: string }> {
  if (!siteProfile.yoast_enabled) {
    return { success: true }; // Skip if Yoast not enabled
  }

  if (!siteProfile.wp_username || !siteProfile.wp_app_password) {
    return { success: false, error: 'WordPress credentials not configured' };
  }

  try {
    const client = createWpClient({
      restUrl: siteProfile.wp_rest_url,
      username: siteProfile.wp_username,
      appPassword: siteProfile.wp_app_password,
    });

    await wpUpdateYoast(client, pageId, meta);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================================
// COMPILE SEO REPORT
// ============================================================================

export async function compileSeoReport(
  supabase: SupabaseClient,
  buildId: string,
  siteProfile: PageForgeSiteProfile,
  build: PageForgeBuild,
  pageContent: string
): Promise<SeoReport> {
  // Generate meta tags
  const meta = await generateMetaTags(supabase, buildId, build.page_title, pageContent);

  // Validate heading hierarchy
  const headingHierarchy = validateHeadingHierarchy(pageContent);

  // Count images with/without alt text
  const imgRegex = /<img[^>]*>/gi;
  const images = pageContent.match(imgRegex) || [];
  const withAlt = images.filter(img => /alt=["'][^"']+["']/i.test(img)).length;

  // Configure Yoast if enabled and page exists
  let configured = false;
  if (build.wp_page_id && siteProfile.yoast_enabled) {
    const yoastResult = await configureYoast(siteProfile, build.wp_page_id, {
      metaTitle: meta.metaTitle,
      metaDesc: meta.metaDesc,
      focusKeyphrase: meta.focusKeyphrase,
      ogTitle: meta.ogTitle,
      ogDesc: meta.ogDesc,
    });
    configured = yoastResult.success;
  }

  const checks: SeoCheckItem[] = [
    {
      name: 'Meta Title',
      passed: meta.metaTitle.length > 0 && meta.metaTitle.length <= 60,
      details: `"${meta.metaTitle}" (${meta.metaTitle.length} chars)`,
    },
    {
      name: 'Meta Description',
      passed: meta.metaDesc.length > 0 && meta.metaDesc.length <= 155,
      details: `"${meta.metaDesc}" (${meta.metaDesc.length} chars)`,
    },
    {
      name: 'Focus Keyphrase',
      passed: meta.focusKeyphrase.length > 0,
      details: `"${meta.focusKeyphrase}"`,
    },
    {
      name: 'Heading Hierarchy',
      passed: headingHierarchy.valid,
      details: headingHierarchy.valid ? 'Valid H1 > H2 > H3 structure' : headingHierarchy.issues.join('; '),
    },
    {
      name: 'Image Alt Text',
      passed: images.length === 0 || withAlt === images.length,
      details: `${withAlt}/${images.length} images have alt text`,
    },
    {
      name: 'Open Graph Tags',
      passed: meta.ogTitle.length > 0 && meta.ogDesc.length > 0,
      details: configured ? 'Configured via Yoast' : 'Generated (Yoast not configured)',
    },
  ];

  return {
    configured,
    metaTitle: meta.metaTitle,
    metaDesc: meta.metaDesc,
    focusKeyphrase: meta.focusKeyphrase,
    headingHierarchy,
    altTagsCoverage: { total: images.length, withAlt },
    checks,
  };
}
