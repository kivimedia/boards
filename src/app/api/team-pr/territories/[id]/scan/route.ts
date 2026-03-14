import { NextRequest } from 'next/server';
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

  // Parse optional filters from request body
  let outletTypes: string[] = [];
  try {
    const body = await request.json();
    outletTypes = body.outlet_types || [];
  } catch { /* no body is fine */ }

  // Set up SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        send('status', { step: 1, total: 5, message: 'Loading territory and client data...' });

        // Load territory
        const { data: territory, error: tErr } = await supabase
          .from('pr_territories')
          .select('*')
          .eq('id', id)
          .single();

        if (tErr || !territory) {
          send('error', { message: 'Territory not found' });
          controller.close();
          return;
        }

        const t = territory as PRTerritory;

        // Load client
        const { data: client, error: cErr } = await supabase
          .from('pr_clients')
          .select('*')
          .eq('id', t.client_id)
          .single();

        if (cErr || !client) {
          send('error', { message: 'Client not found' });
          controller.close();
          return;
        }

        const c = client as PRClient;

        send('status', {
          step: 2,
          total: 5,
          message: `Preparing research context for ${c.name} in ${t.name}...`,
          detail: outletTypes.length > 0
            ? `Focusing on: ${outletTypes.join(', ')}`
            : 'Searching all outlet types',
        });

        // Get Anthropic client
        const anthropic = await createAnthropicClient(supabase);
        if (!anthropic) {
          send('error', { message: 'Anthropic API key not configured' });
          controller.close();
          return;
        }

        // Build the context message
        const existingOutlets = (t.seed_outlets || [])
          .map((s: { name: string; url: string }) => `- ${s.name} (${s.url})`)
          .join('\n');

        const localKeywords = (t.market_data?.signal_keywords_local as string[] | undefined) || [];
        const keywords = (t.signal_keywords || []).join(', ');
        const keywordsLocal = localKeywords.join(', ');
        const pitchAngles = (c.pitch_angles || [])
          .map((a: { angle_name: string; description: string }) => `- ${a.angle_name}: ${a.description}`)
          .join('\n');
        const targetMarkets = (c.target_markets || []).join(', ');

        const existingCount = (t.seed_outlets || []).length;
        send('status', {
          step: 3,
          total: 5,
          message: `Asking AI to discover outlets (excluding ${existingCount} existing)...`,
          detail: `Keywords: ${keywords}${keywordsLocal ? ` + ${keywordsLocal}` : ''}`,
        });

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
- Signal Keywords (English): ${keywords || 'N/A'}
${keywordsLocal ? `- Signal Keywords (${t.language}): ${keywordsLocal}` : ''}
${t.pitch_norms ? `- Pitch Norms: ${t.pitch_norms}` : ''}

## Existing Seed Outlets (DO NOT repeat these)
${existingOutlets || '(none)'}

Search for relevant media outlets in ${t.country_code || 'this market'} that cover ${c.industry || 'this industry'}. Focus on ${t.language === 'en' ? 'English' : t.language}-language outlets.${outletTypes.length > 0 ? ` Focus ONLY on these outlet types: ${outletTypes.join(', ')}.` : ' Include a mix of outlet types (newspapers, magazines, podcasts, blogs, online media, trade publications).'}

Return your findings as a JSON array.`;

        // Stream the AI response
        let responseText = '';
        let tokenCount = 0;
        const aiStream = anthropic.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 8192,
          system: RESEARCH_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        });

        // Send periodic progress as tokens stream in
        let lastProgressAt = Date.now();
        for await (const event of aiStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            responseText += event.delta.text;
            tokenCount++;

            // Send progress every ~2 seconds
            const now = Date.now();
            if (now - lastProgressAt > 2000) {
              // Try to count how many outlets found so far
              const partialMatches = responseText.match(/"name"\s*:/g);
              const foundSoFar = partialMatches ? partialMatches.length : 0;
              send('status', {
                step: 3,
                total: 5,
                message: `AI is researching outlets...`,
                detail: foundSoFar > 0
                  ? `Found ${foundSoFar} outlet${foundSoFar > 1 ? 's' : ''} so far...`
                  : 'Analyzing media landscape...',
              });
              lastProgressAt = now;
            }
          }
        }

        send('status', {
          step: 4,
          total: 5,
          message: 'Parsing and validating results...',
        });

        // Parse JSON from response (handle markdown code blocks)
        let suggestions: SuggestedOutlet[] = [];
        try {
          const jsonMatch = responseText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            suggestions = JSON.parse(jsonMatch[0]);
          }
        } catch {
          send('error', { message: 'Failed to parse AI response' });
          controller.close();
          return;
        }

        send('status', {
          step: 5,
          total: 5,
          message: `Deduplicating against ${existingCount} existing outlets...`,
          detail: `${suggestions.length} raw suggestions found`,
        });

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

        // Send final results
        send('done', {
          suggestions,
          total: suggestions.length,
          territory_id: id,
        });
      } catch (err) {
        send('error', { message: err instanceof Error ? err.message : 'Scan failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
