import { SupabaseClient } from '@supabase/supabase-js';
import { createAnthropicClient } from './providers';
import { calculateCost, logUsage } from './cost-tracker';
import { enrichLinkedInProfiles, discoverEmail } from '../integrations/email-discovery';
import { isScraplingAvailable, scraplingStealthy } from '../integrations/scrapling';
import type {
  LinkedInSuggestion,
  EnrichedProfile,
  FullCandidateProfile,
  ScoutConfig,
  PGAConfidence,
} from '../types';

// ============================================================================
// SCOUT PIPELINE — 4-step LinkedIn-first interactive wizard
//
// SCRAPLING INTEGRATION (Feb 2026):
// When Claude's web_search returns LinkedIn profile URLs, Step 3 (Deep Research)
// now attempts to fetch the actual LinkedIn page content via Scrapling's
// StealthyFetcher (Camoufox) before falling back to web_search-only research.
// This provides richer profile data (full bio, skills, experience) that
// web_search snippets often miss.
//
// Step 1: LinkedIn Discovery (Claude web_search → site:linkedin.com/in)
// Step 2: Snov.io v2 Enrichment + Email Discovery
// Step 3: Claude Deep Research per candidate
// Step 4: User approval → save to pga_candidates
// ============================================================================

export interface StepCallbacks {
  onToken: (text: string) => void;
  onProgress: (message: string) => void;
  onStepData: (data: unknown) => void;
  onComplete: (result: StepResult) => void;
  onError: (error: string) => void;
}

export interface StepResult {
  step: number;
  data: unknown;
  tokens_used: number;
  cost_usd: number;
  duration_ms: number;
}

// ============================================================================
// STEP 1: LinkedIn Discovery
// ============================================================================

