/**
 * Web Researcher - Claude-powered lead research with web_search tool
 *
 * Builds research dossiers for qualified leads using:
 * 1. Scrapling for website content extraction (if VPS available)
 * 2. Claude Sonnet with web_search_20250305 for deep research
 *
 * Stores dossier in lead.enrichment_data.research_dossier
 */

import Anthropic from '@anthropic-ai/sdk';
import { SupabaseClient } from '@supabase/supabase-js';
import { getProviderKey, touchApiKey } from '../ai/providers';
import type { LILead, LIResearchDossier, OrchestratorCallbacks } from '../types';

const RESEARCH_MODEL = 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 4096;

// Approximate cost per 1K tokens (Sonnet)
const INPUT_COST_PER_1K = 0.003;
const OUTPUT_COST_PER_1K = 0.015;

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const RESEARCH_SYSTEM_PROMPT = `You are a research assistant specializing in analyzing entertainers' and magicians' online presence. Your job is to build a brief dossier on a lead for LinkedIn outreach purposes.

Given a person's name, company, website, and LinkedIn URL, research them and return a JSON object with this exact structure:

{
  "website_analysis": {
    "has_booking": boolean,
    "has_testimonials": boolean,
    "has_video": boolean,
    "has_packages": boolean,
    "performance_style": "description or null",
    "audience_type": "kids/corporate/family/mixed or null",
    "geographic_coverage": "city/state/regional/national or null"
  },
  "portfolio_highlights": ["2-3 notable things about their work"],
  "talking_points": ["2-3 personalization hooks for outreach - specific things to reference"],
  "competitive_position": "one sentence about how they position themselves",
  "pain_points": ["1-2 potential problems visible from their online presence"],
  "research_sources": ["URLs you found useful"]
}

Rules:
- Be factual - only include what you actually found, don't speculate
- Keep portfolio_highlights and talking_points specific and concrete
- For pain_points, focus on website/marketing issues (outdated site, no booking form, no testimonials, bad mobile, etc.)
- Return ONLY the JSON object, no markdown fences, no explanation`;

// ============================================================================
// MAIN EXPORTS
// ============================================================================

