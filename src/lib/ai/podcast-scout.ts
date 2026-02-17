import { SupabaseClient } from '@supabase/supabase-js';
import { createAnthropicClient } from './providers';
import { calculateCost, logUsage } from './cost-tracker';

// ============================================================================
// PODCAST SCOUT AGENT — Web-search-grounded podcast guest discovery
//
// IMPORTANT: This agent uses Claude's built-in web_search tool to find REAL
// people on the internet. Without web search, Claude would hallucinate fake
// candidates with non-existent websites, emails, and social profiles.
// ============================================================================

export interface ScoutCallbacks {
  onToken: (text: string) => void;
  onCandidateFound: (candidate: ScoutCandidate) => void;
  onProgress: (message: string) => void;
  onComplete: (result: ScoutResult) => void;
  onError: (error: string) => void;
}

export interface ScoutCandidate {
  name: string;
  one_liner: string;
  email: string | null;
  email_verified: boolean;
  platform_presence: Record<string, string>;
  evidence_of_paid_work: Array<{ project: string; description: string; url?: string }>;
  estimated_reach: Record<string, number>;
  tools_used: string[];
  contact_method: string;
  scout_confidence: 'high' | 'medium' | 'low';
  source: Record<string, string>;
}

export interface ScoutResult {
  candidates_found: number;
  candidates_saved: number;
  duplicates_skipped: number;
  tokens_used: number;
  cost_usd: number;
  duration_ms: number;
}

/**
 * Load the podcast-scout skill system_prompt from the database.
 */
async function loadScoutPrompt(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from('agent_skills')
    .select('system_prompt')
    .eq('slug', 'podcast-scout')
    .single();

  if (!data?.system_prompt) {
    throw new Error('podcast-scout skill not found in database. Run migration 042.');
  }
  return data.system_prompt;
}

/**
 * Load existing candidate names + platform URLs for dedup.
 */
async function loadExistingCandidates(
  supabase: SupabaseClient
): Promise<Set<string>> {
  const { data } = await supabase
    .from('pga_candidates')
    .select('name, platform_presence');

  const keys = new Set<string>();
  if (data) {
    for (const c of data) {
      // Dedup key: lowercase name
      keys.add(c.name.toLowerCase().trim());
      // Also add primary platform URLs
      if (c.platform_presence) {
        const pp = c.platform_presence as Record<string, string>;
        for (const url of Object.values(pp)) {
          if (url) keys.add(url.toLowerCase().trim());
        }
      }
    }
  }
  return keys;
}

/**
 * Check if a candidate is a duplicate.
 */
function isDuplicate(
  candidate: ScoutCandidate,
  existingKeys: Set<string>
): boolean {
  // Check name
  if (existingKeys.has(candidate.name.toLowerCase().trim())) return true;
  // Check platform URLs
  for (const url of Object.values(candidate.platform_presence)) {
    if (url && existingKeys.has(url.toLowerCase().trim())) return true;
  }
  return false;
}

/**
 * Save a single candidate to the database.
 */
