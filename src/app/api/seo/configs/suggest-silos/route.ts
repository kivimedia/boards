import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { createAnthropicClient, touchApiKey } from '@/lib/ai/providers';
import { scrapeSiteContext } from '@/lib/seo/scrape-site-context';

interface SuggestBody {
  site_url: string;
  site_name: string;
  existing_silos?: string[];
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
