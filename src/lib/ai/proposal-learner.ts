/**
 * Proposal Learning Pipeline
 *
 * Analyses Halley's historical proposals to build:
 * 1. Proposal patterns (event type + product combos that recur)
 * 2. Product catalog entries (deduplicated, with price ranges)
 * 3. Email voice profile (writing style characteristics)
 *
 * Data sources:
 *  - Cards that reached "Proposal Sent" / "Invoice Sent" / "Paid in Full" lists
 *  - Gmail sent emails matching client email addresses
 *  - PDF attachments from those emails (parsed by Claude)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { createAnthropicClient } from './providers';
import { resolveModelWithFallback } from './model-resolver';
import { logUsage } from './cost-tracker';
import { canMakeAICall } from './budget-checker';
import { searchSentEmails, getMessage, getAttachment, extractTextBody } from '../google/gmail';
import { getValidAccessToken } from '../google/token-manager';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LearningProgress {
  step: string;
  current: number;
  total: number;
  message: string;
}

export interface ExtractedProposal {
  cardId: string;
  clientName: string;
  clientEmail: string | null;
  eventType: string | null;
  eventDate: string | null;
  products: ExtractedLineItem[];
  totalAmount: number | null;
  emailBody: string | null;
  pdfContent: string | null;
  source: 'email_body' | 'pdf_attachment' | 'card_data';
}

export interface ExtractedLineItem {
  product: string;
  category: string | null;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  notes: string | null;
}

export interface LearnedPattern {
  name: string;
  eventTypes: string[];
  products: string[];
  typicalPriceMin: number;
  typicalPriceMax: number;
  matchKeywords: string[];
  confidenceThreshold: number;
  isNoBrainer: boolean;
  createdFromCount: number;
}

export interface VoiceProfile {
  greeting: string;
  signOff: string;
  toneDescriptors: string[];
  commonPhrases: string[];
  formality: 'casual' | 'semi_formal' | 'formal';
  sampleSnippets: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROPOSAL_LIST_NAMES = [
  'Proposal/Pricing Sent',
  'Invoice Sent',
  'Paid in Full',
  'Needs Invoice',
  'Needs Thank You',
  'Thank You Sent / Complete',
];

// ---------------------------------------------------------------------------
// Main Pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full learning pipeline. Yields progress events for SSE streaming.
 */
export async function* runLearningPipeline(
  supabase: SupabaseClient,
  userId: string,
): AsyncGenerator<LearningProgress> {
  // Step 1: Find proposal cards
  yield { step: 'find_cards', current: 0, total: 6, message: 'Finding historical proposal cards...' };
  const proposalCards = await findProposalCards(supabase);
  yield { step: 'find_cards', current: 1, total: 6, message: `Found ${proposalCards.length} proposal cards` };

  if (proposalCards.length === 0) {
    yield { step: 'done', current: 6, total: 6, message: 'No proposal cards found. Import your Trello data first.' };
    return;
  }

  // Step 2: Cross-reference with Gmail
  yield { step: 'gmail_search', current: 1, total: 6, message: 'Searching Gmail for matching sent emails...' };
  const enrichedCards = await enrichWithGmail(supabase, userId, proposalCards);
  const withEmail = enrichedCards.filter((c) => c.emailBody || c.pdfContent);
  yield { step: 'gmail_search', current: 2, total: 6, message: `Found email data for ${withEmail.length} of ${proposalCards.length} cards` };

  // Step 3: Extract proposal content via AI
  yield { step: 'extract', current: 2, total: 6, message: 'Extracting proposal details with AI...' };
  const extracted = await extractProposalContent(supabase, userId, enrichedCards);
  yield { step: 'extract', current: 3, total: 6, message: `Extracted details from ${extracted.length} proposals` };

  // Step 4: Build patterns
  yield { step: 'patterns', current: 3, total: 6, message: 'Identifying proposal patterns...' };
  const patterns = await buildPatterns(supabase, userId, extracted);
  yield { step: 'patterns', current: 4, total: 6, message: `Created ${patterns.length} proposal patterns` };

  // Step 5: Build product catalog
  yield { step: 'products', current: 4, total: 6, message: 'Building product catalog...' };
  const productCount = await buildProductCatalog(supabase, extracted);
  yield { step: 'products', current: 5, total: 6, message: `Cataloged ${productCount} products` };

  // Step 6: Extract voice profile
  yield { step: 'voice', current: 5, total: 6, message: 'Analyzing email writing style...' };
  const emailBodies = enrichedCards
    .map((c) => c.emailBody)
    .filter((b): b is string => !!b);
  if (emailBodies.length > 0) {
    await extractVoiceProfile(supabase, userId, emailBodies);
  }
  yield { step: 'done', current: 6, total: 6, message: 'Learning pipeline complete!' };
}

