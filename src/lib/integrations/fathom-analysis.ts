import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FathomTranscriptEntry } from './fathom';
import { transcriptToText } from './fathom';
import { logUsage } from '@/lib/ai/cost-tracker';

// ============================================================================
// FATHOM TRANSCRIPT AI ANALYSIS
// Uses Claude Haiku to produce structured summaries and action items
// from Fathom meeting transcripts, with client-specific AI rules.
// ============================================================================

export interface ActionItem {
  text: string;
  assignee?: string;
  due_date?: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface AnalysisResult {
  ai_summary: string;
  ai_action_items: ActionItem[];
}

interface ClientAIRule {
  id: string;
  rule_text: string;
  rule_type: 'summary' | 'action_items' | 'tone' | 'filter' | 'general';
  is_global: boolean;
  priority: number;
}

const MAX_TRANSCRIPT_CHARS = 30000;
const MODEL = 'claude-haiku-4-5-20251001';
const TEMPERATURE = 0.3;
const MAX_TOKENS = 2000;

/**
 * Fetch enabled AI rules for a client (client-specific + global).
 */
async function fetchAIRules(
  supabase: SupabaseClient,
  clientId: string | null
): Promise<ClientAIRule[]> {
  let query = supabase
    .from('client_ai_rules')
    .select('id, rule_text, rule_type, is_global, priority')
    .eq('enabled', true)
    .order('priority', { ascending: false });

  if (clientId) {
    query = query.or(`client_id.eq.${clientId},is_global.eq.true`);
  } else {
    query = query.eq('is_global', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[fathom-analysis] Failed to fetch AI rules:', error.message);
    return [];
  }

  return (data || []) as ClientAIRule[];
}

/**
 * Build the system prompt for meeting transcript analysis.
 */
function buildSystemPrompt(rules: ClientAIRule[]): string {
  const lines: string[] = [
    'You are a meeting analysis assistant for an agency project management platform.',
    'Your job is to analyze meeting transcripts and produce a structured JSON response.',
    '',
    'You MUST respond with valid JSON only - no markdown, no explanation, no text outside the JSON.',
    '',
    'Response format:',
    '{',
    '  "summary": "A markdown-formatted summary of the meeting (use ## headings, bullet points, bold for key items)",',
    '  "action_items": [',
    '    {',
    '      "text": "Description of the action item",',
    '      "assignee": "Person responsible (if mentioned, otherwise omit)",',
    '      "due_date": "YYYY-MM-DD format (if mentioned or inferable, otherwise omit)",',
    '      "priority": "low | medium | high (based on urgency/importance)"',
    '    }',
    '  ]',
    '}',
    '',
    'Guidelines for the summary:',
    '- Start with a one-sentence overview of the meeting purpose',
    '- Group discussion points by topic using ## headings',
    '- Highlight decisions made, blockers raised, and next steps',
    '- Keep it concise but thorough - aim for 200-400 words',
    '- Use markdown formatting for readability',
    '',
    'Guidelines for action items:',
    '- Extract every actionable task, follow-up, or commitment mentioned',
    '- Assign priority based on context: deadlines soon or critical path = high, nice-to-have = low',
    '- If a speaker commits to doing something, they are the assignee',
    '- If a date or timeframe is mentioned ("by Friday", "next week"), convert to a YYYY-MM-DD date',
    '- Do not fabricate action items that were not discussed',
  ];

  if (rules.length > 0) {
    lines.push('');
    lines.push('Additional client-specific instructions (follow these carefully):');
    rules.forEach((rule, i) => {
      lines.push(`${i + 1}. [${rule.rule_type}] ${rule.rule_text}`);
    });
  }

  return lines.join('\n');
}

/**
 * Build the user message containing the transcript and optional Fathom summary.
 */
function buildUserMessage(
  transcript: FathomTranscriptEntry[],
  fathomSummary: string | null
): string {
  const parts: string[] = [];

  if (fathomSummary) {
    parts.push('## Fathom Auto-Summary (for reference)');
    parts.push(fathomSummary);
    parts.push('');
  }

  parts.push('## Full Transcript');

  const fullText = transcriptToText(transcript);
  if (fullText.length > MAX_TRANSCRIPT_CHARS) {
    parts.push(fullText.slice(0, MAX_TRANSCRIPT_CHARS));
    parts.push('\n[Transcript truncated due to length]');
  } else {
    parts.push(fullText);
  }

  parts.push('');
  parts.push('Analyze this meeting transcript and respond with the JSON format specified in your instructions.');

  return parts.join('\n');
}

/**
 * Parse JSON from the AI response, handling possible markdown code block wrapping.
 */
function parseAnalysisResponse(text: string): { summary: string; action_items: ActionItem[] } {
  let cleaned = text.trim();

  // Strip markdown code block wrappers if present
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  const parsed = JSON.parse(cleaned);

  // Validate structure
  if (typeof parsed.summary !== 'string') {
    throw new Error('Response missing "summary" string field');
  }
  if (!Array.isArray(parsed.action_items)) {
    throw new Error('Response missing "action_items" array field');
  }

  // Validate and clean action items
  const actionItems: ActionItem[] = parsed.action_items.map((item: Record<string, unknown>) => {
    if (typeof item.text !== 'string' || !item.text.trim()) {
      throw new Error('Action item missing "text" field');
    }

    const cleaned: ActionItem = { text: item.text.trim() };

    if (typeof item.assignee === 'string' && item.assignee.trim()) {
      cleaned.assignee = item.assignee.trim();
    }
    if (typeof item.due_date === 'string' && item.due_date.trim()) {
      cleaned.due_date = item.due_date.trim();
    }
    if (item.priority === 'low' || item.priority === 'medium' || item.priority === 'high') {
      cleaned.priority = item.priority;
    }

    return cleaned;
  });

  return {
    summary: parsed.summary,
    action_items: actionItems,
  };
}

/**
 * Analyze a Fathom meeting transcript using Claude Haiku.
 * Fetches client-specific and global AI rules to customize the analysis.
 * Updates the fathom_recordings row with results.
 */
export async function analyzeMeetingTranscript(params: {
  recordingId: string;
  transcript: FathomTranscriptEntry[];
  fathomSummary: string | null;
  clientId: string | null;
  supabase: SupabaseClient;
}): Promise<AnalysisResult> {
  const { recordingId, transcript, fathomSummary, clientId, supabase } = params;

  try {
    // 1. Fetch AI rules for this client (+ global rules)
    const rules = await fetchAIRules(supabase, clientId);

    // 2. Build prompts
    const systemPrompt = buildSystemPrompt(rules);
    const userMessage = buildUserMessage(transcript, fathomSummary);

    // 3. Call Claude Haiku
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const anthropic = new Anthropic({ apiKey });
    const startTime = Date.now();

    const response = await anthropic.messages.create({
      model: MODEL,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage },
      ],
    });

    // Log AI usage for cost tracking
    const latencyMs = Date.now() - startTime;
    try {
      await logUsage(supabase, {
        activity: 'fathom_analysis',
        provider: 'anthropic',
        modelId: MODEL,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latencyMs,
        status: 'success',
        metadata: { recording_id: recordingId, client_id: clientId },
      });
    } catch (logErr) {
      console.error('[fathom-analysis] Failed to log usage:', logErr);
    }

    // Extract text from response
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text content in Claude response');
    }

    // 4. Parse the JSON response
    const parsed = parseAnalysisResponse(textBlock.text);

    const result: AnalysisResult = {
      ai_summary: parsed.summary,
      ai_action_items: parsed.action_items,
    };

    // 5. Update the fathom_recordings row
    const { error: updateError } = await supabase
      .from('fathom_recordings')
      .update({
        ai_summary: result.ai_summary,
        ai_action_items: result.ai_action_items,
        processing_status: 'analyzed',
      })
      .eq('id', recordingId);

    if (updateError) {
      console.error(
        '[fathom-analysis] Failed to update recording',
        recordingId,
        ':',
        updateError.message
      );
      // Still return the result even if the DB update fails
    }

    console.log(
      '[fathom-analysis] Successfully analyzed recording',
      recordingId,
      '-',
      parsed.action_items.length,
      'action items extracted'
    );

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[fathom-analysis] Analysis failed for recording', recordingId, ':', message);

    // Update status to failed so it can be retried
    try {
      await supabase
        .from('fathom_recordings')
        .update({ processing_status: 'analysis_failed' })
        .eq('id', recordingId);
    } catch (statusError) {
      console.error('[fathom-analysis] Failed to update error status:', statusError);
    }

    throw error;
  }
}
