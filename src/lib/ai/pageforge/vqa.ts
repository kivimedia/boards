import { SupabaseClient } from '@supabase/supabase-js';
import {
  createFigmaClient,
  figmaGetImages,
  figmaDownloadImage,
} from '../../integrations/figma-client';
import { callPageForgeAgent } from '../pageforge-pipeline';
import { getSystemPrompt } from '../prompt-templates';
import type { PageForgeSiteProfile, PageForgeBuild } from '../../types';

// ============================================================================
// VQA AGENT (Visual Quality Assurance)
// Captures screenshots, compares Figma vs WordPress, suggests fixes.
// ============================================================================

export interface ScreenshotSet {
  desktop: string | null; // base64
  tablet: string | null;
  mobile: string | null;
}

export interface VqaDiffResult {
  breakpoint: string;
  score: number; // 0-100
  differences: VqaDifference[];
}

export interface VqaDifference {
  area: string;
  severity: 'critical' | 'major' | 'minor';
  description: string;
  suggestedFix?: string;
}

export interface VqaComparisonResult {
  desktop: VqaDiffResult;
  tablet: VqaDiffResult;
  mobile: VqaDiffResult;
  overallScore: number;
  passed: boolean;
  fixSuggestions: string[];
}

const BREAKPOINTS = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
};

// ============================================================================
// CAPTURE SCREENSHOTS (WordPress page)
// ============================================================================

