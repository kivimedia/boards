import { SupabaseClient } from '@supabase/supabase-js';
import { createAnthropicClient } from './providers';
import { calculateCost, logUsage } from './cost-tracker';
import type { StepCallbacks } from './scout-pipeline';
import type { PGACandidate, PGAConfidence } from '../types';

// ============================================================================
// RESEARCH DOSSIER — 7-step deep research per candidate
//
// Ported from the local podcast outreach agent's researcher.py
// Builds structured dossiers with personalization elements, tone profiles,
// story angles, and hooks — all validated with source evidence.
// ============================================================================

export interface PersonalizationElement {
  fact: string;
  source_url: string;
  source_type: string;
  screenshot_or_quote: string;
  date_found: string; // ISO date or "evergreen"
  confidence: 'high' | 'medium' | 'low';
  verification_status: 'verified' | 'unverified' | 'stale' | 'risky';
  validation_details?: {
    status: string;
    issues: Array<{ check: string; passed: boolean; detail: string }>;
    checks_passed: number;
    checks_total: number;
  };
}

export interface ToneProfile {
  communication_style: string;
  favorite_topics: string[];
  pet_peeves: string[];
  humor_level: 'dry' | 'playful' | 'minimal' | 'none';
  formality: 'casual' | 'professional' | 'mixed';
  preferred_platforms: string[];
}

export interface ResearchDossier {
  candidate_id: string;
  personalization_elements: PersonalizationElement[];
  tone_profile: ToneProfile;
  story_angle: string;
  potential_hooks: string[];
  red_flags: string[];
  sources_checked: number;
  sources_found: number;
  research_duration_ms: number;
  tokens_used: number;
  cost_usd: number;
}

// The 7-step research plan (from the local agent)
const RESEARCH_STEPS = [
  {
    id: 'linkedin_profile',
    label: 'LinkedIn Profile',
    query_template: (name: string) =>
      `site:linkedin.com/in "${name}" profile`,
    source_type: 'LinkedIn post',
  },
  {
    id: 'linkedin_posts',
    label: 'LinkedIn Posts & Activity',
    query_template: (name: string) =>
      `site:linkedin.com "${name}" post OR article`,
    source_type: 'LinkedIn post',
  },
  {
    id: 'personal_website',
    label: 'Personal Website / Portfolio',
    query_template: (name: string, domain?: string) =>
      domain ? `site:${domain} about OR portfolio` : `"${name}" portfolio OR website`,
    source_type: 'Personal website',
  },
  {
    id: 'twitter',
    label: 'X/Twitter Activity',
    query_template: (name: string, twitter?: string) =>
      twitter
        ? `site:x.com "${twitter.replace('@', '')}" OR site:twitter.com "${twitter.replace('@', '')}"`
        : `site:x.com "${name}" OR site:twitter.com "${name}"`,
    source_type: 'X/Twitter',
  },
  {
    id: 'podcast_video',
    label: 'Podcast & Video Appearances',
    query_template: (name: string) =>
      `"${name}" podcast OR interview OR youtube`,
    source_type: 'Podcast/Interview',
  },
  {
    id: 'product_hunt',
    label: 'Product Hunt / Indie Hackers',
    query_template: (name: string) =>
      `site:producthunt.com "${name}" OR site:indiehackers.com "${name}"`,
    source_type: 'Product Hunt',
  },
  {
    id: 'news_press',
    label: 'News & Press Mentions',
    query_template: (name: string) =>
      `"${name}" featured OR spotlight OR interview OR announcement`,
    source_type: 'News/Press',
  },
];

/**
 * Build a deep research dossier for a candidate.
 * Uses Claude with web_search to execute the 7-step research plan.
 */
