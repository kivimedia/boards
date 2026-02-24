/**
 * AI Proposal Generation Engine
 *
 * Generates proposal drafts for leads based on:
 * 1. Learned patterns from historical proposals
 * 2. Pricing rules (mileage, minimums, location premiums)
 * 3. Product catalog with base prices
 * 4. Halley's email voice profile
 *
 * Each draft gets a confidence tier:
 *  - no_brainer: high-confidence match, can be auto-sent after quick review
 *  - suggested: good match, needs owner review
 *  - needs_human: low confidence or missing data, requires manual creation
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { createAnthropicClient } from './providers';
import { resolveModelWithFallback } from './model-resolver';
import { logUsage } from './cost-tracker';
import { canMakeAICall } from './budget-checker';
import { getVoiceProfile, VoiceProfile } from './proposal-learner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProposalLineItem {
  product: string;
  category: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes: string | null;
}

export interface GeneratedProposal {
  cardId: string;
  patternId: string | null;
  confidenceTier: 'no_brainer' | 'suggested' | 'needs_human';
  lineItems: ProposalLineItem[];
  totalAmount: number;
  emailSubject: string;
  emailBody: string;
  reasoning: string;
}

interface CardData {
  id: string;
  title: string;
  description: string | null;
  event_type: string | null;
  event_date: string | null;
  venue_name: string | null;
  venue_city: string | null;
  estimated_value: number | null;
  client_email: string | null;
  client_phone: string | null;
}

interface PatternMatch {
  patternId: string;
  name: string;
  confidence: number;
  eventTypes: string[];
  products: string[];
  priceMin: number;
  priceMax: number;
  isNoBrainer: boolean;
}

interface PricingRule {
  id: string;
  name: string;
  rule_type: string;
  conditions: Record<string, unknown>;
  value: number;
  formula: string | null;
  priority: number;
}

interface ProductCatalogItem {
  id: string;
  name: string;
  category: string;
  base_price: number | null;
  size_variants: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Main Generation
// ---------------------------------------------------------------------------

/**
 * Generate a proposal draft for a card.
 * Returns the generated proposal or null if generation fails.
 */
export async function generateProposal(
  supabase: SupabaseClient,
  cardId: string,
  userId: string,
): Promise<GeneratedProposal | null> {
  // 1. Fetch card data
  const { data: card } = await supabase
    .from('cards')
    .select('id, title, description, event_type, event_date, venue_name, venue_city, estimated_value, client_email, client_phone')
    .eq('id', cardId)
    .single();

  if (!card) return null;

  // 2. Check budget
  const budgetCheck = await canMakeAICall(supabase, {
    provider: 'anthropic',
    activity: 'proposal_generation',
    userId,
  });
  if (!budgetCheck.allowed) return null;

  // 3. Match to patterns
  const match = await matchToPattern(supabase, card as CardData);

  // 4. Fetch pricing rules
  const { data: pricingRules } = await supabase
    .from('pricing_rules')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: true });

  // 5. Fetch product catalog
  const { data: products } = await supabase
    .from('product_catalog')
    .select('*')
    .eq('is_active', true);

  // 6. Get voice profile
  const voiceProfile = await getVoiceProfile(supabase);

  // 7. Calculate pricing
  const lineItems = calculateProposalPricing(
    match,
    card as CardData,
    (products || []) as ProductCatalogItem[],
    (pricingRules || []) as PricingRule[],
  );

  // 8. Determine confidence tier
  const confidenceTier = determineConfidenceTier(match, card as CardData, lineItems);

  // 9. Generate email via AI
  const email = await generateProposalEmail(
    supabase,
    userId,
    card as CardData,
    lineItems,
    match,
    voiceProfile,
  );

  if (!email) return null;

  const totalAmount = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);

  // 10. Save draft to database
  const draft: GeneratedProposal = {
    cardId,
    patternId: match?.patternId || null,
    confidenceTier,
    lineItems,
    totalAmount,
    emailSubject: email.subject,
    emailBody: email.body,
    reasoning: email.reasoning,
  };

  await supabase.from('proposal_drafts').insert({
    card_id: cardId,
    pattern_id: match?.patternId || null,
    confidence_tier: confidenceTier,
    line_items: lineItems,
    total_amount: totalAmount,
    email_subject: email.subject,
    email_body: email.body,
    status: 'draft',
    modifications: { reasoning: email.reasoning },
  });

  return draft;
}

// ---------------------------------------------------------------------------
// Pattern Matching
// ---------------------------------------------------------------------------

