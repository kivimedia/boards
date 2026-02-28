import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { createAnthropicClient, touchApiKey } from '@/lib/ai/providers';

interface SuggestBody {
  site_url: string;
  site_name: string;
  existing_silos?: string[];
}

/**
 * POST /api/seo/configs/suggest-silos
 * Use Claude to suggest content silos for an SEO site.
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
    const existingNote = existing_silos?.length
      ? `\n\nThe site already has these silos defined: ${existing_silos.join(', ')}. Suggest additional silos that complement these, do NOT repeat them.`
      : '';

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are an SEO content strategist. Suggest 6-10 content silos (topic clusters) for this website:

Site name: "${site_name}"
Site URL: ${site_url}${existingNote}

A content silo is a broad topic category that groups related blog posts. Good silos are:
- Specific enough to target a keyword cluster
- Broad enough to support 5-20 blog posts each
- Relevant to the business and its target audience
- Useful for internal linking structure

Return ONLY a JSON array of silo name strings, nothing else. Example:
["Stage Rentals", "Event Planning Tips", "Corporate Events", "Wedding Planning"]`,
        },
      ],
    });

    await touchApiKey(supabase, 'anthropic');

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse the JSON array from the response
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
