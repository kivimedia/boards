/**
 * Message Personalizer - Claude-powered outreach message customization
 *
 * Takes a template + lead research dossier and generates a personalized
 * message using Claude Haiku, maintaining Ziv's casual voice.
 * Falls back to template interpolation if AI fails or quality check blocks.
 */

import Anthropic from '@anthropic-ai/sdk';
import { SupabaseClient } from '@supabase/supabase-js';
import { getProviderKey, touchApiKey } from '../ai/providers';
import { extractVariables, interpolate } from './template-engine';
import { checkMessageQuality, type QualityCheckResult } from './message-quality';
import type { LILead, LITemplate, LIResearchDossier, OrchestratorCallbacks } from '../types';

const PERSONALIZE_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;

// Haiku cost per 1K tokens
const INPUT_COST_PER_1K = 0.0008;
const OUTPUT_COST_PER_1K = 0.004;

// ============================================================================
// SYSTEM PROMPT - Ziv's voice
// ============================================================================

const PERSONALIZE_SYSTEM_PROMPT = `You personalize LinkedIn outreach messages. You receive a base message and research about the recipient, and you weave in 1-2 personal touches.

Rules:
- Keep Ziv's casual, friendly tone. He sounds like a real person, not a marketer.
- NEVER use: "game-changer", "invaluable", "next level", "innovative", "leverage", "synergy", "paradigm", "cutting-edge", "world-class", "thought leader", or any corporate buzzword.
- NEVER use em dashes or double dashes. Use a single dash - like this.
- Reference ONE specific thing from their work (a show, website feature, recent event, unique offering).
- Keep it SHORT. Stay under the character limit provided.
- Don't rewrite the whole message. Just weave in 1-2 natural personal touches.
- The result must sound like it was typed by a real person in 30 seconds, not crafted by AI.
- Sign off as "Ziv" if the template ends with a sign-off.
- Return ONLY the personalized message text. No explanation, no quotes.`;

// ============================================================================
// TYPES
// ============================================================================

export interface PersonalizationResult {
  original_template: string;
  personalized_message: string;
  quality_check: QualityCheckResult;
  talking_points_used: string[];
  cost_usd: number;
  model_used: string;
  was_personalized: boolean;
}

// ============================================================================
// MAIN EXPORTS
// ============================================================================