async function matchToPattern(
  supabase: SupabaseClient,
  card: CardData,
): Promise<PatternMatch | null> {
  const { data: patterns } = await supabase
    .from('proposal_patterns')
    .select('*')
    .eq('is_active', true)
    .neq('name', '__voice_profile__');

  if (!patterns || patterns.length === 0) return null;

  let bestMatch: PatternMatch | null = null;
  let bestScore = 0;

  const cardText = `${card.title} ${card.description || ''} ${card.event_type || ''}`.toLowerCase();

  for (const pattern of patterns) {
    let score = 0;

    // Event type match
    const eventTypes = (pattern.event_types as string[]) || [];
    if (card.event_type && eventTypes.includes(card.event_type.toLowerCase())) {
      score += 0.4;
    }

    // Keyword match
    const keywords = (pattern.match_keywords as string[]) || [];
    const matchedKeywords = keywords.filter((kw) => cardText.includes(kw.toLowerCase()));
    if (keywords.length > 0) {
      score += 0.3 * (matchedKeywords.length / keywords.length);
    }

    // Price range match (if estimated value is provided)
    if (card.estimated_value && pattern.typical_price_min && pattern.typical_price_max) {
      const inRange =
        card.estimated_value >= pattern.typical_price_min * 0.7 &&
        card.estimated_value <= pattern.typical_price_max * 1.3;
      if (inRange) score += 0.2;
    }

    // Historical reliability bonus
    if (pattern.is_no_brainer) score += 0.1;

    if (score > bestScore && score >= (pattern.confidence_threshold || 0.3)) {
      bestScore = score;
      bestMatch = {
        patternId: pattern.id,
        name: pattern.name,
        confidence: score,
        eventTypes: pattern.event_types as string[],
        products: pattern.products as string[],
        priceMin: pattern.typical_price_min,
        priceMax: pattern.typical_price_max,
        isNoBrainer: pattern.is_no_brainer,
      };
    }
  }

  return bestMatch;
}

// ---------------------------------------------------------------------------
// Pricing Calculation
// ---------------------------------------------------------------------------

function calculateProposalPricing(
  match: PatternMatch | null,
  card: CardData,
  catalog: ProductCatalogItem[],
  rules: PricingRule[],
): ProposalLineItem[] {
  const lineItems: ProposalLineItem[] = [];

  // Start with products from the pattern match
  const productNames = match?.products || [];

  for (const productName of productNames) {
    const catalogItem = catalog.find(
      (p) => p.name.toLowerCase() === productName.toLowerCase(),
    );

    const basePrice = catalogItem?.base_price || 0;
    const category = catalogItem?.category || 'other';

    // Apply product-specific pricing rules
    let adjustedPrice = basePrice;
    for (const rule of rules) {
      if (rule.rule_type === 'product_price') {
        const conditions = rule.conditions as { product_name?: string; category?: string };
        if (
          conditions.product_name?.toLowerCase() === productName.toLowerCase() ||
          conditions.category === category
        ) {
          adjustedPrice = rule.value;
        }
      }
    }

    lineItems.push({
      product: catalogItem?.name || productName,
      category,
      quantity: 1,
      unitPrice: adjustedPrice,
      totalPrice: adjustedPrice,
      notes: null,
    });
  }

  // Apply location/mileage surcharges
  for (const rule of rules) {
    if (rule.rule_type === 'mileage_surcharge' && card.venue_city) {
      const conditions = rule.conditions as { cities?: string[] };
      if (conditions.cities?.some((c) => c.toLowerCase() === card.venue_city?.toLowerCase())) {
        lineItems.push({
          product: 'Delivery/Setup Fee',
          category: 'other',
          quantity: 1,
          unitPrice: rule.value,
          totalPrice: rule.value,
          notes: `Mileage surcharge for ${card.venue_city}`,
        });
      }
    }

    if (rule.rule_type === 'location_premium' && card.venue_name) {
      const conditions = rule.conditions as { venue_names?: string[] };
      if (conditions.venue_names?.some((v) => v.toLowerCase() === card.venue_name?.toLowerCase())) {
        lineItems.push({
          product: 'Venue Setup Premium',
          category: 'other',
          quantity: 1,
          unitPrice: rule.value,
          totalPrice: rule.value,
          notes: `Premium for ${card.venue_name}`,
        });
      }
    }
  }

  // Apply minimum charge if total is below threshold
  const subtotal = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
  for (const rule of rules) {
    if (rule.rule_type === 'minimum_charge' && subtotal > 0 && subtotal < rule.value) {
      // Adjust the first line item to meet minimum
      const diff = rule.value - subtotal;
      if (lineItems.length > 0) {
        lineItems[0].totalPrice += diff;
        lineItems[0].notes = (lineItems[0].notes || '') + ` (adjusted to meet $${rule.value} minimum)`;
      }
    }
  }

  return lineItems;
}