export async function runStep1LinkedInDiscovery(
  supabase: SupabaseClient,
  params: {
    runId: string;
    userId: string;
    config: ScoutConfig;
  },
  callbacks: StepCallbacks
): Promise<void> {
  const startTime = Date.now();
  let totalTokens = 0;
  let totalCost = 0;

  try {
    callbacks.onProgress('Loading AI configuration...');

    const client = await createAnthropicClient(supabase);
    if (!client) {
      throw new Error('Anthropic API key not configured. Go to Settings > AI Keys to add one.');
    }

    const { config } = params;
    const location = config.custom_location || config.default_location || 'US';
    const toolFocus = config.tool_focus || 'Cursor, Lovable, Bolt, Replit, v0, Windsurf';
    const maxResults = config.max_results || 10;
    const query = config.default_query || 'vibe coding freelancer agency AI tools';

    const modelId = 'claude-sonnet-4-5-20250929';

    const systemPrompt = `You are a LinkedIn scout. Search for REAL people on LinkedIn who make money with AI coding tools. Use web_search to find actual profiles. NEVER hallucinate profiles.`;

    const userMessage = `Search LinkedIn for ${maxResults} REAL people who make money with AI/vibe coding tools.

Search queries to try (use web_search for each):
1. site:linkedin.com/in "${query}" ${location}
2. site:linkedin.com/in ${toolFocus.split(',').slice(0, 2).join(' ')} freelancer ${location}
3. site:linkedin.com/in "AI developer" OR "vibe coding" ${location}

For each REAL person found on LinkedIn, note:
- Full name (from their LinkedIn profile)
- Title/headline
- Location
- LinkedIn URL (must be linkedin.com/in/xxx format)
- Why they match (1-line summary)
- Which search query found them

After searching, output a JSON array:
[{"index":1,"name":"Full Name","title":"Their Title","location":"City, State","linkedin_url":"https://www.linkedin.com/in/username","summary":"Why they match","source_query":"the query used"}]

IMPORTANT:
- Only include profiles with REAL linkedin.com/in/ URLs from actual search results
- Skip duplicates
- Target ${maxResults} unique profiles`;

    callbacks.onProgress(`Searching LinkedIn for profiles in ${location}...`);

    // Call Claude with web_search tool
    let messages: any[] = [{ role: 'user', content: userMessage }];
    let researchOutput = '';
    let searchCount = 0;
    const maxTurns = 12;

    const callWithRetry = async (createFn: () => Promise<any>, label: string): Promise<any> => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await createFn();
        } catch (err: any) {
          if (err?.status === 429 && attempt < 2) {
            const waitSec = (attempt + 1) * 65;
            callbacks.onProgress(`Rate limited on ${label} -- waiting ${waitSec}s...`);
            await new Promise((r) => setTimeout(r, waitSec * 1000));
          } else {
            throw err;
          }
        }
      }
    };

    for (let turn = 0; turn < maxTurns; turn++) {
      const response = await callWithRetry(
        () =>
          client.messages.create({
            model: modelId,
            max_tokens: 8192,
            system: systemPrompt,
            messages,
            tools: [{ type: 'web_search_20250305' as any, name: 'web_search' }],
          }),
        `search turn ${turn + 1}`
      );

      totalTokens += (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
      totalCost += calculateCost('anthropic', modelId, response.usage?.input_tokens || 0, response.usage?.output_tokens || 0);

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
          const q = (block.input as any)?.query || 'unknown';
          callbacks.onProgress(`Web search ${searchCount}: "${q}"`);
        } else if (block.type === 'web_search_tool_result') {
          hasToolUse = true;
        }
      }

      messages.push({ role: 'assistant', content: assistantContent });

      if (response.stop_reason === 'end_turn' || !hasToolUse) {
        callbacks.onProgress(`${searchCount} web searches complete. Extracting profiles...`);
        break;
      }
    }

    // Extract JSON from Claude's output
    const trimmedResearch = researchOutput.length > 6000
      ? researchOutput.slice(0, 6000) + '\n...[truncated]'
      : researchOutput;

    callbacks.onProgress('Structuring LinkedIn profiles...');
    await new Promise((r) => setTimeout(r, 3000));

    const phase2Model = 'claude-haiku-4-5-20251001';
    const jsonResponse = await callWithRetry(
      () =>
        client.messages.create({
          model: phase2Model,
          max_tokens: 4096,
          system: 'Return ONLY a valid JSON array. No prose, no markdown, no explanation.',
          messages: [
            {
              role: 'user',
              content: `Extract LinkedIn profiles from this research into a JSON array:

${trimmedResearch}

Each object: {"index":1,"name":"Full Name","title":"Title/Headline","location":"City, State","linkedin_url":"https://www.linkedin.com/in/username","summary":"Why they match","source_query":"query used"}

Rules:
- Only include profiles with real linkedin.com/in/ URLs
- Number them starting from 1
- JSON array only, no other text:`,
            },
          ],
        }),
      'JSON extraction'
    );

    totalTokens += (jsonResponse.usage?.input_tokens || 0) + (jsonResponse.usage?.output_tokens || 0);
    totalCost += calculateCost('anthropic', phase2Model, jsonResponse.usage?.input_tokens || 0, jsonResponse.usage?.output_tokens || 0);

    let jsonText = '';
    for (const block of jsonResponse.content) {
      if (block.type === 'text') jsonText += block.text;
    }

    // Parse the suggestions
    const suggestions = parseLinkedInSuggestions(jsonText);
    callbacks.onProgress(`Found ${suggestions.length} LinkedIn profiles.`);

    // Save step 1 data to the run
    const stepData: LinkedInSuggestion[] = suggestions;

    await supabase
      .from('pga_agent_runs')
      .update({
        current_step: 1,
        status: 'awaiting_input',
        tokens_used: totalTokens,
        output_json: {
          step1_suggestions: stepData,
          step1_search_count: searchCount,
          step1_cost_usd: totalCost,
        },
      })
      .eq('id', params.runId);

    callbacks.onStepData(stepData);

    await logUsage(supabase, {
      userId: params.userId,
      boardId: undefined,
      cardId: undefined,
      activity: 'agent_execution',
      provider: 'anthropic',
      modelId,
      inputTokens: totalTokens,
      outputTokens: 0,
      latencyMs: Date.now() - startTime,
      status: 'success',
      metadata: { agent_type: 'scout-pipeline', step: 1, run_id: params.runId },
    });

    callbacks.onComplete({
      step: 1,
      data: stepData,
      tokens_used: totalTokens,
      cost_usd: totalCost,
      duration_ms: Date.now() - startTime,
    });
  } catch (err: any) {
    await supabase
      .from('pga_agent_runs')
      .update({ status: 'failed', ended_at: new Date().toISOString(), error_message: err.message })
      .eq('id', params.runId);
    callbacks.onError(err.message ?? 'Unknown error');
  }
}