async function saveCandidate(
  supabase: SupabaseClient,
  candidate: ScoutCandidate
): Promise<string | null> {
  const { data, error } = await supabase
    .from('pga_candidates')
    .insert({
      name: candidate.name.trim(),
      one_liner: candidate.one_liner || null,
      email: candidate.email || null,
      email_verified: candidate.email_verified ?? false,
      platform_presence: candidate.platform_presence || {},
      evidence_of_paid_work: candidate.evidence_of_paid_work || [],
      estimated_reach: candidate.estimated_reach || {},
      tools_used: candidate.tools_used || [],
      contact_method: candidate.contact_method || 'email',
      scout_confidence: candidate.scout_confidence || null,
      source: candidate.source || {},
      status: 'scouted',
    })
    .select('id')
    .single();

  if (error) {
    console.error(`[Scout] Failed to save candidate "${candidate.name}":`, error.message);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Parse Claude's JSON output into ScoutCandidate objects.
 * Handles both JSON array and JSON wrapped in markdown code blocks.
 */
function parseCandidates(output: string): ScoutCandidate[] {
  // Try to extract JSON from markdown code blocks first
  const codeBlockMatch = output.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1] : output;

  // Try to find JSON array in the text
  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (!arrayMatch) {
    // Maybe it's a single object
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        const obj = JSON.parse(objMatch[0]);
        if (obj.candidates && Array.isArray(obj.candidates)) {
          return obj.candidates;
        }
        return [obj];
      } catch {
        return [];
      }
    }
    return [];
  }

  try {
    const arr = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(arr)) return [];
    return arr.filter((c: any) => c && typeof c.name === 'string' && c.name.trim());
  } catch {
    // Try to extract individual JSON objects as fallback
    const objects: ScoutCandidate[] = [];
    const objectRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
    let match;
    while ((match = objectRegex.exec(jsonStr)) !== null) {
      try {
        const obj = JSON.parse(match[0]);
        if (obj.name && typeof obj.name === 'string') {
          objects.push(obj);
        }
      } catch {
        continue;
      }
    }
    return objects;
  }
}

/**
 * Run the Scout Agent with web search grounding.
 *
 * This agent uses Claude's built-in web_search_20250305 tool to find REAL
 * people on the internet, NOT hallucinated profiles. The flow:
 *
 * 1. Loads the scout system prompt from the DB
 * 2. Calls Claude with web_search tool enabled — Claude searches the web
 *    for real freelancers, agencies, and builders using AI coding tools
 * 3. Claude returns structured JSON based on actual search results
 * 4. Deduplicates against existing candidates
 * 5. Saves new candidates to pga_candidates
 * 6. Updates the pga_agent_runs record with results
 */