export async function personalizeMessage(
  supabase: SupabaseClient,
  lead: LILead,
  template: LITemplate,
  dossier: LIResearchDossier | null,
  callbacks?: OrchestratorCallbacks
): Promise<PersonalizationResult> {
  // Step 1: Interpolate the base template
  const variables = extractVariables(lead);
  const baseMessage = interpolate(template.template_text, variables);

  // If no dossier, just return the interpolated template
  if (!dossier || dossier.talking_points.length === 0) {
    const quality = checkMessageQuality(baseMessage, template);
    return {
      original_template: baseMessage,
      personalized_message: baseMessage,
      quality_check: quality,
      talking_points_used: [],
      cost_usd: 0,
      model_used: 'none',
      was_personalized: false,
    };
  }

  // Step 2: Try Claude personalization
  const apiKey = await getProviderKey(supabase, 'anthropic');
  if (!apiKey) {
    const quality = checkMessageQuality(baseMessage, template);
    return {
      original_template: baseMessage,
      personalized_message: baseMessage,
      quality_check: quality,
      talking_points_used: [],
      cost_usd: 0,
      model_used: 'none',
      was_personalized: false,
    };
  }

  const client = new Anthropic({ apiKey });
  await touchApiKey(supabase, 'anthropic');

  const maxLength = template.max_length || 2000;

  const userPrompt = [
    `Base message (${maxLength} char max):`,
    baseMessage,
    '',
    'About the recipient:',
    `- Name: ${lead.full_name}`,
    lead.job_position ? `- Role: ${lead.job_position}` : '',
    lead.company_name ? `- Company: ${lead.company_name}` : '',
    '',
    'Talking points (pick ONE to weave in):',
    ...dossier.talking_points.map((tp, i) => `${i + 1}. ${tp}`),
    '',
    dossier.portfolio_highlights.length > 0
      ? `Portfolio highlights: ${dossier.portfolio_highlights.join(', ')}`
      : '',
    '',
    `Character limit: ${maxLength}`,
    'Return ONLY the personalized message.',
  ].filter(Boolean).join('\n');

  try {
    const response = await client.messages.create({
      model: PERSONALIZE_MODEL,
      max_tokens: MAX_TOKENS,
      system: PERSONALIZE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    // Calculate cost
    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;
    const costUsd = (inputTokens / 1000) * INPUT_COST_PER_1K + (outputTokens / 1000) * OUTPUT_COST_PER_1K;

    // Log cost
    await supabase.from('li_cost_events').insert({
      user_id: lead.user_id,
      lead_id: lead.id,
      service_name: 'anthropic',
      operation: 'personalize_message',
      credits_used: inputTokens + outputTokens,
      cost_usd: costUsd,
      success: true,
    });

    callbacks?.onCostEvent?.({
      service_name: 'anthropic',
      operation: 'personalize_message',
      cost_usd: costUsd,
    });

    // Extract personalized text
    let personalizedText = '';
    for (const block of response.content) {
      if (block.type === 'text') personalizedText += block.text;
    }
    personalizedText = personalizedText.trim();

    // Step 3: Quality check the personalized message
    const quality = checkMessageQuality(personalizedText, template);

    if (!quality.passed && quality.hardBlocks.length > 0) {
      // Hard block - fall back to base template
      callbacks?.onProgress?.(`Personalization for ${lead.full_name} had quality issues, using base template`);
      const baseQuality = checkMessageQuality(baseMessage, template);
      return {
        original_template: baseMessage,
        personalized_message: baseMessage,
        quality_check: baseQuality,
        talking_points_used: [],
        cost_usd: costUsd,
        model_used: PERSONALIZE_MODEL,
        was_personalized: false,
      };
    }

    // Figure out which talking points were used (rough match)
    const usedPoints = dossier.talking_points.filter(tp => {
      const words = tp.toLowerCase().split(/\s+/).slice(0, 3);
      return words.some(w => w.length > 4 && personalizedText.toLowerCase().includes(w));
    });

    return {
      original_template: baseMessage,
      personalized_message: personalizedText,
      quality_check: quality,
      talking_points_used: usedPoints,
      cost_usd: costUsd,
      model_used: PERSONALIZE_MODEL,
      was_personalized: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';

    await supabase.from('li_cost_events').insert({
      user_id: lead.user_id,
      lead_id: lead.id,
      service_name: 'anthropic',
      operation: 'personalize_message',
      credits_used: 0,
      cost_usd: 0,
      success: false,
      error_message: msg,
    });

    // Fall back to base template
    callbacks?.onProgress?.(`Personalization failed for ${lead.full_name}: ${msg}`);
    const quality = checkMessageQuality(baseMessage, template);
    return {
      original_template: baseMessage,
      personalized_message: baseMessage,
      quality_check: quality,
      talking_points_used: [],
      cost_usd: 0,
      model_used: 'none',
      was_personalized: false,
    };
  }
}

export async function personalizeMessageBatch(
  supabase: SupabaseClient,
  userId: string,
  payload: { lead_ids: string[]; template_ids?: string[] },
  callbacks?: OrchestratorCallbacks
): Promise<{ personalized: number; fell_back: number; failed: number; total_cost_usd: number }> {
  let personalized = 0;
  let fellBack = 0;
  let failed = 0;
  let totalCost = 0;

  // Fetch leads with their enrichment data
  const { data: leads } = await supabase
    .from('li_leads')
    .select('*')
    .in('id', payload.lead_ids)
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (!leads?.length) return { personalized: 0, fell_back: 0, failed: 0, total_cost_usd: 0 };

  // Fetch active templates
  const { data: templates } = await supabase
    .from('li_templates')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!templates?.length) return { personalized: 0, fell_back: 0, failed: 0, total_cost_usd: 0 };

  for (const lead of leads) {
    // Find the right template for this lead's stage
    const template = templates.find(
      t => t.stage === lead.pipeline_stage && t.variant === (lead.template_variant || 'A')
    );
    if (!template) continue;

    // Get research dossier from enrichment_data
    const enrichData = (lead.enrichment_data || {}) as Record<string, unknown>;
    const dossier = (enrichData.research_dossier as LIResearchDossier) || null;

    try {
      const result = await personalizeMessage(supabase, lead, template, dossier, callbacks);
      totalCost += result.cost_usd;

      if (result.was_personalized) {
        personalized++;
      } else {
        fellBack++;
      }

      // Update the outreach message if one exists for this lead
      await supabase
        .from('li_outreach_messages')
        .update({
          message_text: result.personalized_message,
          quality_check: result.quality_check,
          quality_passed: result.quality_check.passed,
        })
        .eq('lead_id', lead.id)
        .eq('status', 'draft');

      // 500ms delay between personalization calls
      await new Promise(r => setTimeout(r, 500));
    } catch {
      failed++;
    }
  }

  return { personalized, fell_back: fellBack, failed, total_cost_usd: totalCost };
}