export async function researchLead(
  supabase: SupabaseClient,
  lead: LILead,
  callbacks?: OrchestratorCallbacks
): Promise<LIResearchDossier | null> {
  const apiKey = await getProviderKey(supabase, 'anthropic');
  if (!apiKey) {
    callbacks?.onProgress?.('Skipping research - no Anthropic API key configured');
    return null;
  }

  const client = new Anthropic({ apiKey });
  await touchApiKey(supabase, 'anthropic');

  callbacks?.onProgress?.(`Researching ${lead.full_name}...`);

  // Build context for Claude
  let websiteContent = '';
  if (lead.website) {
    websiteContent = await fetchWebsiteContent(lead.website);
  }

  const userPrompt = buildResearchPrompt(lead, websiteContent);

  try {
    const response = await client.messages.create({
      model: RESEARCH_MODEL,
      max_tokens: MAX_TOKENS,
      system: RESEARCH_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      tools: [{ type: 'web_search_20250305' as any, name: 'web_search' }],
    });

    // Calculate cost
    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;
    const costUsd = (inputTokens / 1000) * INPUT_COST_PER_1K + (outputTokens / 1000) * OUTPUT_COST_PER_1K;

    callbacks?.onCostEvent?.({
      service_name: 'anthropic',
      operation: 'web_research',
      cost_usd: costUsd,
    });

    // Log cost event
    await supabase.from('li_cost_events').insert({
      user_id: lead.user_id,
      lead_id: lead.id,
      service_name: 'anthropic',
      operation: 'web_research',
      credits_used: inputTokens + outputTokens,
      cost_usd: costUsd,
      success: true,
    });

    // Parse the response - extract text from content blocks
    const dossier = parseResearchResponse(response, costUsd);

    if (dossier) {
      // Store dossier in lead's enrichment_data
      const existingData = (lead.enrichment_data || {}) as Record<string, unknown>;
      await supabase
        .from('li_leads')
        .update({
          enrichment_data: { ...existingData, research_dossier: dossier },
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead.id);

      callbacks?.onProgress?.(`Research complete for ${lead.full_name} - ${dossier.talking_points.length} talking points found`);
    }

    return dossier;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';

    await supabase.from('li_cost_events').insert({
      user_id: lead.user_id,
      lead_id: lead.id,
      service_name: 'anthropic',
      operation: 'web_research',
      credits_used: 0,
      cost_usd: 0,
      success: false,
      error_message: msg,
    });

    callbacks?.onProgress?.(`Research failed for ${lead.full_name}: ${msg}`);
    return null;
  }
}

export async function researchLeadBatch(
  supabase: SupabaseClient,
  userId: string,
  payload: { lead_ids: string[]; deadline_ms?: number },
  callbacks?: OrchestratorCallbacks
): Promise<{ researched: number; failed: number; total_cost_usd: number }> {
  const startTime = Date.now();
  const deadline = payload.deadline_ms ? startTime + payload.deadline_ms : Infinity;
  let researched = 0;
  let failed = 0;
  let totalCost = 0;

  // Fetch leads
  const { data: leads } = await supabase
    .from('li_leads')
    .select('*')
    .in('id', payload.lead_ids)
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (!leads?.length) return { researched: 0, failed: 0, total_cost_usd: 0 };

  for (const lead of leads) {
    // Check deadline
    if (Date.now() > deadline - 30_000) {
      callbacks?.onProgress?.(`Deadline approaching - stopping after ${researched} leads`);
      break;
    }

    const costCallbacks: OrchestratorCallbacks = {
      ...callbacks,
      onCostEvent: (event) => {
        totalCost += event.cost_usd;
        callbacks?.onCostEvent?.(event);
      },
    };

    const dossier = await researchLead(supabase, lead, costCallbacks);
    if (dossier) {
      researched++;
    } else {
      failed++;
    }

    // Rate limit: 2 seconds between research calls to avoid API limits
    await new Promise(r => setTimeout(r, 2000));
  }

  return { researched, failed, total_cost_usd: totalCost };
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function buildResearchPrompt(lead: LILead, websiteContent: string): string {
  const parts: string[] = [
    `Research this person for LinkedIn outreach:`,
    `- Name: ${lead.full_name}`,
  ];

  if (lead.job_position) parts.push(`- Position: ${lead.job_position}`);
  if (lead.company_name) parts.push(`- Company: ${lead.company_name}`);
  if (lead.website) parts.push(`- Website: ${lead.website}`);
  if (lead.linkedin_url) parts.push(`- LinkedIn: ${lead.linkedin_url}`);
  if (lead.city && lead.state) parts.push(`- Location: ${lead.city}, ${lead.state}`);
  else if (lead.city) parts.push(`- Location: ${lead.city}`);

  if (websiteContent) {
    parts.push('');
    parts.push('Website content (first 3000 chars):');
    parts.push(websiteContent.slice(0, 3000));
  }

  parts.push('');
  parts.push('Use web search to find additional information about them - reviews, social media, events, etc.');
  parts.push('Return the JSON dossier as specified.');

  return parts.join('\n');
}

function parseResearchResponse(
  response: Anthropic.Message,
  costUsd: number
): LIResearchDossier | null {
  // Extract text from content blocks
  let text = '';
  for (const block of response.content) {
    if (block.type === 'text') {
      text += block.text;
    }
  }

  if (!text.trim()) return null;

  try {
    // Try to parse JSON directly
    let jsonStr = text.trim();

    // Strip markdown code fences if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const parsed = JSON.parse(jsonStr);

    return {
      website_analysis: {
        has_booking: !!parsed.website_analysis?.has_booking,
        has_testimonials: !!parsed.website_analysis?.has_testimonials,
        has_video: !!parsed.website_analysis?.has_video,
        has_packages: !!parsed.website_analysis?.has_packages,
        performance_style: parsed.website_analysis?.performance_style || null,
        audience_type: parsed.website_analysis?.audience_type || null,
        geographic_coverage: parsed.website_analysis?.geographic_coverage || null,
      },
      portfolio_highlights: Array.isArray(parsed.portfolio_highlights) ? parsed.portfolio_highlights : [],
      talking_points: Array.isArray(parsed.talking_points) ? parsed.talking_points : [],
      competitive_position: parsed.competitive_position || '',
      pain_points: Array.isArray(parsed.pain_points) ? parsed.pain_points : [],
      research_sources: Array.isArray(parsed.research_sources) ? parsed.research_sources : [],
      research_cost_usd: costUsd,
      researched_at: new Date().toISOString(),
    };
  } catch {
    // If JSON parsing fails, create a minimal dossier from the text
    return {
      website_analysis: {
        has_booking: false,
        has_testimonials: false,
        has_video: false,
        has_packages: false,
        performance_style: null,
        audience_type: null,
        geographic_coverage: null,
      },
      portfolio_highlights: [],
      talking_points: [text.slice(0, 200)],
      competitive_position: '',
      pain_points: [],
      research_sources: [],
      research_cost_usd: costUsd,
      researched_at: new Date().toISOString(),
    };
  }
}

async function fetchWebsiteContent(url: string): Promise<string> {
  try {
    // Try scrapling first if available
    const { isScraplingAvailable, scraplingFetch } = await import('../integrations/scrapling');
    const available = await isScraplingAvailable();

    if (available) {
      const result = await scraplingFetch(url);
      if (result?.text) return result.text;
    }
  } catch {
    // Scrapling not available - fall through
  }

  // Fallback: simple fetch with timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KMBoards/1.0)' },
    });
    clearTimeout(timeout);

    if (!res.ok) return '';

    const html = await res.text();
    // Strip HTML tags for a rough text extraction
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}
