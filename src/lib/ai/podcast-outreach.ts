import { SupabaseClient } from '@supabase/supabase-js';
import { createAnthropicClient } from './providers';
import { calculateCost, logUsage } from './cost-tracker';
import type { PGACandidate } from '../types';

// ============================================================================
// PODCAST OUTREACH AGENT — Research + personalized email sequence generation
// ============================================================================

export interface OutreachCallbacks {
  onToken: (text: string) => void;
  onSequenceCreated: (candidateName: string, emailCount: number) => void;
  onProgress: (message: string) => void;
  onComplete: (result: OutreachResult) => void;
  onError: (error: string) => void;
}

export interface EmailStep {
  step: number;
  day: number;
  subject: string;
  body: string;
}

export interface OutreachResult {
  sequences_created: number;
  emails_total: number;
  candidates_processed: number;
  tokens_used: number;
  cost_usd: number;
  duration_ms: number;
}

/**
 * Load the podcast-outreach skill system_prompt from the database.
 */
async function loadOutreachPrompt(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from('agent_skills')
    .select('system_prompt')
    .eq('slug', 'podcast-outreach')
    .single();

  if (!data?.system_prompt) {
    throw new Error('podcast-outreach skill not found in database. Run migration 042.');
  }
  return data.system_prompt;
}

/**
 * Load approved candidates who don't have an email sequence yet.
 */
async function loadApprovedCandidates(
  supabase: SupabaseClient,
  limit = 10
): Promise<PGACandidate[]> {
  // Find approved candidates without an existing sequence
  const { data: candidates } = await supabase
    .from('pga_candidates')
    .select('*')
    .eq('status', 'approved')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (!candidates || candidates.length === 0) return [];

  // Check which ones already have sequences
  const ids = candidates.map((c) => c.id);
  const { data: existing } = await supabase
    .from('pga_email_sequences')
    .select('candidate_id')
    .in('candidate_id', ids);

  const withSequence = new Set((existing ?? []).map((e) => e.candidate_id));
  return candidates.filter((c) => !withSequence.has(c.id));
}

/**
 * Parse email sequence JSON from Claude's output.
 */
function parseEmailSequence(output: string): EmailStep[] {
  // Try code block first
  const codeBlockMatch = output.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1] : output;

  // Try JSON array
  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const arr = JSON.parse(arrayMatch[0]);
      if (Array.isArray(arr) && arr.length > 0 && arr[0].subject) {
        return arr;
      }
      // Maybe nested under a key
      if (arr.emails) return arr.emails;
    } catch {
      // fall through
    }
  }

  // Try object with emails key
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      const obj = JSON.parse(objMatch[0]);
      if (obj.emails && Array.isArray(obj.emails)) return obj.emails;
      if (obj.sequence && Array.isArray(obj.sequence)) return obj.sequence;
    } catch {
      // fall through
    }
  }

  return [];
}

/**
 * Build a detailed candidate profile for Claude to research and write outreach for.
 */
function buildCandidateProfile(candidate: PGACandidate): string {
  const parts: string[] = [];
  parts.push(`## Candidate: ${candidate.name}`);
  if (candidate.one_liner) parts.push(`**Summary**: ${candidate.one_liner}`);
  if (candidate.email) parts.push(`**Email**: ${candidate.email}`);
  parts.push(`**Contact Method**: ${candidate.contact_method}`);
  parts.push(`**Confidence**: ${candidate.scout_confidence}`);

  // Platform presence
  const pp = candidate.platform_presence as Record<string, string>;
  if (pp && Object.keys(pp).length > 0) {
    parts.push('\n**Platforms**:');
    for (const [platform, url] of Object.entries(pp)) {
      if (url) parts.push(`- ${platform}: ${url}`);
    }
  }

  // Evidence of paid work
  const evidence = candidate.evidence_of_paid_work as Array<{
    project: string;
    description: string;
    url?: string;
  }>;
  if (evidence && evidence.length > 0) {
    parts.push('\n**Evidence of Paid Work**:');
    for (const e of evidence) {
      parts.push(`- **${e.project}**: ${e.description}${e.url ? ` (${e.url})` : ''}`);
    }
  }

  // Tools used
  if (candidate.tools_used && candidate.tools_used.length > 0) {
    parts.push(`\n**AI Tools Used**: ${candidate.tools_used.join(', ')}`);
  }

  // Reach
  const reach = candidate.estimated_reach as Record<string, number>;
  if (reach && Object.keys(reach).length > 0) {
    parts.push('\n**Estimated Reach**:');
    for (const [platform, count] of Object.entries(reach)) {
      if (count > 0) parts.push(`- ${platform}: ${count.toLocaleString()}`);
    }
  }

  if (candidate.notes) parts.push(`\n**Notes**: ${candidate.notes}`);

  return parts.join('\n');
}

/**
 * Run the Outreach Agent.
 *
 * Processes approved candidates without email sequences:
 * 1. Loads the outreach system prompt
 * 2. For each approved candidate, calls Claude to research + write emails
 * 3. Saves email sequences to pga_email_sequences
 * 4. Updates candidate status to 'outreach_active'
 * 5. Updates the pga_agent_runs record
 */
