/**
 * AI Email Drafting Service
 *
 * Generates contextual emails using Claude with Halley's voice profile.
 * Each function produces a draft that can be reviewed before sending.
 *
 * Email types:
 *  - Initial response to inquiry
 *  - Follow-up when no response
 *  - Thank you after event
 *  - Payment reminder
 *  - Friendor (vendor partner) outreach
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { createAnthropicClient } from './providers';
import { resolveModelWithFallback } from './model-resolver';
import { logUsage } from './cost-tracker';
import { canMakeAICall } from './budget-checker';
import { getVoiceProfile } from './proposal-learner';
import type { AIActivity } from '../types';

interface EmailDraft {
  subject: string;
  body: string;
}

interface CardContext {
  title: string;
  description?: string | null;
  event_type?: string | null;
  event_date?: string | null;
  venue_name?: string | null;
  venue_city?: string | null;
  client_email?: string | null;
  estimated_value?: number | null;
}

// ---------------------------------------------------------------------------
// Core generation helper
// ---------------------------------------------------------------------------

async function generateEmail(
  supabase: SupabaseClient,
  userId: string,
  activity: AIActivity,
  systemPrompt: string,
  userPrompt: string,
  cardId?: string,
): Promise<EmailDraft | null> {
  const budgetCheck = await canMakeAICall(supabase, {
    provider: 'anthropic',
    activity,
    userId,
  });
  if (!budgetCheck.allowed) return null;

  const client = await createAnthropicClient(supabase);
  if (!client) return null;

  const modelConfig = await resolveModelWithFallback(supabase, activity);
  const voiceProfile = await getVoiceProfile(supabase);

  const voiceContext = voiceProfile
    ? `\n\nWRITING STYLE:
- Greeting: "${voiceProfile.greeting}"
- Sign-off: "${voiceProfile.signOff}"
- Tone: ${voiceProfile.toneDescriptors.join(', ')}
- Formality: ${voiceProfile.formality}
- Phrases she uses: ${voiceProfile.commonPhrases.join(', ')}`
    : '\n\nWrite in a warm, friendly, professional tone. Sign off as Halley.';

  const startTime = Date.now();
  try {
    const response = await client.messages.create({
      model: modelConfig.model_id,
      max_tokens: modelConfig.max_tokens,
      temperature: modelConfig.temperature,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt + voiceContext + '\n\nRespond as JSON: { "subject": "string", "body": "string" }',
    });

    const latencyMs = Date.now() - startTime;
    const textContent = response.content.find((c) => c.type === 'text');
    const text = textContent?.text || '';

    await logUsage(supabase, {
      userId,
      cardId,
      activity,
      provider: 'anthropic',
      modelId: modelConfig.model_id,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      latencyMs,
      status: 'success',
      metadata: { email_type: activity },
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]) as EmailDraft;
  } catch (err) {
    console.error(`[EmailDrafter] ${activity} failed:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Email Type Functions
// ---------------------------------------------------------------------------

/**
 * Draft an initial response to a new inquiry.
 */
export async function draftInitialResponse(
  supabase: SupabaseClient,
  userId: string,
  card: CardContext,
): Promise<EmailDraft | null> {
  const system = `You are Halley Foye, owner of Carolina Balloons. You're writing an initial response to a new balloon decor inquiry. Be warm, enthusiastic, and professional. Ask clarifying questions if info is missing. Mention that you'd love to help make their event special.`;

  const user = `New inquiry from: ${card.title}
Event type: ${card.event_type || 'Not specified'}
Event date: ${card.event_date ? new Date(card.event_date).toLocaleDateString() : 'Not specified'}
Venue: ${card.venue_name || 'Not specified'}${card.venue_city ? `, ${card.venue_city}` : ''}
Details: ${card.description || 'No additional details provided'}

Write an initial response email. If event type or date is missing, ask about it. If venue is missing, ask where the event will be held.`;

  return generateEmail(supabase, userId, 'email_draft', system, user);
}

