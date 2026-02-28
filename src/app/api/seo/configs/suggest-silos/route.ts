import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { createAnthropicClient, touchApiKey } from '@/lib/ai/providers';

interface SuggestBody {
  site_url: string;
  site_name: string;
  existing_silos?: string[];
}

/**
 * Fetch the homepage + a few key pages to understand the site's niche.
 * Returns a trimmed text snapshot for Claude to analyze.
 */
async function scrapeSiteContext(siteUrl: string): Promise<string> {
  const url = siteUrl.replace(/\/+$/, '');
  const pages = [url, `${url}/services`, `${url}/about`, `${url}/blog`];
  const snippets: string[] = [];

  for (const pageUrl of pages) {
    try {
      const res = await fetch(pageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOBot/1.0)' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const html = await res.text();

      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch?.[1]?.trim() || '';

      // Extract meta description
      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
      const desc = descMatch?.[1]?.trim() || '';

      // Extract headings
      const headings: string[] = [];
      const hRegex = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
      let hMatch;
      while ((hMatch = hRegex.exec(html)) !== null && headings.length < 20) {
        const text = hMatch[1].replace(/<[^>]+>/g, '').trim();
        if (text && text.length > 2) headings.push(text);
      }

      // Extract nav links text for service categories
      const navTexts: string[] = [];
      const navMatch = html.match(/<nav[\s\S]*?<\/nav>/gi);
      if (navMatch) {
        for (const nav of navMatch.slice(0, 2)) {
          const linkRegex = /<a[^>]*>([\s\S]*?)<\/a>/gi;
          let lm;
          while ((lm = linkRegex.exec(nav)) !== null && navTexts.length < 15) {
            const t = lm[1].replace(/<[^>]+>/g, '').trim();
            if (t && t.length > 1 && t.length < 50) navTexts.push(t);
          }
        }
      }

      const pageName = pageUrl === url ? 'HOMEPAGE' : pageUrl.split('/').pop()?.toUpperCase() || '';
      let snippet = `[${pageName}]`;
      if (title) snippet += `\nTitle: ${title}`;
      if (desc) snippet += `\nDescription: ${desc}`;
      if (headings.length > 0) snippet += `\nHeadings: ${headings.join(' | ')}`;
      if (navTexts.length > 0 && pageName === 'HOMEPAGE') snippet += `\nNav: ${navTexts.join(' | ')}`;
      snippets.push(snippet);
    } catch {
      // Skip failed pages
    }
  }

  return snippets.join('\n\n').slice(0, 4000);
}

/**
 * POST /api/seo/configs/suggest-silos
 * Scrapes the actual site to understand the business, then uses Claude
 * to suggest relevant content silos.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<SuggestBody>(request);
  if (!body.ok) return body.response;

  const { site_url, site_name, existing_silos } = body.body;
  if (!site_url?.trim() || !site_name?.trim()) {
    return errorResponse('site_url and site_name are required');
  }

  const { supabase } = auth.ctx;
  const anthropic = await createAnthropicClient(supabase);
  if (!anthropic) {
    return errorResponse('Anthropic API key not configured. Add it in Settings > AI Keys.', 400);
  }

  try {
    // Step 1: Scrape the site
    const siteContext = await scrapeSiteContext(site_url.trim());

    // Step 2: Build prompt with real context
    let prompt = `You are an expert SEO content strategist. Analyze this website and suggest 8-12 content silos (topic clusters) for their blog/content strategy.

SITE: "${site_name}" - ${site_url}`;

    if (siteContext) {
      prompt += `

SITE CONTENT ANALYSIS (scraped from the actual site):
${siteContext}`;
    }

    if (existing_silos?.length) {
      prompt += `

ALREADY CHOSEN SILOS: ${existing_silos.join(', ')}
The user has already selected these silos and wants MORE suggestions that complement them. Do NOT repeat any of these. Instead, suggest silos that:
- Fill gaps in their content strategy
- Target adjacent keywords and audiences
- Create strong internal linking opportunities with the existing silos`;
    }

    prompt += `

REQUIREMENTS:
- Each silo must be directly relevant to what this specific business does
- Silos should target real search intent from their potential customers
- Include a mix of: service-focused silos, educational/guide silos, and location/audience silos
- Each silo should support 5-20 blog posts
- Keep silo names concise (2-4 words)

Return ONLY a JSON array of silo name strings, nothing else. Example:
["Stage Setup Guides", "Corporate Event Planning", "Orlando Venue Reviews"]`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    await touchApiKey(supabase, 'anthropic');

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return errorResponse('Failed to parse AI response', 500);
    }

    const silos: string[] = JSON.parse(jsonMatch[0]);
    return successResponse({ silos });
  } catch (err) {
    console.error('[seo] Silo suggestion failed:', err);
    return errorResponse(err instanceof Error ? err.message : 'AI call failed', 500);
  }
}