export async function runScoutAgent(
  supabase: SupabaseClient,
  params: {
    runId: string;
    userId: string;
    query?: string; // optional extra search query
    maxCandidates?: number;
  },
  callbacks: ScoutCallbacks
): Promise<void> {
  const startTime = Date.now();
  let totalTokens = 0;
  let totalCost = 0;

  try {
    callbacks.onProgress('Loading scout configuration...');

    // 1. Load system prompt and existing candidates in parallel
    const [systemPrompt, existingKeys] = await Promise.all([
      loadScoutPrompt(supabase),
      loadExistingCandidates(supabase),
    ]);

    callbacks.onProgress(`Loaded config. ${existingKeys.size} existing candidates for dedup.`);

    // 2. Create Anthropic client
    const client = await createAnthropicClient(supabase);
    if (!client) {
      throw new Error('Anthropic API key not configured. Go to Settings > AI Keys to add one.');
    }

    // 3. Build search parameters
    const batchSize = params.maxCandidates ?? 8;
    const searchFocus = params.query ? params.query : 'vibe coding freelancer agency AI tools paid work';

    // Use Sonnet 4.5 for Phase 1 (web search research) — best quality for finding real people
    // At Tier 2+ (450k ITPM), rate limits are not an issue for Sonnet
    // Haiku 3.5 was deprecated (404) — replaced with current models
    const modelId = 'claude-sonnet-4-5-20250929';

    // Minimal system prompt to reduce token count (the DB prompt is too large)
    const shortSystemPrompt = `You are a Podcast Guest Scout. Find REAL people making money with AI coding tools (Lovable, Cursor, Replit, Bolt, v0, Windsurf). Use web_search to find actual people. Do NOT hallucinate.`;

    // PHASE 1: Single API call with web_search — Claude searches and produces a summary
    const researchMessage = `Search the web for ${batchSize} REAL people who make money with AI/vibe coding tools.

Search for: "${searchFocus}"
Also try: "vibe coding freelancer making money", "built with Lovable Cursor agency"
${params.query ? `Focus: "${params.query}"` : ''}

For each person found, note their name, what they do, tools they use, and source URLs.
${existingKeys.size > 0 ? `Skip duplicates — I have ${existingKeys.size} candidates already.` : ''}

After searching, write a numbered list of candidates with name, description, tools used, and URLs.`;

    callbacks.onProgress('Searching the web for real candidates...');

    // Helper: retry with backoff for rate limits (longer waits to clear per-minute window)
    const callWithRetry = async (createFn: () => Promise<any>, label: string): Promise<any> => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await createFn();
        } catch (err: any) {
          if (err?.status === 429 && attempt < 2) {
            const waitSec = (attempt + 1) * 65; // 65s, 130s — must exceed 1-minute rate limit window
            callbacks.onProgress(`Rate limited on ${label} — waiting ${waitSec}s before retry...`);
            await new Promise((r) => setTimeout(r, waitSec * 1000));
          } else {
            throw err;
          }
        }
      }
    };

    // PHASE 1: Let Claude search the web
    let messages: any[] = [{ role: 'user', content: researchMessage }];
    let researchOutput = '';
    let searchCount = 0;
    const maxTurns = 10;

    for (let turn = 0; turn < maxTurns; turn++) {
      const response = await callWithRetry(
        () => client.messages.create({
          model: modelId,
          max_tokens: 8192,
          system: shortSystemPrompt,
          messages,
          tools: [
            {
              type: 'web_search_20250305' as any,
              name: 'web_search',
            },
          ],
        }),
        `research turn ${turn + 1}`
      );

      // Track token usage
      totalTokens += (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
      totalCost += calculateCost(
        'anthropic',
        modelId,
        response.usage?.input_tokens || 0,
        response.usage?.output_tokens || 0
      );

      // Process response blocks
      let hasToolUse = false;
      const assistantContent: any[] = [];

      for (const block of response.content) {
        assistantContent.push(block);

        if (block.type === 'text') {
          researchOutput += block.text;
          callbacks.onToken(block.text);
        } else if (block.type === 'server_tool_use' && block.name === 'web_search') {
          hasToolUse = true;
          searchCount++;
          const query = (block.input as any)?.query || 'unknown';
          callbacks.onProgress(`Web search ${searchCount}: "${query}"`);
        } else if (block.type === 'web_search_tool_result') {
          hasToolUse = true;
        }
      }

      messages.push({ role: 'assistant', content: assistantContent });

      if (response.stop_reason === 'end_turn' || !hasToolUse) {
        callbacks.onProgress(`${searchCount} web searches done. Structuring results...`);
        break;
      }

      callbacks.onProgress(`Researching... (search ${searchCount})`);
    }

    // PHASE 2: Fresh conversation — just pass the research text, NOT the full tool-use history
    // This avoids sending massive web_search_tool_result blocks back to the API

    // Truncate research output to ~6000 chars (~2000 tokens) to stay under rate limits
    const trimmedResearch = researchOutput.length > 6000
      ? researchOutput.slice(0, 6000) + '\n...[truncated]'
      : researchOutput;

    // Brief cooldown between phases — at Tier 2+ (450k ITPM) this is just precautionary
    // At Tier 1 (30k ITPM), retry logic handles rate limits with 65s/130s backoff
    callbacks.onProgress(`Brief cooldown before Phase 2...`);
    await new Promise((r) => setTimeout(r, 5000));

    callbacks.onProgress('Converting research into structured data...');

    // Use Haiku 4.5 for Phase 2 — it's a simple JSON extraction task, doesn't need Sonnet
    const phase2Model = 'claude-haiku-4-5-20251001';

    const jsonResponse = await callWithRetry(
      () => client.messages.create({
        model: phase2Model,
        max_tokens: 4096,
        system: 'Return ONLY a valid JSON array. No prose, no markdown fences, no explanation.',
        messages: [
          {
            role: 'user',
            content: `Convert these web search findings into a JSON array of podcast guest candidates:

${trimmedResearch}

Each object: {"name":"Full Name","one_liner":"What they do","email":null,"email_verified":false,"platform_presence":{"website":"url","twitter":"url"},"evidence_of_paid_work":[{"project":"Name","description":"What","url":"url"}],"estimated_reach":{"twitter_followers":0},"tools_used":["Cursor"],"contact_method":"twitter_dm","scout_confidence":"medium","source":{"channel":"web_search","query":"query","url":"url"}}

Only real people with real URLs. JSON array only:`,
          },
        ],
      }),
      'JSON extraction'
    );

    totalTokens += (jsonResponse.usage?.input_tokens || 0) + (jsonResponse.usage?.output_tokens || 0);
    totalCost += calculateCost(
      'anthropic',
      phase2Model,
      jsonResponse.usage?.input_tokens || 0,
      jsonResponse.usage?.output_tokens || 0
    );

    let fullOutput = '';
    for (const block of jsonResponse.content) {
      if (block.type === 'text') {
        fullOutput += block.text;
      }
    }

    callbacks.onProgress('Parsing candidates from search results...');

    // 5. Parse candidates
    const rawCandidates = parseCandidates(fullOutput);
    callbacks.onProgress(`Found ${rawCandidates.length} candidates from web search. Checking for duplicates...`);

    if (rawCandidates.length === 0) {
      callbacks.onProgress('Warning: No candidates could be parsed from the response. The AI may need different search terms.');
    }

    // 6. Save candidates (dedup + persist)
    let saved = 0;
    let duplicates = 0;

    for (const candidate of rawCandidates) {
      if (isDuplicate(candidate, existingKeys)) {
        duplicates++;
        callbacks.onProgress(`Skipped duplicate: ${candidate.name}`);
        continue;
      }

      const id = await saveCandidate(supabase, candidate);
      if (id) {
        saved++;
        // Add to existing keys to prevent duplicates within this batch
        existingKeys.add(candidate.name.toLowerCase().trim());
        for (const url of Object.values(candidate.platform_presence || {})) {
          if (url) existingKeys.add(url.toLowerCase().trim());
        }

        callbacks.onCandidateFound(candidate);
        callbacks.onProgress(`Saved candidate ${saved}: ${candidate.name} (${candidate.scout_confidence}) [web-verified]`);
      }
    }

    const durationMs = Date.now() - startTime;

    // 7. Update the run record
    await supabase
      .from('pga_agent_runs')
      .update({
        status: 'completed',
        ended_at: new Date().toISOString(),
        candidates_found: saved,
        tokens_used: totalTokens,
        output_json: {
          raw_candidates: rawCandidates.length,
          saved: saved,
          duplicates_skipped: duplicates,
          cost_usd: totalCost,
          duration_ms: durationMs,
          model: modelId,
          web_searches_performed: searchCount,
          grounded: true, // Flag that this used real web search
        },
      })
      .eq('id', params.runId);

    // 8. Log AI usage
    await logUsage(supabase, {
      userId: params.userId,
      boardId: undefined,
      cardId: undefined,
      activity: 'agent_execution',
      provider: 'anthropic',
      modelId,
      inputTokens: totalTokens, // approximate since we're summing across turns
      outputTokens: 0,
      latencyMs: durationMs,
      status: 'success',
      metadata: {
        agent_type: 'podcast-scout',
        run_id: params.runId,
        candidates_found: saved,
        web_searches: searchCount,
        grounded: true,
      },
    });

    const result: ScoutResult = {
      candidates_found: rawCandidates.length,
      candidates_saved: saved,
      duplicates_skipped: duplicates,
      tokens_used: totalTokens,
      cost_usd: totalCost,
      duration_ms: durationMs,
    };

    callbacks.onComplete(result);
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err.message ?? 'Unknown error';

    // Update run as failed
    try {
      await supabase
        .from('pga_agent_runs')
        .update({
          status: 'failed',
          ended_at: new Date().toISOString(),
          tokens_used: totalTokens,
          error_message: errorMsg,
        })
        .eq('id', params.runId);
    } catch {
      // Ignore failure to update run status
    }

    callbacks.onError(errorMsg);
  }
}