// ---------------------------------------------------------------------------
// Confidence Tier
// ---------------------------------------------------------------------------

function determineConfidenceTier(
  match: PatternMatch | null,
  card: CardData,
  lineItems: ProposalLineItem[],
): 'no_brainer' | 'suggested' | 'needs_human' {
  // No pattern match → needs human
  if (!match) return 'needs_human';

  // Missing critical data → needs human
  if (!card.event_type && !card.event_date) return 'needs_human';
  if (lineItems.length === 0) return 'needs_human';

  // High confidence + no-brainer pattern → no_brainer
  if (match.isNoBrainer && match.confidence >= 0.7) return 'no_brainer';

  // Decent confidence → suggested
  if (match.confidence >= 0.5) return 'suggested';

  return 'needs_human';
}

// ---------------------------------------------------------------------------
// Email Generation
// ---------------------------------------------------------------------------

async function generateProposalEmail(
  supabase: SupabaseClient,
  userId: string,
  card: CardData,
  lineItems: ProposalLineItem[],
  match: PatternMatch | null,
  voiceProfile: VoiceProfile | null,
): Promise<{ subject: string; body: string; reasoning: string } | null> {
  const client = await createAnthropicClient(supabase);
  if (!client) return null;

  const modelConfig = await resolveModelWithFallback(supabase, 'proposal_generation');

  const totalAmount = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);

  const voiceInstructions = voiceProfile
    ? `
VOICE PROFILE:
- Greeting style: "${voiceProfile.greeting}"
- Sign-off: "${voiceProfile.signOff}"
- Tone: ${voiceProfile.toneDescriptors.join(', ')}
- Formality: ${voiceProfile.formality}
- Common phrases to use: ${voiceProfile.commonPhrases.join(', ')}
- Example snippets of her voice:
${voiceProfile.sampleSnippets.map((s) => `  "${s}"`).join('\n')}
`
    : `
VOICE GUIDANCE:
- Write in a warm, friendly, professional tone
- Use a casual-but-competent style appropriate for a small business owner
- Be enthusiastic about the event without being over-the-top
`;

  const prompt = `Generate a proposal email for a balloon decor inquiry.

CLIENT INFO:
- Name: ${card.title}
- Event type: ${card.event_type || 'Not specified'}
- Event date: ${card.event_date || 'Not specified'}
- Venue: ${card.venue_name || 'Not specified'}${card.venue_city ? `, ${card.venue_city}` : ''}

LINE ITEMS:
${lineItems.map((item) => `- ${item.product} (${item.category}): $${item.totalPrice}${item.notes ? ` — ${item.notes}` : ''}`).join('\n')}

TOTAL: $${totalAmount}

${match ? `PATTERN MATCH: "${match.name}" (confidence: ${(match.confidence * 100).toFixed(0)}%)` : 'NO PATTERN MATCH — generate a general proposal email'}

${voiceInstructions}

Generate:
1. Email subject line
2. Email body (include line items as a simple list, total, and deposit/payment info)
3. Brief reasoning for the proposal approach

Respond as JSON:
{
  "subject": "string",
  "body": "string",
  "reasoning": "string"
}`;

  const startTime = Date.now();
  try {
    const response = await client.messages.create({
      model: modelConfig.model_id,
      max_tokens: modelConfig.max_tokens,
      temperature: 0.6,
      messages: [{ role: 'user', content: prompt }],
      system: 'You write proposal emails for Carolina Balloons, a balloon decor business. The owner is Halley Foye. Write emails that sound like her — warm, professional, and enthusiastic about creating beautiful balloon experiences. Return valid JSON only.',
    });

    const latencyMs = Date.now() - startTime;
    const textContent = response.content.find((c) => c.type === 'text');
    const text = textContent?.text || '';

    await logUsage(supabase, {
      userId,
      cardId: card.id,
      activity: 'proposal_generation',
      provider: 'anthropic',
      modelId: modelConfig.model_id,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      latencyMs,
      status: 'success',
      metadata: {
        step: 'generate_email',
        confidenceTier: determineConfidenceTier(match, card, lineItems),
        patternName: match?.name,
      },
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]) as { subject: string; body: string; reasoning: string };
  } catch (err) {
    console.error('[ProposalGenerator] Email generation failed:', err);
    return null;
  }
}

/**
 * Recalculate pricing for a proposal after line items are manually edited.
 */
export function recalculateTotal(lineItems: ProposalLineItem[]): number {
  return lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
}