export async function runOutreachAgent(
  supabase: SupabaseClient,
  params: {
    runId: string;
    userId: string;
    candidateIds?: string[]; // specific candidates, or auto-pick approved ones
    maxCandidates?: number;
  },
  callbacks: OutreachCallbacks
): Promise<void> {
  const startTime = Date.now();
  let totalTokens = 0;
  let totalCost = 0;
  let sequencesCreated = 0;
  let totalEmails = 0;

  try {
    callbacks.onProgress('Loading outreach configuration...');

    // 1. Load system prompt
    const systemPrompt = await loadOutreachPrompt(supabase);

    // 2. Get candidates to process
    let candidates: PGACandidate[];

    if (params.candidateIds && params.candidateIds.length > 0) {
      const { data } = await supabase
        .from('pga_candidates')
        .select('*')
        .in('id', params.candidateIds)
        .eq('status', 'approved');
      candidates = data ?? [];
    } else {
      candidates = await loadApprovedCandidates(supabase, params.maxCandidates ?? 10);
    }

    if (candidates.length === 0) {
      callbacks.onProgress('No approved candidates waiting for outreach.');
      await supabase
        .from('pga_agent_runs')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
          emails_created: 0,
          output_json: { message: 'No approved candidates to process' },
        })
        .eq('id', params.runId);

      callbacks.onComplete({
        sequences_created: 0,
        emails_total: 0,
        candidates_processed: 0,
        tokens_used: 0,
        cost_usd: 0,
        duration_ms: Date.now() - startTime,
      });
      return;
    }

    callbacks.onProgress(`Found ${candidates.length} approved candidates to write outreach for.`);

    // 3. Create Anthropic client
    const client = await createAnthropicClient(supabase);
    if (!client) {
      throw new Error('Anthropic API key not configured. Go to Settings > AI Keys to add one.');
    }

    const modelId = 'claude-sonnet-4-5-20250929';

    // 4. Process each candidate
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      callbacks.onProgress(`[${i + 1}/${candidates.length}] Writing outreach for ${candidate.name}...`);

      const profile = buildCandidateProfile(candidate);
      const userMessage = `${profile}

---

Research this person's recent online activity and write a personalized email sequence for inviting them to the Vibe Coding Deals podcast.

Requirements:
- 3-5 emails with DECREASING word counts (150 → 100 → 80 → 60 → 50 max words)
- Every email must reference at least ONE specific project, tool, or achievement
- NO generic compliments — only specific details from their actual work
- Include scheduling link: kivimedia.com/15?ref=${candidate.id}
- Tone: casual, professional, direct. Like a founder emailing another founder.

Return ONLY a JSON array of email objects with these fields:
- step (number, 1-based)
- day (number — day 0 = first email, then 3, 7, 12, 18)
- subject (string — short, personal, no clickbait)
- body (string — the email text)`;

      // Stream response for this candidate
      let candidateOutput = '';
      const stream = client.messages.stream({
        model: modelId,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && (event.delta as any).type === 'text_delta') {
          const text = (event.delta as any).text;
          candidateOutput += text;
          callbacks.onToken(text);
        }
      }

      const finalMessage = await stream.finalMessage();
      const inputTokens = finalMessage.usage.input_tokens;
      const outputTokens = finalMessage.usage.output_tokens;
      totalTokens += inputTokens + outputTokens;
      totalCost += calculateCost('anthropic', modelId, inputTokens, outputTokens);

      // Parse the email sequence
      const emails = parseEmailSequence(candidateOutput);

      if (emails.length > 0) {
        // Save to pga_email_sequences
        const { error: seqError } = await supabase
          .from('pga_email_sequences')
          .insert({
            candidate_id: candidate.id,
            status: 'draft',
            emails: emails,
          });

        if (!seqError) {
          sequencesCreated++;
          totalEmails += emails.length;

          // Update candidate status
          await supabase
            .from('pga_candidates')
            .update({ status: 'outreach_active', updated_at: new Date().toISOString() })
            .eq('id', candidate.id);

          callbacks.onSequenceCreated(candidate.name, emails.length);
          callbacks.onProgress(`Created ${emails.length}-email sequence for ${candidate.name}`);
        } else {
          callbacks.onProgress(`Failed to save sequence for ${candidate.name}: ${seqError.message}`);
        }
      } else {
        callbacks.onProgress(`No valid emails parsed for ${candidate.name} — skipping`);
      }
    }

    const durationMs = Date.now() - startTime;

    // 5. Update run record
    await supabase
      .from('pga_agent_runs')
      .update({
        status: 'completed',
        ended_at: new Date().toISOString(),
        candidates_found: candidates.length,
        emails_created: totalEmails,
        tokens_used: totalTokens,
        output_json: {
          candidates_processed: candidates.length,
          sequences_created: sequencesCreated,
          emails_total: totalEmails,
          cost_usd: totalCost,
          duration_ms: durationMs,
          model: modelId,
        },
      })
      .eq('id', params.runId);

    // 6. Log AI usage
    await logUsage(supabase, {
      userId: params.userId,
      boardId: undefined,
      cardId: undefined,
      activity: 'agent_execution',
      provider: 'anthropic',
      modelId,
      inputTokens: totalTokens, // approximate
      outputTokens: 0,
      latencyMs: durationMs,
      status: 'success',
      metadata: {
        agent_type: 'podcast-outreach',
        run_id: params.runId,
        sequences_created: sequencesCreated,
        emails_total: totalEmails,
      },
    });

    callbacks.onComplete({
      sequences_created: sequencesCreated,
      emails_total: totalEmails,
      candidates_processed: candidates.length,
      tokens_used: totalTokens,
      cost_usd: totalCost,
      duration_ms: durationMs,
    });
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err.message ?? 'Unknown error';

    try {
      await supabase
        .from('pga_agent_runs')
        .update({
          status: 'failed',
          ended_at: new Date().toISOString(),
          tokens_used: totalTokens,
          emails_created: totalEmails,
          error_message: errorMsg,
        })
        .eq('id', params.runId);
    } catch {
      // Ignore failure to update run status
    }

    callbacks.onError(errorMsg);
  }
}