// ============================================================================
// STEP 2: Snov.io Enrichment + Email Discovery
// ============================================================================

export async function runStep2Enrichment(
  supabase: SupabaseClient,
  params: {
    runId: string;
    userId: string;
    selectedIndices: number[]; // Which suggestions from step 1 to enrich
  },
  callbacks: StepCallbacks
): Promise<void> {
  const startTime = Date.now();

  try {
    // Load step 1 data
    const { data: run } = await supabase
      .from('pga_agent_runs')
      .select('output_json')
      .eq('id', params.runId)
      .single();

    if (!run?.output_json) throw new Error('No step 1 data found for this run.');

    const outputJson = run.output_json as Record<string, unknown>;
    const allSuggestions = (outputJson.step1_suggestions || []) as LinkedInSuggestion[];
    const selected = allSuggestions.filter((s) => params.selectedIndices.includes(s.index));

    if (selected.length === 0) throw new Error('No profiles selected for enrichment.');

    callbacks.onProgress(`Enriching ${selected.length} LinkedIn profiles via Snov.io...`);

    // Update run status
    await supabase
      .from('pga_agent_runs')
      .update({ status: 'running', current_step: 2 })
      .eq('id', params.runId);

    // Collect LinkedIn URLs
    const urls = selected.map((s) => s.linkedin_url).filter(Boolean);

    let enrichedResults: EnrichedProfile[] = [];

    if (urls.length > 0) {
      try {
        const snovResults = await enrichLinkedInProfiles(supabase, urls, (msg) =>
          callbacks.onProgress(msg)
        );

        // Merge Snov data with our suggestions
        enrichedResults = selected.map((suggestion, idx) => {
          const snovMatch = snovResults.find(
            (r) => r.linkedin_url && suggestion.linkedin_url.includes(r.linkedin_url.replace(/\/$/, ''))
          );

          return {
            index: suggestion.index,
            name: snovMatch?.name || suggestion.name,
            title: snovMatch?.title || suggestion.title,
            location: snovMatch?.location || suggestion.location,
            company: snovMatch?.company || '',
            domain: snovMatch?.domain || '',
            industry: snovMatch?.industry || '',
            linkedin_url: suggestion.linkedin_url,
            email: null,
            email_source: 'none' as const,
            email_confidence: 0,
            email_verified: false,
          };
        });

        callbacks.onProgress(`Snov.io enriched ${snovResults.length} profiles.`);
      } catch (snovErr: any) {
        callbacks.onProgress(`Snov.io enrichment skipped: ${snovErr.message}`);
        // Fall through with basic data
        enrichedResults = selected.map((s) => ({
          index: s.index,
          name: s.name,
          title: s.title,
          location: s.location,
          company: '',
          domain: '',
          industry: '',
          linkedin_url: s.linkedin_url,
          email: null,
          email_source: 'none' as const,
          email_confidence: 0,
          email_verified: false,
        }));
      }
    }

    // Try email discovery for each enriched profile
    callbacks.onProgress('Discovering emails via Hunter.io / Snov.io...');
    for (const profile of enrichedResults) {
      if (profile.domain) {
        const nameParts = profile.name.split(/\s+/);
        const result = await discoverEmail(supabase, {
          name: profile.name,
          platform_presence: {
            linkedin: profile.linkedin_url,
            website: profile.domain ? `https://${profile.domain}` : '',
          },
        });
        if (result.email) {
          profile.email = result.email;
          profile.email_source = result.source as 'hunter' | 'snov';
          profile.email_confidence = result.confidence;
          profile.email_verified = result.verified;
          callbacks.onProgress(`Found email for ${profile.name}: ${result.email} (${result.source})`);
        }
      }
    }

    // Save step 2 data
    await supabase
      .from('pga_agent_runs')
      .update({
        current_step: 2,
        status: 'awaiting_input',
        output_json: {
          ...outputJson,
          step2_enriched: enrichedResults,
          step2_selected_count: selected.length,
        },
      })
      .eq('id', params.runId);

    callbacks.onStepData(enrichedResults);
    callbacks.onComplete({
      step: 2,
      data: enrichedResults,
      tokens_used: 0,
      cost_usd: 0,
      duration_ms: Date.now() - startTime,
    });
  } catch (err: any) {
    await supabase
      .from('pga_agent_runs')
      .update({ status: 'failed', ended_at: new Date().toISOString(), error_message: err.message })
      .eq('id', params.runId);
    callbacks.onError(err.message ?? 'Unknown error');
  }
}