export async function buildResearchDossier(
  supabase: SupabaseClient,
  candidate: PGACandidate,
  callbacks: StepCallbacks,
  options?: {
    runId?: string;
    userId?: string;
    maxSearchTurns?: number;
  }
): Promise<ResearchDossier> {
  const startTime = Date.now();
  let totalTokens = 0;
  let totalCost = 0;
  const modelId = 'claude-sonnet-4-5-20250929';

  const client = await createAnthropicClient(supabase);
  if (!client) {
    throw new Error('Anthropic API key not configured. Go to Settings > AI Keys to add one.');
  }

  const maxTurns = options?.maxSearchTurns ?? 10;

  // Extract useful context
  const linkedin = candidate.platform_presence?.linkedin || '';
  const twitter = candidate.platform_presence?.twitter || '';
  const website = candidate.platform_presence?.website || '';
  const domain = website ? new URL(website).hostname.replace('www.', '') : '';

  // Build the research queries for all 7 steps
  const researchQueries = RESEARCH_STEPS.map((step) => {
    let query = step.query_template(candidate.name, domain || twitter);
    return { ...step, query };
  });

  callbacks.onProgress(`Building research dossier for ${candidate.name}...`);
  callbacks.onProgress(`Research plan: ${researchQueries.length} sources to check`);

  // Build the comprehensive research prompt
  const researchPrompt = `You are a research analyst preparing a deep dossier on a potential podcast guest.

CANDIDATE:
- Name: ${candidate.name}
- One-liner: ${candidate.one_liner || 'N/A'}
- Email: ${candidate.email || 'Unknown'}
- Location: ${candidate.location || 'Unknown'}
- LinkedIn: ${linkedin || 'Unknown'}
- Twitter: ${twitter || 'Unknown'}
- Website: ${website || 'Unknown'}
- Tools used: ${(candidate.tools_used || []).join(', ') || 'Unknown'}
- Evidence of paid work: ${JSON.stringify(candidate.evidence_of_paid_work || [])}

RESEARCH PLAN (search the web for EACH of these):
${researchQueries.map((q, i) => `${i + 1}. ${q.label}: Search for "${q.query}"`).join('\n')}

For each source you find, capture:
1. The EXACT quote or evidence (copy from the page, don't paraphrase)
2. The source URL
3. The source type (${RESEARCH_STEPS.map((s) => s.source_type).join(', ')})
4. Date of the content (if visible)
5. Your confidence level (high/medium/low)

After completing all research, output a JSON object with this EXACT structure:
{
  "personalization_elements": [
    {
      "fact": "What you found (use in outreach)",
      "source_url": "https://...",
      "source_type": "LinkedIn post|X/Twitter|Personal website|Podcast/Interview|Product Hunt|News/Press",
      "screenshot_or_quote": "Exact quote from source",
      "date_found": "2025-01-15 or evergreen",
      "confidence": "high|medium|low"
    }
  ],
  "tone_profile": {
    "communication_style": "e.g. conversational, technical, storytelling",
    "favorite_topics": ["topic1", "topic2"],
    "pet_peeves": ["thing they seem to dislike"],
    "humor_level": "dry|playful|minimal|none",
    "formality": "casual|professional|mixed",
    "preferred_platforms": ["LinkedIn", "Twitter"]
  },
  "story_angle": "The best angle for approaching this person for a podcast interview (1-2 sentences)",
  "potential_hooks": [
    "Hook 1 - something specific to open with",
    "Hook 2 - another angle"
  ],
  "red_flags": [
    "Things to avoid mentioning"
  ]
}

RULES:
- Search ALL 7 sources, even if some return nothing
- Only include facts with REAL source URLs from actual search results
- Never fabricate quotes or URLs
- Mark confidence "low" if you couldn't verify on the actual page
- Aim for 5-8 personalization elements minimum
- The tone_profile should be inferred from their actual writing style
- Hooks should be specific enough that the person would recognize you researched them`;

  const callWithRetry = async (createFn: () => Promise<any>, label: string): Promise<any> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await createFn();
      } catch (err: any) {
        if (err?.status === 429 && attempt < 2) {
          const waitSec = (attempt + 1) * 65;
          callbacks.onProgress(`Rate limited on ${label} - waiting ${waitSec}s...`);
          await new Promise((r) => setTimeout(r, waitSec * 1000));
        } else {
          throw err;
        }
      }
    }
  };

  // Multi-turn web research
  let messages: any[] = [{ role: 'user', content: researchPrompt }];
  let researchOutput = '';
  let searchCount = 0;

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await callWithRetry(
      () =>
        client.messages.create({
          model: modelId,
          max_tokens: 8192,
          system:
            'You are a thorough research analyst. Search the web extensively for real information. ' +
            'Always capture exact quotes and URLs. Return structured JSON when done.',
          messages,
          tools: [{ type: 'web_search_20250305' as any, name: 'web_search' }],
        }),
      `dossier research turn ${turn + 1}`
    );

    totalTokens += (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
    totalCost += calculateCost(
      'anthropic',
      modelId,
      response.usage?.input_tokens || 0,
      response.usage?.output_tokens || 0
    );

    let hasToolUse = false;
    const content: any[] = [];

    for (const block of response.content) {
      content.push(block);
      if (block.type === 'text') {
        researchOutput += block.text;
        callbacks.onToken(block.text);
      } else if (block.type === 'server_tool_use' && block.name === 'web_search') {
        hasToolUse = true;
        searchCount++;
        const q = (block.input as any)?.query || 'unknown';
        callbacks.onProgress(`Web search ${searchCount}: "${q}"`);
      } else if (block.type === 'web_search_tool_result') {
        hasToolUse = true;
      }
    }

    messages.push({ role: 'assistant', content });

    if (response.stop_reason === 'end_turn' || !hasToolUse) {
      callbacks.onProgress(
        `Research complete: ${searchCount} web searches for ${candidate.name}`
      );
      break;
    }
  }

  // Parse the dossier JSON from Claude's output
  callbacks.onProgress('Structuring research dossier...');
  const dossier = parseDossierOutput(researchOutput, candidate.id);

  // Log cost
  if (options?.runId) {
    await supabase.from('pga_scout_costs').insert({
      run_id: options.runId,
      service: 'anthropic',
      operation: 'dossier_research',
      credits_used: totalTokens,
      cost_usd: totalCost,
      candidate_name: candidate.name,
      candidate_id: candidate.id,
    });
  }

  if (options?.userId) {
    await logUsage(supabase, {
      userId: options.userId,
      activity: 'agent_execution',
      provider: 'anthropic',
      modelId,
      inputTokens: totalTokens,
      outputTokens: 0,
      latencyMs: Date.now() - startTime,
      status: 'success',
      metadata: {
        agent_type: 'dossier-research',
        candidate_name: candidate.name,
        candidate_id: candidate.id,
        search_count: searchCount,
        run_id: options.runId,
      },
    });
  }

  return {
    ...dossier,
    sources_checked: RESEARCH_STEPS.length,
    sources_found: searchCount,
    research_duration_ms: Date.now() - startTime,
    tokens_used: totalTokens,
    cost_usd: totalCost,
  };
}

