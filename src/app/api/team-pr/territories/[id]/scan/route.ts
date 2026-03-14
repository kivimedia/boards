import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { createAnthropicClient } from '@/lib/ai/providers';
import type { PRTerritory, PRClient } from '@/lib/types';

export const maxDuration = 120;

interface SuggestedOutlet {
  name: string;
  url: string;
  outlet_type: string;
  description: string;
  topics: string[];
  relevance_score: number;
  country: string | null;
  language: string | null;
  audience_size: number | null;
}

const RESEARCH_SYSTEM_PROMPT = `You are a PR research analyst specializing in media landscape discovery. Your task is to find real, active media outlets that would be relevant for PR outreach.

For each outlet you identify, provide:
- **name** - The clean, official outlet name
- **url** - Primary website URL (must be real and active)
- **outlet_type** - One of: newspaper, magazine, tv, radio, podcast, blog, trade_publication, wire_service, youtube, online_media, other
- **description** - 1-2 sentences about what it covers and its audience
- **audience_size** - Estimated monthly readers/viewers/listeners as a number, or null
- **topics** - Array of specific topic strings (e.g. "interior design", not "news")
- **relevance_score** - Integer 0-100 reflecting relevance to the client
- **country** - ISO 3166-1 alpha-2 code or null
- **language** - ISO 639-1 code or null

Scoring guidance:
- 80-100 = highly relevant to the client's industry and territory
- 50-79 = moderate fit
- Below 50 = weak fit

CRITICAL RULES:
- Only include REAL outlets that actually exist
- Verify URLs are plausible (real domains, not made up)
- Filter out company websites, social media profiles, government portals
- Filter out spam, parked domains, or inactive sites
- Focus on outlets that accept pitches, have editorial staff, and publish regularly
- Prioritize outlets in the specified territory/language
- Do NOT repeat outlets already in the existing seed list

Return a JSON array of objects. Return at least 10 and up to 25 suggestions.`;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const { supabase } = auth.ctx;

  // Load territory
  const { data: territory, error: tErr } = await supabase
    .from('pr_territories')
    .select('*')
    .eq('id', id)
    .single();

  if (tErr || !territory) {
    return errorResponse('Territory not found', 404);
  }

  const t = territory as PRTerritory;

  // Load client
  const { data: client, error: cErr } = await supabase
    .from('pr_clients')
    .select('*')
    .eq('id', t.client_id)
    .single();

  if (cErr || !client) {
    return errorResponse('Client not found', 404);
  }

  const c = client as PRClient;

  // Get Anthropic client
  const anthropic = await createAnthropicClient(supabase);
  if (!anthropic) {
    return errorResponse('Anthropic API key not configured', 500);
  }

  // Build the context message
  const existingOutlets = (t.seed_outlets || [])
    .map((s: { name: string; url: string }) => `- ${s.name} (${s.url})`)
    .join('\n');

  const keywords = (t.signal_keywords || []).join(', ');
  const pitchAngles = (c.pitch_angles || [])
    .map((a: { angle_name: string; description: string }) => `- ${a.angle_name}: ${a.description}`)
    .join('\n');
  const targetMarkets = (c.target_markets || []).join(', ');

  const userMessage = `Find media outlets for PR outreach with this context:

## Client
- Name: ${c.name}
- Company: ${c.company || 'N/A'}
- Industry: ${c.industry || 'N/A'}
- Target Markets: ${targetMarkets || 'N/A'}
${pitchAngles ? `\n## Pitch Angles\n${pitchAngles}` : ''}

## Territory
- Name: ${t.name}
- Country: ${t.country_code || 'Global'}
- Language: ${t.language}
- Signal Keywords: ${keywords || 'N/A'}
${t.pitch_norms ? `- Pitch Norms: ${t.pitch_norms}` : ''}

## Existing Seed Outlets (DO NOT repeat these)
${existingOutlets || '(none)'}

Search for relevant media outlets in ${t.country_code || 'this market'} that cover ${c.industry || 'this industry'}. Focus on ${t.language === 'en' ? 'English' : t.language}-language outlets. Include a mix of outlet types (newspapers, magazines, podcasts, blogs, online media, trade publications).

Return your findings as a JSON array.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: RESEARCH_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    // Extract text from response
    let responseText = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        responseText += block.text;
      }
    }

    // Parse JSON from response (handle markdown code blocks)
    let suggestions: SuggestedOutlet[] = [];
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      }
    } catch {
      return errorResponse('Failed to parse AI response');
    }

    // Deduplicate against existing seed outlets
    const existingUrls = new Set(
      (t.seed_outlets || []).map((s: { url: string }) => {
        try {
          return new URL(s.url).hostname.replace(/^www\./, '');
        } catch {
          return s.url;
        }
      })
    );

    suggestions = suggestions.filter((s) => {
      try {
        const hostname = new URL(s.url).hostname.replace(/^www\./, '');
        return !existingUrls.has(hostname);
      } catch {
        return true;
      }
    });

    // Sort by relevance
    suggestions.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));

    return NextResponse.json({
      ok: true,
      data: {
        suggestions,
        total: suggestions.length,
        territory_id: id,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Scan failed';
    return errorResponse(msg, 500);
  }
}