// ============================================================================
// STEP 3: AI Deep Research per Candidate
// ============================================================================

export async function runStep3DeepResearch(
  supabase: SupabaseClient,
  params: {
    runId: string;
    userId: string;
    selectedIndices: number[];
  },
  callbacks: StepCallbacks
): Promise<void> {
  const startTime = Date.now();
  let totalTokens = 0;
  let totalCost = 0;

  try {
    const client = await createAnthropicClient(supabase);
    if (!client) throw new Error('Anthropic API key not configured.');

    const { data: run } = await supabase
      .from('pga_agent_runs')
      .select('output_json')
      .eq('id', params.runId)
      .single();

    if (!run?.output_json) throw new Error('No previous step data found.');

    const outputJson = run.output_json as Record<string, unknown>;
    const enriched = (outputJson.step2_enriched || []) as EnrichedProfile[];
    const selected = enriched.filter((p) => params.selectedIndices.includes(p.index));

    if (selected.length === 0) throw new Error('No profiles selected for deep research.');

    await supabase
      .from('pga_agent_runs')
      .update({ status: 'running', current_step: 3 })
      .eq('id', params.runId);

    callbacks.onProgress(`Deep researching ${selected.length} candidates...`);

    const modelId = 'claude-sonnet-4-5-20250929';
    const fullProfiles: FullCandidateProfile[] = [];

    const callWithRetry = async (createFn: () => Promise<any>, label: string): Promise<any> => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await createFn();
        } catch (err: any) {
          if (err?.status === 429 && attempt < 2) {
            const waitSec = (attempt + 1) * 65;
            callbacks.onProgress(`Rate limited on ${label} -- waiting ${waitSec}s...`);
            await new Promise((r) => setTimeout(r, waitSec * 1000));
          } else {
            throw err;
          }
        }
      }
    };

    // NOTE: LinkedIn blocks all scrapling fetcher tiers (auth-wall, status 999).
    // Do NOT attempt to pre-fetch linkedin.com URLs -- it wastes time and always fails.
    // Instead, scrapling is used below for non-LinkedIn URLs (personal sites, portfolios, etc.)
    const scraplingReady = await isScraplingAvailable();
    const websiteContentCache: Record<number, string> = {};

    if (scraplingReady) {
      // Pre-fetch candidates' personal websites/portfolios (NOT LinkedIn -- that's auth-walled)
      const profilesWithWebsites = selected.filter((p) => {
        const website = p.enriched?.website || '';
        return website && !website.includes('linkedin.com') && !website.includes('facebook.com');
      });
      if (profilesWithWebsites.length > 0) {
        callbacks.onProgress(`Scrapling: pre-fetching ${profilesWithWebsites.length} candidate websites...`);
        for (const profile of profilesWithWebsites) {
          const website = profile.enriched?.website || '';
          try {
            const result = await scraplingStealthy({ url: website, timeout: 30 });
            if (result.success && result.content && result.content.length > 200) {
              websiteContentCache[profile.index] = result.content.slice(0, 8000);
              callbacks.onProgress(`  Fetched website for ${profile.name} (${result.content_length} chars)`);
            }
          } catch {
            // Silent fail -- web_search will still work
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }

    for (const profile of selected) {
      callbacks.onProgress(`Researching ${profile.name}...`);

      // Inject scrapling-fetched website content if available (NOT LinkedIn -- that's auth-walled)
      const websiteExtra = websiteContentCache[profile.index]
        ? `\n\nPRE-FETCHED website content for this candidate (use as supplementary source):\n${websiteContentCache[profile.index]}`
        : '';
      const researchPrompt = `Deep research this person for a podcast guest interview about making money with AI coding tools:

Name: ${profile.name}
Title: ${profile.title}
Location: ${profile.location}
Company: ${profile.company || 'Unknown'}
LinkedIn: ${profile.linkedin_url}
${profile.email ? `Email: ${profile.email}` : ''}

Search the web for:
1. Their personal website or portfolio
2. Evidence of PAID work using AI/vibe coding tools (not just tutorials)
3. Social profiles (Twitter/X, YouTube, GitHub)
4. Public mentions of revenue, clients, shipped products
5. Tools they use (Cursor, Lovable, Bolt, Replit, v0, Windsurf, etc.)

Then output a single JSON object:
{"index":${profile.index},"name":"${profile.name}","one_liner":"What they do in 1 sentence","email":${profile.email ? `"${profile.email}"` : 'null'},"email_verified":${profile.email_verified},"location":"${profile.location}","platform_presence":{"linkedin":"url","website":"url","twitter":"url","github":"url","youtube":"url"},"evidence_of_paid_work":[{"project":"Name","description":"What they did","url":"evidence_url"}],"estimated_reach":{"linkedin_connections":0,"twitter_followers":0,"youtube_subscribers":0},"tools_used":["Cursor"],"contact_method":"${profile.email ? 'email' : 'linkedin_dm'}","scout_confidence":"medium","source":{"channel":"linkedin_scout","linkedin_url":"${profile.linkedin_url}"}}

Quality filters:
- scout_confidence: "high" if clear evidence of paid work + active; "medium" if some evidence; "low" if uncertain
- Prefer people under 50K followers
- Only include REAL URLs from search results${websiteExtra}`;

      let researchMessages: any[] = [{ role: 'user', content: researchPrompt }];
      let researchOutput = '';

      // Multi-turn web search
      for (let turn = 0; turn < 8; turn++) {
        const response = await callWithRetry(
          () =>
            client.messages.create({
              model: modelId,
              max_tokens: 4096,
              system: 'You are a research assistant. Search the web for real information about people. Return structured JSON when done.',
              messages: researchMessages,
              tools: [{ type: 'web_search_20250305' as any, name: 'web_search' }],
            }),
          `research ${profile.name} turn ${turn + 1}`
        );

        totalTokens += (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
        totalCost += calculateCost('anthropic', modelId, response.usage?.input_tokens || 0, response.usage?.output_tokens || 0);

        let hasToolUse = false;
        const content: any[] = [];

        for (const block of response.content) {
          content.push(block);
          if (block.type === 'text') {
            researchOutput += block.text;
            callbacks.onToken(block.text);
          } else if (block.type === 'server_tool_use' || block.type === 'web_search_tool_result') {
            hasToolUse = true;
          }
        }

        researchMessages.push({ role: 'assistant', content });

        if (response.stop_reason === 'end_turn' || !hasToolUse) break;
      }

      // Parse the profile JSON
      const parsed = parseFullProfile(researchOutput, profile);
      if (parsed) {
        fullProfiles.push(parsed);
        callbacks.onStepData({ type: 'candidate_researched', profile: parsed });
        callbacks.onProgress(`Completed research for ${profile.name} (${parsed.scout_confidence} confidence)`);
      } else {
        callbacks.onProgress(`Could not parse research for ${profile.name}, skipping.`);
      }

      // Brief cooldown between candidates
      if (selected.indexOf(profile) < selected.length - 1) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    // Save step 3 data
    await supabase
      .from('pga_agent_runs')
      .update({
        current_step: 3,
        status: 'awaiting_input',
        tokens_used: totalTokens,
        output_json: {
          ...outputJson,
          step3_profiles: fullProfiles,
          step3_cost_usd: totalCost,
        },
      })
      .eq('id', params.runId);

    await logUsage(supabase, {
      userId: params.userId,
      boardId: undefined,
      cardId: undefined,
      activity: 'agent_execution',
      provider: 'anthropic',
      modelId,
      inputTokens: totalTokens,
      outputTokens: 0,
      latencyMs: Date.now() - startTime,
      status: 'success',
      metadata: { agent_type: 'scout-pipeline', step: 3, run_id: params.runId },
    });

    callbacks.onComplete({
      step: 3,
      data: fullProfiles,
      tokens_used: totalTokens,
      cost_usd: totalCost,
      duration_ms: Date.now() - startTime,
    });
  } catch (err: any) {
    await supabase
      .from('pga_agent_runs')
      .update({ status: 'failed', ended_at: new Date().toISOString(), error_message: err.message })
      .eq('id', params.runId);
    callbacks.onError(err.message ?? 'Unknown error');
  }
}

// ============================================================================
// STEP 4: Save approved candidates to pga_candidates
// ============================================================================

export async function runStep4SaveCandidates(
  supabase: SupabaseClient,
  params: {
    runId: string;
    userId: string;
    selectedIndices: number[];
  },
  callbacks: StepCallbacks
): Promise<void> {
  const startTime = Date.now();

  try {
    const { data: run } = await supabase
      .from('pga_agent_runs')
      .select('output_json')
      .eq('id', params.runId)
      .single();

    if (!run?.output_json) throw new Error('No previous step data found.');

    const outputJson = run.output_json as Record<string, unknown>;
    const profiles = (outputJson.step3_profiles || []) as FullCandidateProfile[];
    const selected = profiles.filter((p) => params.selectedIndices.includes(p.index));

    if (selected.length === 0) throw new Error('No candidates selected for saving.');

    await supabase
      .from('pga_agent_runs')
      .update({ status: 'running', current_step: 4 })
      .eq('id', params.runId);

    callbacks.onProgress(`Saving ${selected.length} candidates to database...`);

    // Load existing for dedup
    const { data: existing } = await supabase
      .from('pga_candidates')
      .select('name, platform_presence');

    const existingKeys = new Set<string>();
    if (existing) {
      for (const c of existing) {
        existingKeys.add(c.name.toLowerCase().trim());
        if (c.platform_presence) {
          for (const url of Object.values(c.platform_presence as Record<string, string>)) {
            if (url) existingKeys.add(url.toLowerCase().trim());
          }
        }
      }
    }

    let saved = 0;
    let duplicates = 0;

    for (const profile of selected) {
      // Dedup check
      if (existingKeys.has(profile.name.toLowerCase().trim())) {
        duplicates++;
        callbacks.onProgress(`Skipped duplicate: ${profile.name}`);
        continue;
      }

      const linkedin = profile.platform_presence?.linkedin;
      if (linkedin && existingKeys.has(linkedin.toLowerCase().trim())) {
        duplicates++;
        callbacks.onProgress(`Skipped duplicate (LinkedIn): ${profile.name}`);
        continue;
      }

      const { data, error } = await supabase
        .from('pga_candidates')
        .insert({
          name: profile.name.trim(),
          one_liner: profile.one_liner || null,
          email: profile.email || null,
          email_verified: profile.email_verified ?? false,
          location: profile.location || null,
          platform_presence: profile.platform_presence || {},
          evidence_of_paid_work: profile.evidence_of_paid_work || [],
          estimated_reach: profile.estimated_reach || {},
          tools_used: profile.tools_used || [],
          contact_method: profile.contact_method || 'email',
          scout_confidence: profile.scout_confidence || null,
          source: profile.source || {},
          status: 'scouted',
        })
        .select('id')
        .single();

      if (!error && data) {
        saved++;
        existingKeys.add(profile.name.toLowerCase().trim());
        if (linkedin) existingKeys.add(linkedin.toLowerCase().trim());
        callbacks.onProgress(`Saved: ${profile.name} (${profile.scout_confidence})`);
        callbacks.onStepData({ type: 'candidate_saved', name: profile.name, id: data.id });
      } else {
        callbacks.onProgress(`Failed to save ${profile.name}: ${error?.message}`);
      }
    }

    // Mark run as completed
    await supabase
      .from('pga_agent_runs')
      .update({
        current_step: 4,
        status: 'completed',
        ended_at: new Date().toISOString(),
        candidates_found: saved,
        output_json: {
          ...outputJson,
          step4_saved: saved,
          step4_duplicates: duplicates,
          step4_total_selected: selected.length,
        },
      })
      .eq('id', params.runId);

    callbacks.onComplete({
      step: 4,
      data: { saved, duplicates, total: selected.length },
      tokens_used: 0,
      cost_usd: 0,
      duration_ms: Date.now() - startTime,
    });
  } catch (err: any) {
    await supabase
      .from('pga_agent_runs')
      .update({ status: 'failed', ended_at: new Date().toISOString(), error_message: err.message })
      .eq('id', params.runId);
    callbacks.onError(err.message ?? 'Unknown error');
  }
}

// ============================================================================
// Helpers
// ============================================================================

export function parseLinkedInSuggestions(text: string): LinkedInSuggestion[] {
  // Try extracting JSON array
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1] : text;

  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (!arrayMatch) return [];

  try {
    const arr = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s: any) => s.name && s.linkedin_url && s.linkedin_url.includes('linkedin.com/in'))
      .map((s: any, idx: number) => ({
        index: s.index ?? idx + 1,
        name: s.name,
        title: s.title || s.headline || '',
        location: s.location || '',
        linkedin_url: s.linkedin_url,
        summary: s.summary || s.why || '',
        source_query: s.source_query || s.query || '',
      }));
  } catch {
    return [];
  }
}

export function parseFullProfile(
  text: string,
  fallback: EnrichedProfile
): FullCandidateProfile | null {
  // Find JSON in text
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1] : text;
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);

  if (!objMatch) return null;

  try {
    const obj = JSON.parse(objMatch[0]);
    return {
      index: obj.index ?? fallback.index,
      name: obj.name || fallback.name,
      one_liner: obj.one_liner || '',
      email: obj.email || fallback.email || null,
      email_verified: obj.email_verified ?? fallback.email_verified ?? false,
      location: obj.location || fallback.location || '',
      platform_presence: obj.platform_presence || { linkedin: fallback.linkedin_url },
      evidence_of_paid_work: obj.evidence_of_paid_work || [],
      estimated_reach: obj.estimated_reach || {},
      tools_used: obj.tools_used || [],
      contact_method: obj.contact_method || (fallback.email ? 'email' : 'linkedin_dm'),
      scout_confidence: validateConfidence(obj.scout_confidence),
      source: obj.source || { channel: 'linkedin_scout', linkedin_url: fallback.linkedin_url },
    };
  } catch {
    return null;
  }
}

export function validateConfidence(val: string): PGAConfidence {
  if (val === 'high' || val === 'medium' || val === 'low') return val;
  return 'medium';
}