// ---------------------------------------------------------------------------
// Step 1: Find proposal cards
// ---------------------------------------------------------------------------

interface ProposalCard {
  id: string;
  title: string;
  description: string | null;
  client_email: string | null;
  client_phone: string | null;
  event_type: string | null;
  event_date: string | null;
  venue_name: string | null;
  estimated_value: number | null;
  listName: string;
}

async function findProposalCards(supabase: SupabaseClient): Promise<ProposalCard[]> {
  // Find lists with proposal-related names across all boards
  const { data: lists } = await supabase
    .from('lists')
    .select('id, name')
    .in('name', PROPOSAL_LIST_NAMES);

  if (!lists || lists.length === 0) return [];

  const listIds = lists.map((l) => l.id);
  const listNameMap = new Map(lists.map((l) => [l.id, l.name]));

  // Find all card placements in those lists
  const { data: placements } = await supabase
    .from('card_placements')
    .select('card_id, list_id')
    .in('list_id', listIds);

  if (!placements || placements.length === 0) return [];

  const cardIds = Array.from(new Set(placements.map((p: { card_id: string }) => p.card_id)));

  // Fetch card details
  const { data: cards } = await supabase
    .from('cards')
    .select('id, title, description, client_email, client_phone, event_type, event_date, venue_name, estimated_value')
    .in('id', cardIds);

  if (!cards) return [];

  // Map cards to their list names
  const cardListMap = new Map<string, string>();
  for (const p of placements) {
    cardListMap.set(p.card_id, listNameMap.get(p.list_id) || '');
  }

  return cards.map((card) => ({
    ...card,
    listName: cardListMap.get(card.id) || '',
  }));
}

// ---------------------------------------------------------------------------
// Step 2: Enrich with Gmail data
// ---------------------------------------------------------------------------

interface EnrichedCard extends ProposalCard {
  emailBody: string | null;
  pdfContent: string | null;
  emailSubject: string | null;
}

async function enrichWithGmail(
  supabase: SupabaseClient,
  userId: string,
  cards: ProposalCard[],
): Promise<EnrichedCard[]> {
  let accessToken: string | null = null;
  try {
    accessToken = await getValidAccessToken(supabase, userId);
  } catch {
    // Gmail not connected — skip enrichment
  }

  const results: EnrichedCard[] = [];

  for (const card of cards) {
    const enriched: EnrichedCard = {
      ...card,
      emailBody: null,
      pdfContent: null,
      emailSubject: null,
    };

    if (accessToken && card.client_email) {
      try {
        // Search for sent emails to this client
        const searchResult = await searchSentEmails(
          accessToken,
          `to:${card.client_email}`,
          5,
        );

        if (searchResult.messages && searchResult.messages.length > 0) {
          // Get the most recent email
          const msg = await getMessage(accessToken, searchResult.messages[0].id, 'full');
          enriched.emailBody = extractTextBody(msg);
          enriched.emailSubject = getHeaderValue(msg, 'Subject');

          // Check for PDF attachments
          if (msg.payload?.parts) {
            for (const part of msg.payload.parts) {
              if (
                part.mimeType === 'application/pdf' &&
                part.body?.attachmentId
              ) {
                try {
                  const attachment = await getAttachment(
                    accessToken,
                    msg.id,
                    part.body.attachmentId,
                  );
                  // Store raw base64 for later AI extraction
                  enriched.pdfContent = attachment.data;
                } catch {
                  // Skip attachment errors
                }
                break; // Only process first PDF
              }
            }
          }
        }
      } catch {
        // Skip Gmail errors for individual cards
      }
    }

    results.push(enriched);
  }

  return results;
}

function getHeaderValue(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: any,
  headerName: string,
): string | null {
  const headers = message?.payload?.headers || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const header = headers.find((h: any) => h.name.toLowerCase() === headerName.toLowerCase());
  return header?.value || null;
}

