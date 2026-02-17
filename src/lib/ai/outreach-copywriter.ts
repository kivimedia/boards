/**
 * Outreach Copywriter - Generates personalized outreach emails using AI.
 *
 * Ported from the local podcast outreach agent's copywriter.py.
 * Uses validated dossier data to generate emails that are:
 * - Personalized with verified facts
 * - Under 180 words (target: 100-150)
 * - Free of filler phrases and em dashes
 * - Include a booking link
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { createAnthropicClient } from './providers';
import { calculateCost, logUsage } from './cost-tracker';
import { validateCopy } from './dossier-validator';
import type { PersonalizationElement, ResearchDossier, ToneProfile } from './research-dossier';
import type { PGACandidate } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface OutreachEmail {
  subject: string;
  body: string;
  touch_number: number;
  tokens_used: number;
  cost_usd: number;
  validation: {
    passed: boolean;
    issues: string[];
  };
}

export interface OutreachConfig {
  sender_name: string;
  sender_title: string;
  podcast_name: string;
  booking_url: string;
  reply_to_email: string;
  /** Override for specific campaign messaging */
  campaign_context?: string;
}

// ============================================================================
// EMAIL GENERATION
// ============================================================================

/**
 * Generate a personalized outreach email for a candidate.
 */
export async function generateOutreachEmail(
  supabase: SupabaseClient,
  candidate: PGACandidate,
  dossier: ResearchDossier,
  config: OutreachConfig,
  options?: {
    touchNumber?: number;
    previousEmails?: Array<{ subject: string; body: string; touch_number: number }>;
    runId?: string;
    userId?: string;
  }
): Promise<OutreachEmail> {
  const startTime = Date.now();
  const touchNumber = options?.touchNumber ?? 1;
  const modelId = 'claude-sonnet-4-5-20250929';

  const client = await createAnthropicClient(supabase);
  if (!client) {
    throw new Error('Anthropic API key not configured.');
  }

  // Filter to verified elements only
  const verifiedElements = dossier.personalization_elements.filter(
    (e) => e.verification_status === 'verified' || e.verification_status === 'unverified'
  );

  const prompt = buildGenerationPrompt(
    candidate,
    verifiedElements,
    dossier.tone_profile,
    dossier.story_angle,
    dossier.potential_hooks,
    dossier.red_flags,
    config,
    touchNumber,
    options?.previousEmails
  );

  const response = await client.messages.create({
    model: modelId,
    max_tokens: 2048,
    system: COPYWRITER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const inputTokens = response.usage?.input_tokens || 0;
  const outputTokens = response.usage?.output_tokens || 0;
  const totalTokens = inputTokens + outputTokens;
  const cost = calculateCost('anthropic', modelId, inputTokens, outputTokens);

  // Extract the email from Claude's response
  let rawOutput = '';
  for (const block of response.content) {
    if (block.type === 'text') rawOutput += block.text;
  }

  const { subject, body } = parseEmailOutput(rawOutput);

  // Validate the generated copy
  const validation = validateCopy(
    body,
    dossier.personalization_elements,
    config.booking_url
  );

  // Log cost
  if (options?.runId) {
    await supabase.from('pga_scout_costs').insert({
      run_id: options.runId,
      service: 'anthropic',
      operation: 'email_generation',
      credits_used: totalTokens,
      cost_usd: cost,
      candidate_name: candidate.name,
      candidate_id: candidate.id,
    });
  }

  if (options?.userId) {
    await logUsage(supabase, {
      userId: options.userId,
      activity: 'email_draft',
      provider: 'anthropic',
      modelId,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startTime,
      status: 'success',
      metadata: {
        agent_type: 'outreach-copywriter',
        candidate_name: candidate.name,
        touch_number: touchNumber,
        run_id: options.runId,
      },
    });
  }

  return {
    subject,
    body,
    touch_number: touchNumber,
    tokens_used: totalTokens,
    cost_usd: cost,
    validation: {
      passed: validation.passed,
      issues: validation.issues,
    },
  };
}

/**
 * Save a generated outreach email to the database.
 */
export async function saveOutreachEmail(
  supabase: SupabaseClient,
  candidateId: string,
  dossierId: string | null,
  email: OutreachEmail,
  generationPrompt: string,
  options?: { runId?: string; userId?: string }
): Promise<string | null> {
  const { data, error } = await supabase
    .from('pga_outreach_runs')
    .insert({
      candidate_id: candidateId,
      dossier_id: dossierId,
      run_id: options?.runId || null,
      touch_number: email.touch_number,
      subject: email.subject,
      body: email.body,
      generation_prompt: generationPrompt,
      copy_validation: email.validation,
      send_status: 'draft',
      tokens_used: email.tokens_used,
      cost_usd: email.cost_usd,
      created_by: options?.userId || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to save outreach email:', error);
    return null;
  }

  return data?.id || null;
}

// ============================================================================
// PROMPTS
// ============================================================================

const COPYWRITER_SYSTEM_PROMPT = `You are an expert cold email copywriter for podcast guest outreach.

RULES:
1. MAX 150 words (hard limit: 180). Short emails get replies.
2. NO filler phrases: game-changer, invaluable, next level, truly inspiring, incredible journey, blown away, phenomenal, groundbreaking, revolutionary, it would be an honor, etc.
3. NO em dashes. Use commas or periods instead.
4. Every personalization MUST come from the provided dossier facts. Never make up details.
5. Sound like a human, not a marketing bot. Be conversational and specific.
6. Include a clear CTA with the booking link.
7. Subject line: 5-8 words, curiosity-driven, no clickbait.
8. Sign off with the sender's name and title.
9. First sentence should reference something SPECIFIC about the person (from the dossier).
10. Don't use "I" in the first sentence. Lead with them.

OUTPUT FORMAT:
SUBJECT: [your subject line]
BODY:
[your email body]`;

function buildGenerationPrompt(
  candidate: PGACandidate,
  verifiedElements: PersonalizationElement[],
  toneProfile: ToneProfile,
  storyAngle: string,
  hooks: string[],
  redFlags: string[],
  config: OutreachConfig,
  touchNumber: number,
  previousEmails?: Array<{ subject: string; body: string; touch_number: number }>
): string {
  const elementsText = verifiedElements
    .map(
      (e, i) =>
        `  ${i + 1}. [${e.source_type}] ${e.fact}\n     Quote: "${e.screenshot_or_quote}"\n     Source: ${e.source_url}`
    )
    .join('\n');

  const toneText = toneProfile
    ? `- Style: ${toneProfile.communication_style}
- Topics they like: ${(toneProfile.favorite_topics || []).join(', ')}
- Formality: ${toneProfile.formality}
- Humor: ${toneProfile.humor_level}`
    : 'No tone data available';

  const hooksText = hooks.length > 0
    ? hooks.map((h, i) => `  ${i + 1}. ${h}`).join('\n')
    : 'No specific hooks available';

  const redFlagsText = redFlags.length > 0
    ? redFlags.map((r) => `  - ${r}`).join('\n')
    : 'None';

  let touchContext = '';
  if (touchNumber === 1) {
    touchContext = `This is the INITIAL outreach (Touch 1). Make a strong first impression.`;
  } else if (touchNumber === 2) {
    touchContext = `This is FOLLOW-UP #1 (Touch 2). Reference that you reached out before. Be shorter (80-100 words). Add new value or a different angle.`;
    if (previousEmails?.length) {
      touchContext += `\n\nPrevious email subject: "${previousEmails[0].subject}"`;
    }
  } else if (touchNumber === 3) {
    touchContext = `This is FINAL FOLLOW-UP (Touch 3). Be very brief (60-80 words). Create gentle urgency. This is the last touch.`;
    if (previousEmails?.length) {
      touchContext += `\n\nPrevious subjects: ${previousEmails.map((e) => `"${e.subject}"`).join(', ')}`;
    }
  }

  return `Generate a ${touchNumber === 1 ? 'cold outreach' : 'follow-up'} email for a podcast guest invitation.

CANDIDATE:
- Name: ${candidate.name}
- Role: ${candidate.one_liner || 'Unknown'}
- Location: ${candidate.location || 'Unknown'}
- Tools: ${(candidate.tools_used || []).join(', ') || 'AI coding tools'}

VERIFIED PERSONALIZATION FACTS:
${elementsText || '  (No verified facts available - use general approach)'}

TONE PROFILE:
${toneText}

STORY ANGLE:
${storyAngle || 'No specific angle - use general podcast guest invitation'}

POTENTIAL HOOKS:
${hooksText}

RED FLAGS (avoid mentioning):
${redFlagsText}

SENDER:
- Name: ${config.sender_name}
- Title: ${config.sender_title}
- Podcast: ${config.podcast_name}
- Booking link: ${config.booking_url}

TOUCH: ${touchContext}
${config.campaign_context ? `\nCAMPAIGN CONTEXT: ${config.campaign_context}` : ''}

Write the email now. Remember: max 150 words, no filler, specific personalization from the dossier.`;
}

// ============================================================================
// PARSING
// ============================================================================

function parseEmailOutput(text: string): { subject: string; body: string } {
  // Try to extract SUBJECT: and BODY: format
  const subjectMatch = text.match(/SUBJECT:\s*(.+?)(?:\n|$)/i);
  const bodyMatch = text.match(/BODY:\s*\n([\s\S]+)/i);

  if (subjectMatch && bodyMatch) {
    return {
      subject: subjectMatch[1].trim(),
      body: bodyMatch[1].trim(),
    };
  }

  // Fallback: first line is subject, rest is body
  const lines = text.trim().split('\n');
  if (lines.length >= 2) {
    return {
      subject: lines[0].replace(/^(Subject:|Re:|Fwd:)\s*/i, '').trim(),
      body: lines.slice(1).join('\n').trim(),
    };
  }

  return {
    subject: 'Podcast Guest Invitation',
    body: text.trim(),
  };
}