/**
 * Draft a follow-up email when client hasn't responded.
 */
export async function draftFollowUpEmail(
  supabase: SupabaseClient,
  userId: string,
  card: CardContext,
  daysSinceLastContact: number,
): Promise<EmailDraft | null> {
  const system = `You are Halley Foye, owner of Carolina Balloons. You're writing a friendly follow-up to a client who hasn't responded to your previous message. Keep it short, warm, and not pushy. Mention that you're still available to help.`;

  const user = `Follow-up needed for: ${card.title}
Event type: ${card.event_type || 'Unknown'}
Event date: ${card.event_date ? new Date(card.event_date).toLocaleDateString() : 'Unknown'}
Days since last contact: ${daysSinceLastContact}
Estimated value: ${card.estimated_value ? `$${card.estimated_value}` : 'Unknown'}

Write a gentle follow-up email. ${daysSinceLastContact > 7 ? "It's been over a week, so keep it especially brief and friendly." : ''}`;

  return generateEmail(supabase, userId, 'follow_up_draft', system, user);
}

/**
 * Draft a thank you email after the event.
 */
export async function draftThankYouEmail(
  supabase: SupabaseClient,
  userId: string,
  card: CardContext,
): Promise<EmailDraft | null> {
  const system = `You are Halley Foye, owner of Carolina Balloons. You're writing a thank-you email after completing a balloon decor event. Be genuinely grateful. Mention you'd love to work with them again and ask for a review/referral.`;

  const user = `Thank you email for: ${card.title}
Event type: ${card.event_type || 'event'}
Venue: ${card.venue_name || 'their venue'}

Write a warm thank-you email. Ask if they'd consider leaving a Google review and mention you'd love to help with future events.`;

  return generateEmail(supabase, userId, 'email_draft', system, user);
}

/**
 * Draft a payment reminder email.
 */
export async function draftPaymentReminder(
  supabase: SupabaseClient,
  userId: string,
  card: CardContext,
  daysUntilEvent: number,
  reminderNumber: number,
): Promise<EmailDraft | null> {
  const system = `You are Halley Foye, owner of Carolina Balloons. You're writing a payment reminder. Be professional but firm. The payment is required before the event. ${reminderNumber >= 3 ? 'This is the final reminder — be direct about the consequences.' : 'Keep it friendly.'}`;

  const urgency = reminderNumber === 1
    ? 'first gentle reminder'
    : reminderNumber === 2
    ? 'second reminder, slightly more urgent'
    : 'final reminder — event is approaching and payment is required';

  const user = `Payment reminder for: ${card.title}
Event date: ${card.event_date ? new Date(card.event_date).toLocaleDateString() : 'upcoming'}
Days until event: ${daysUntilEvent}
Amount: ${card.estimated_value ? `$${card.estimated_value}` : 'the invoice amount'}
Reminder #: ${reminderNumber} (${urgency})

Write a payment reminder email appropriate for this stage.`;

  return generateEmail(supabase, userId, 'email_draft', system, user);
}

/**
 * Draft a friendor (venue partner) outreach email.
 */
export async function draftFriendorEmail(
  supabase: SupabaseClient,
  userId: string,
  venueName: string,
  venueContactName?: string,
  venueCity?: string,
): Promise<EmailDraft | null> {
  const system = `You are Halley Foye, owner of Carolina Balloons. You're writing an outreach email to a venue to establish a vendor partnership (called "friendor" — friendly vendor). You want to introduce your balloon decor services and build a relationship. Be professional, warm, and mention specific ways you can add value to their events.`;

  const user = `Friendor outreach to: ${venueName}
${venueContactName ? `Contact: ${venueContactName}` : ''}
${venueCity ? `Location: ${venueCity}` : ''}

Write an introduction email proposing a vendor partnership. Mention your services, that you serve the area, and offer to provide a complimentary consultation or portfolio viewing.`;

  return generateEmail(supabase, userId, 'friendor_email', system, user);
}