/**
 * Save a research dossier to the database.
 */
export async function saveDossier(
  supabase: SupabaseClient,
  dossier: ResearchDossier,
  runId?: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('pga_research_dossiers')
    .upsert(
      {
        candidate_id: dossier.candidate_id,
        run_id: runId || null,
        personalization_elements: dossier.personalization_elements,
        tone_profile: dossier.tone_profile,
        story_angle: dossier.story_angle,
        potential_hooks: dossier.potential_hooks,
        red_flags: dossier.red_flags,
        sources_checked: dossier.sources_checked,
        sources_found: dossier.sources_found,
        research_duration_ms: dossier.research_duration_ms,
        tokens_used: dossier.tokens_used,
        cost_usd: dossier.cost_usd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'candidate_id' }
    )
    .select('id')
    .single();

  if (error) {
    console.error('Failed to save dossier:', error);
    return null;
  }

  return data?.id || null;
}

/**
 * Load an existing dossier for a candidate.
 */
export async function loadDossier(
  supabase: SupabaseClient,
  candidateId: string
): Promise<ResearchDossier | null> {
  const { data, error } = await supabase
    .from('pga_research_dossiers')
    .select('*')
    .eq('candidate_id', candidateId)
    .single();

  if (error || !data) return null;

  return {
    candidate_id: data.candidate_id,
    personalization_elements: data.personalization_elements || [],
    tone_profile: data.tone_profile || {} as ToneProfile,
    story_angle: data.story_angle || '',
    potential_hooks: data.potential_hooks || [],
    red_flags: data.red_flags || [],
    sources_checked: data.sources_checked || 0,
    sources_found: data.sources_found || 0,
    research_duration_ms: data.research_duration_ms || 0,
    tokens_used: data.tokens_used || 0,
    cost_usd: Number(data.cost_usd) || 0,
  };
}

// ============================================================================
// Parsing helpers
// ============================================================================

function parseDossierOutput(
  text: string,
  candidateId: string
): Omit<ResearchDossier, 'sources_checked' | 'sources_found' | 'research_duration_ms' | 'tokens_used' | 'cost_usd'> {
  const defaults: Omit<ResearchDossier, 'sources_checked' | 'sources_found' | 'research_duration_ms' | 'tokens_used' | 'cost_usd'> = {
    candidate_id: candidateId,
    personalization_elements: [],
    tone_profile: {
      communication_style: 'unknown',
      favorite_topics: [],
      pet_peeves: [],
      humor_level: 'none',
      formality: 'professional',
      preferred_platforms: [],
    },
    story_angle: '',
    potential_hooks: [],
    red_flags: [],
  };

  // Find JSON in text
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1] : text;
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);

  if (!objMatch) return defaults;

  try {
    const obj = JSON.parse(objMatch[0]);

    return {
      candidate_id: candidateId,
      personalization_elements: (obj.personalization_elements || []).map((e: any) => ({
        fact: e.fact || '',
        source_url: e.source_url || '',
        source_type: e.source_type || 'Unknown',
        screenshot_or_quote: e.screenshot_or_quote || e.quote || '',
        date_found: e.date_found || 'evergreen',
        confidence: validateConfidence(e.confidence),
        verification_status: 'unverified' as const,
      })),
      tone_profile: {
        communication_style: obj.tone_profile?.communication_style || 'unknown',
        favorite_topics: obj.tone_profile?.favorite_topics || [],
        pet_peeves: obj.tone_profile?.pet_peeves || [],
        humor_level: validateHumorLevel(obj.tone_profile?.humor_level),
        formality: validateFormality(obj.tone_profile?.formality),
        preferred_platforms: obj.tone_profile?.preferred_platforms || [],
      },
      story_angle: obj.story_angle || '',
      potential_hooks: obj.potential_hooks || [],
      red_flags: obj.red_flags || [],
    };
  } catch {
    return defaults;
  }
}

function validateConfidence(val: string): 'high' | 'medium' | 'low' {
  if (val === 'high' || val === 'medium' || val === 'low') return val;
  return 'medium';
}

function validateHumorLevel(val: string): ToneProfile['humor_level'] {
  if (val === 'dry' || val === 'playful' || val === 'minimal' || val === 'none') return val;
  return 'none';
}

function validateFormality(val: string): ToneProfile['formality'] {
  if (val === 'casual' || val === 'professional' || val === 'mixed') return val;
  return 'professional';
}