export async function captureScreenshots(
  pageUrl: string,
  browserlessUrl?: string
): Promise<ScreenshotSet> {
  const screenshots: ScreenshotSet = { desktop: null, tablet: null, mobile: null };

  const apiUrl = browserlessUrl || process.env.BROWSERLESS_URL || 'https://chrome.browserless.io';
  const apiKey = process.env.BROWSERLESS_API_KEY || '';

  for (const [breakpoint, width] of Object.entries(BREAKPOINTS)) {
    try {
      const res = await fetch(`${apiUrl}/screenshot?token=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: pageUrl,
          options: {
            fullPage: true,
            type: 'png',
          },
          viewport: { width, height: 900 },
          waitFor: 3000,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (res.ok) {
        const buffer = await res.arrayBuffer();
        screenshots[breakpoint as keyof ScreenshotSet] = Buffer.from(buffer).toString('base64');
      }
    } catch (err) {
      console.error(`[vqa] Screenshot failed for ${breakpoint}:`, err);
    }
  }

  return screenshots;
}

// ============================================================================
// EXPORT FIGMA SCREENSHOTS
// ============================================================================

export async function exportFigmaScreenshots(
  siteProfile: PageForgeSiteProfile,
  figmaFileKey: string,
  nodeIds: string[]
): Promise<ScreenshotSet> {
  if (!siteProfile.figma_personal_token || nodeIds.length === 0) {
    return { desktop: null, tablet: null, mobile: null };
  }

  const client = createFigmaClient(siteProfile.figma_personal_token);

  // Export full-size renders from Figma
  const imageResponse = await figmaGetImages(client, figmaFileKey, nodeIds, {
    format: 'png',
    scale: 1,
  });

  // Use the first available image as the desktop reference
  const firstUrl = Object.values(imageResponse.images).find(Boolean);
  if (!firstUrl) {
    return { desktop: null, tablet: null, mobile: null };
  }

  const buffer = await figmaDownloadImage(firstUrl);
  const base64 = buffer.toString('base64');

  // Figma doesn't have breakpoints natively - use the same image for all
  // In production, you'd render at different frame widths
  return {
    desktop: base64,
    tablet: base64,
    mobile: base64,
  };
}

// ============================================================================
// VQA COMPARISON (AI Vision)
// ============================================================================

export async function runVqaComparison(
  supabase: SupabaseClient,
  buildId: string,
  figmaScreenshots: ScreenshotSet,
  wpScreenshots: ScreenshotSet,
  threshold: number
): Promise<VqaComparisonResult> {
  const systemPrompt = getSystemPrompt('pageforge_vqa');
  const results: Record<string, VqaDiffResult> = {};

  for (const breakpoint of ['desktop', 'tablet', 'mobile'] as const) {
    const figmaImg = figmaScreenshots[breakpoint];
    const wpImg = wpScreenshots[breakpoint];

    if (!figmaImg || !wpImg) {
      results[breakpoint] = {
        breakpoint,
        score: 0,
        differences: [{ area: 'full', severity: 'critical', description: 'Screenshot not available' }],
      };
      continue;
    }

    const userMessage = `Compare these two images of a web page at ${breakpoint} (${BREAKPOINTS[breakpoint]}px) breakpoint.

Image 1: Original Figma design (reference)
Image 2: Built WordPress page (actual)

Analyze pixel-level differences in:
1. Layout and spacing
2. Typography (font, size, weight, color)
3. Colors and backgrounds
4. Images and icons
5. Responsive behavior
6. Alignment and positioning

Score the match from 0-100 (100 = pixel-perfect).

Respond with JSON:
{
  "score": number,
  "differences": [
    {
      "area": "section/element name",
      "severity": "critical|major|minor",
      "description": "what's different",
      "suggestedFix": "CSS/markup fix suggestion"
    }
  ]
}`;

    try {
      const result = await callPageForgeAgent(
        supabase, buildId, 'pageforge_vqa', 'vqa_comparison',
        systemPrompt, userMessage,
        {
          activity: 'pageforge_vqa',
          images: [
            { data: figmaImg, mimeType: 'image/png' },
            { data: wpImg, mimeType: 'image/png' },
          ],
        }
      );

      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        results[breakpoint] = {
          breakpoint,
          score: parsed.score || 0,
          differences: parsed.differences || [],
        };
      } else {
        results[breakpoint] = { breakpoint, score: 50, differences: [] };
      }
    } catch (err) {
      results[breakpoint] = {
        breakpoint,
        score: 0,
        differences: [{
          area: 'comparison',
          severity: 'critical',
          description: `VQA comparison failed: ${err instanceof Error ? err.message : String(err)}`,
        }],
      };
    }
  }

  const desktopScore = results.desktop?.score || 0;
  const tabletScore = results.tablet?.score || 0;
  const mobileScore = results.mobile?.score || 0;
  const overallScore = Math.round((desktopScore * 0.5 + tabletScore * 0.25 + mobileScore * 0.25));
  const passed = overallScore >= threshold;

  // Collect fix suggestions
  const fixSuggestions: string[] = [];
  for (const r of Object.values(results)) {
    for (const d of r.differences) {
      if (d.suggestedFix) fixSuggestions.push(d.suggestedFix);
    }
  }

  return {
    desktop: results.desktop!,
    tablet: results.tablet!,
    mobile: results.mobile!,
    overallScore,
    passed,
    fixSuggestions,
  };
}

// ============================================================================
// VQA FIX LOOP
// ============================================================================

export async function suggestVqaFixes(
  supabase: SupabaseClient,
  buildId: string,
  comparison: VqaComparisonResult,
  currentMarkup: string
): Promise<{ fixedMarkup: string; changesApplied: string[] }> {
  const systemPrompt = getSystemPrompt('pageforge_vqa');

  const allDifferences = [
    ...comparison.desktop.differences.map(d => ({ ...d, breakpoint: 'desktop' })),
    ...comparison.tablet.differences.map(d => ({ ...d, breakpoint: 'tablet' })),
    ...comparison.mobile.differences.map(d => ({ ...d, breakpoint: 'mobile' })),
  ];

  const criticalAndMajor = allDifferences.filter(d => d.severity !== 'minor');

  if (criticalAndMajor.length === 0) {
    return { fixedMarkup: currentMarkup, changesApplied: [] };
  }

  const userMessage = `Apply CSS/markup fixes to address these visual differences.

Current markup:
\`\`\`html
${currentMarkup.slice(0, 8000)}
\`\`\`

Differences to fix:
${criticalAndMajor.map((d, i) => `${i + 1}. [${d.breakpoint}] ${d.area}: ${d.description}${d.suggestedFix ? ` (Suggested: ${d.suggestedFix})` : ''}`).join('\n')}

Respond with JSON:
{
  "fixedMarkup": "the corrected markup with fixes applied",
  "changesApplied": ["description of each change made"]
}`;

  const result = await callPageForgeAgent(
    supabase, buildId, 'pageforge_vqa_fix', 'vqa_fix_loop',
    systemPrompt, userMessage, { activity: 'pageforge_vqa' }
  );

  try {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        fixedMarkup: parsed.fixedMarkup || currentMarkup,
        changesApplied: parsed.changesApplied || [],
      };
    }
  } catch {
    // Fall through
  }

  return { fixedMarkup: currentMarkup, changesApplied: [] };
}

/**
 * Upload VQA screenshots to Supabase Storage for the build report.
 */
export async function uploadVqaScreenshots(
  supabase: SupabaseClient,
  buildId: string,
  screenshots: ScreenshotSet,
  prefix: 'figma' | 'wp'
): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};

  for (const [breakpoint, base64] of Object.entries(screenshots)) {
    if (!base64) continue;

    const buffer = Buffer.from(base64, 'base64');
    const path = `builds/${buildId}/vqa/${prefix}-${breakpoint}.png`;

    const { error } = await supabase.storage
      .from('pageforge-artifacts')
      .upload(path, buffer, { contentType: 'image/png', upsert: true });

    if (!error) {
      const { data: urlData } = supabase.storage
        .from('pageforge-artifacts')
        .getPublicUrl(path);
      urls[breakpoint] = urlData.publicUrl;
    }
  }

  return urls;
}