// ---------------------------------------------------------------------------
// Step 3: Extract proposal content via AI
// ---------------------------------------------------------------------------

async function extractProposalContent(
  supabase: SupabaseClient,
  userId: string,
  cards: EnrichedCard[],
): Promise<ExtractedProposal[]> {
  const client = await createAnthropicClient(supabase);
  if (!client) return cards.map(cardToBasicProposal);

  const budgetCheck = await canMakeAICall(supabase, {
    provider: 'anthropic',
    activity: 'proposal_generation',
    userId,
  });
  if (!budgetCheck.allowed) return cards.map(cardToBasicProposal);

  const modelConfig = await resolveModelWithFallback(supabase, 'proposal_generation');
  const results: ExtractedProposal[] = [];

  // Process in batches of 5 to avoid rate limits
  for (let i = 0; i < cards.length; i += 5) {
    const batch = cards.slice(i, i + 5);

    const batchPromises = batch.map(async (card) => {
      const contentToAnalyze = buildExtractionPrompt(card);
      if (!contentToAnalyze) return cardToBasicProposal(card);

      const startTime = Date.now();
      try {
        const response = await client.messages.create({
          model: modelConfig.model_id,
          max_tokens: modelConfig.max_tokens,
          temperature: modelConfig.temperature,
          messages: [{ role: 'user', content: contentToAnalyze }],
          system: EXTRACTION_SYSTEM_PROMPT,
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
          metadata: { step: 'extract_proposal' },
        });

        return parseExtractionResponse(card, text);
      } catch (err) {
        console.error(`[ProposalLearner] Extraction failed for card ${card.id}:`, err);
        return cardToBasicProposal(card);
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}

const EXTRACTION_SYSTEM_PROMPT = `You are an assistant that extracts structured proposal data from balloon decor business communications.

Given email text and/or card information, extract:
1. Line items (product name, category, quantity, unit price, total price)
2. Total amount
3. Event type (wedding, corporate, birthday, baby shower, etc.)

Product categories: arch, bouquet, wall, banner, garland, centerpiece, marquee_letter, other

Respond in JSON format:
{
  "products": [
    { "product": "string", "category": "string", "quantity": number, "unitPrice": number|null, "totalPrice": number|null, "notes": "string|null" }
  ],
  "totalAmount": number|null,
  "eventType": "string|null"
}`;

function buildExtractionPrompt(card: EnrichedCard): string | null {
  const parts: string[] = [];

  if (card.emailBody) {
    parts.push(`EMAIL BODY:\n${card.emailBody.slice(0, 8000)}`);
  }

  if (card.description) {
    parts.push(`CARD DESCRIPTION:\n${card.description.slice(0, 4000)}`);
  }

  parts.push(`CARD TITLE: ${card.title}`);

  if (card.event_type) parts.push(`EVENT TYPE: ${card.event_type}`);
  if (card.estimated_value) parts.push(`ESTIMATED VALUE: $${card.estimated_value}`);
  if (card.venue_name) parts.push(`VENUE: ${card.venue_name}`);

  if (parts.length <= 1) return null; // Only title, not enough data

  return `Extract proposal details from the following balloon decor business data:\n\n${parts.join('\n\n')}`;
}

function cardToBasicProposal(card: EnrichedCard | ProposalCard): ExtractedProposal {
  return {
    cardId: card.id,
    clientName: card.title,
    clientEmail: card.client_email,
    eventType: card.event_type,
    eventDate: card.event_date,
    products: [],
    totalAmount: card.estimated_value,
    emailBody: 'emailBody' in card ? card.emailBody : null,
    pdfContent: null,
    source: 'card_data',
  };
}

function parseExtractionResponse(card: EnrichedCard, text: string): ExtractedProposal {
  try {
    // Find JSON in the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return cardToBasicProposal(card);

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      cardId: card.id,
      clientName: card.title,
      clientEmail: card.client_email,
      eventType: parsed.eventType || card.event_type,
      eventDate: card.event_date,
      products: (parsed.products || []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => ({
          product: p.product || 'Unknown',
          category: p.category || null,
          quantity: p.quantity || 1,
          unitPrice: p.unitPrice ?? null,
          totalPrice: p.totalPrice ?? null,
          notes: p.notes ?? null,
        }),
      ),
      totalAmount: parsed.totalAmount ?? card.estimated_value,
      emailBody: card.emailBody,
      pdfContent: card.pdfContent ? '[PDF extracted]' : null,
      source: card.emailBody ? 'email_body' : card.pdfContent ? 'pdf_attachment' : 'card_data',
    };
  } catch {
    return cardToBasicProposal(card);
  }
}

// ---------------------------------------------------------------------------
// Step 4: Build proposal patterns via AI clustering
// ---------------------------------------------------------------------------

async function buildPatterns(
  supabase: SupabaseClient,
  userId: string,
  proposals: ExtractedProposal[],
): Promise<LearnedPattern[]> {
  if (proposals.length < 3) return []; // Need minimum data

  const client = await createAnthropicClient(supabase);
  if (!client) return [];

  const modelConfig = await resolveModelWithFallback(supabase, 'proposal_generation');

  // Summarize proposals for the clustering prompt
  const summaries = proposals.map((p) => ({
    eventType: p.eventType,
    products: p.products.map((pr) => pr.product),
    total: p.totalAmount,
    clientName: p.clientName,
  }));

  const startTime = Date.now();
  try {
    const response = await client.messages.create({
      model: modelConfig.model_id,
      max_tokens: modelConfig.max_tokens,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: `Analyze these ${summaries.length} balloon decor proposals and identify recurring patterns/clusters.

PROPOSALS:
${JSON.stringify(summaries, null, 2)}

For each pattern, provide:
- name: descriptive label
- eventTypes: array of event types this pattern covers
- products: array of common products
- typicalPriceMin: lowest typical price
- typicalPriceMax: highest typical price
- matchKeywords: keywords that indicate this pattern
- isNoBrainer: true if this is a very common, straightforward proposal (>5 occurrences, consistent pricing)
- createdFromCount: how many proposals contributed to this pattern

Respond as JSON array of pattern objects.`,
        },
      ],
      system: 'You are an expert at analyzing balloon decor business data. Identify patterns in proposal data to help automate future proposals. Return valid JSON only.',
    });

    const latencyMs = Date.now() - startTime;
    const textContent = response.content.find((c) => c.type === 'text');
    const text = textContent?.text || '';

    await logUsage(supabase, {
      userId,
      activity: 'proposal_generation',
      provider: 'anthropic',
      modelId: modelConfig.model_id,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      latencyMs,
      status: 'success',
      metadata: { step: 'build_patterns', proposalCount: proposals.length },
    });

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawPatterns = JSON.parse(jsonMatch[0]) as any[];

    // Save to database
    const savedPatterns: LearnedPattern[] = [];
    for (const rp of rawPatterns) {
      const pattern: LearnedPattern = {
        name: rp.name || 'Unnamed Pattern',
        eventTypes: rp.eventTypes || [],
        products: rp.products || [],
        typicalPriceMin: rp.typicalPriceMin || 0,
        typicalPriceMax: rp.typicalPriceMax || 0,
        matchKeywords: rp.matchKeywords || [],
        confidenceThreshold: rp.isNoBrainer ? 0.9 : 0.6,
        isNoBrainer: rp.isNoBrainer || false,
        createdFromCount: rp.createdFromCount || 0,
      };

      // Check if pattern already exists by name
      const { data: existing } = await supabase
        .from('proposal_patterns')
        .select('id')
        .eq('name', pattern.name)
        .limit(1)
        .single();

      if (!existing) {
        await supabase.from('proposal_patterns').insert({
          name: pattern.name,
          event_types: pattern.eventTypes,
          products: pattern.products,
          typical_price_min: pattern.typicalPriceMin,
          typical_price_max: pattern.typicalPriceMax,
          match_keywords: pattern.matchKeywords,
          confidence_threshold: pattern.confidenceThreshold,
          is_no_brainer: pattern.isNoBrainer,
          created_from_count: pattern.createdFromCount,
          is_active: true,
        });
      }

      savedPatterns.push(pattern);
    }

    return savedPatterns;
  } catch (err) {
    console.error('[ProposalLearner] Pattern building failed:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Step 5: Build product catalog from extracted data
// ---------------------------------------------------------------------------

async function buildProductCatalog(
  supabase: SupabaseClient,
  proposals: ExtractedProposal[],
): Promise<number> {
  // Collect all products across proposals
  const productMap = new Map<
    string,
    { name: string; category: string; prices: number[]; count: number }
  >();

  for (const proposal of proposals) {
    for (const item of proposal.products) {
      const key = item.product.toLowerCase().trim();
      const existing = productMap.get(key);

      if (existing) {
        existing.count++;
        if (item.unitPrice) existing.prices.push(item.unitPrice);
        if (item.totalPrice && item.quantity === 1) existing.prices.push(item.totalPrice);
      } else {
        const prices: number[] = [];
        if (item.unitPrice) prices.push(item.unitPrice);
        if (item.totalPrice && item.quantity === 1) prices.push(item.totalPrice);

        productMap.set(key, {
          name: item.product,
          category: item.category || 'other',
          prices,
          count: 1,
        });
      }
    }
  }

  let created = 0;

  for (const product of Array.from(productMap.values())) {
    // Check if product already exists
    const { data: existing } = await supabase
      .from('product_catalog')
      .select('id')
      .ilike('name', product.name)
      .limit(1)
      .single();

    if (existing) continue;

    const basePrice =
      product.prices.length > 0
        ? product.prices.reduce((a, b) => a + b, 0) / product.prices.length
        : null;

    await supabase.from('product_catalog').insert({
      name: product.name,
      category: product.category,
      base_price: basePrice ? Math.round(basePrice * 100) / 100 : null,
      is_active: true,
      frequency_count: product.count,
    });

    created++;
  }

  return created;
}

// ---------------------------------------------------------------------------
// Step 6: Extract email voice profile
// ---------------------------------------------------------------------------

async function extractVoiceProfile(
  supabase: SupabaseClient,
  userId: string,
  emailBodies: string[],
): Promise<VoiceProfile | null> {
  const client = await createAnthropicClient(supabase);
  if (!client) return null;

  const modelConfig = await resolveModelWithFallback(supabase, 'proposal_generation');

  // Take a sample of emails (up to 10)
  const sample = emailBodies.slice(0, 10);

  const startTime = Date.now();
  try {
    const response = await client.messages.create({
      model: modelConfig.model_id,
      max_tokens: 2048,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: `Analyze these ${sample.length} emails from a balloon decor business owner and extract her writing voice profile.

EMAILS:
${sample.map((e, i) => `--- Email ${i + 1} ---\n${e.slice(0, 2000)}`).join('\n\n')}

Extract:
- greeting: her typical opening greeting
- signOff: her typical sign-off
- toneDescriptors: array of adjectives describing her tone
- commonPhrases: array of phrases she commonly uses
- formality: "casual", "semi_formal", or "formal"
- sampleSnippets: 3-5 short representative snippets of her voice

Respond as a single JSON object.`,
        },
      ],
      system: 'You analyze email writing styles. Return valid JSON only.',
    });

    const latencyMs = Date.now() - startTime;
    const textContent = response.content.find((c) => c.type === 'text');
    const text = textContent?.text || '';

    await logUsage(supabase, {
      userId,
      activity: 'proposal_generation',
      provider: 'anthropic',
      modelId: modelConfig.model_id,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      latencyMs,
      status: 'success',
      metadata: { step: 'voice_profile', emailCount: sample.length },
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const profile = JSON.parse(jsonMatch[0]) as VoiceProfile;

    // Store the voice profile as a special proposal_pattern entry
    await supabase.from('proposal_patterns').upsert(
      {
        name: '__voice_profile__',
        event_types: [],
        products: [],
        typical_price_min: 0,
        typical_price_max: 0,
        match_keywords: profile.commonPhrases || [],
        confidence_threshold: 1,
        is_no_brainer: false,
        created_from_count: sample.length,
        is_active: true,
        // Store the full voice profile in sample_proposal_ids as JSON
        sample_proposal_ids: [JSON.stringify(profile)],
      },
      { onConflict: 'name' },
    );

    return profile;
  } catch (err) {
    console.error('[ProposalLearner] Voice profile extraction failed:', err);
    return null;
  }
}

/**
 * Get the stored voice profile, if any.
 */
export async function getVoiceProfile(
  supabase: SupabaseClient,
): Promise<VoiceProfile | null> {
  const { data } = await supabase
    .from('proposal_patterns')
    .select('sample_proposal_ids')
    .eq('name', '__voice_profile__')
    .limit(1)
    .single();

  if (!data?.sample_proposal_ids?.[0]) return null;

  try {
    return JSON.parse(data.sample_proposal_ids[0]) as VoiceProfile;
  } catch {
    return null;
  }
}
