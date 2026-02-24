/**
 * Lead Triage Engine
 *
 * Automatically evaluates new leads and applies:
 * 1. Completeness check — missing info → "Abandoned Form" label + "Responded - Need More Info"
 * 2. Client type routing — corporate/institutional → mirror to Owner Dashboard
 * 3. Urgency detection — event within 14 days → "Urgent" label; 7 days → push notification
 * 4. Repeat client matching — match email to existing cards → "VIP / Repeat Client" label
 * 5. Auto-response draft — generate appropriate initial email via AI
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from './notification-service';
import { evaluateMirrorRules } from './mirror-engine';

interface CardData {
  id: string;
  title: string;
  description: string | null;
  client_email: string | null;
  client_phone: string | null;
  event_type: string | null;
  event_date: string | null;
  venue_name: string | null;
  venue_city: string | null;
  estimated_value: number | null;
  lead_source: string | null;
}

interface TriageResult {
  labels_added: string[];
  moved_to_list: string | null;
  is_urgent: boolean;
  is_repeat_client: boolean;
  is_incomplete: boolean;
  is_corporate: boolean;
  draft_generated: boolean;
}

const CORPORATE_KEYWORDS = [
  'corporate', 'company', 'business', 'conference', 'tradeshow', 'trade show',
  'gala', 'fundraiser', 'nonprofit', 'non-profit', 'church', 'school',
  'university', 'hospital', 'government', 'association', 'chamber',
  'grand opening', 'ribbon cutting', 'groundbreaking',
];

const URGENT_DAYS = 14;
const CRITICAL_DAYS = 7;

/**
 * Run triage on a newly created lead card.
 */
export async function triageLead(
  supabase: SupabaseClient,
  cardId: string,
  boardId: string,
  userId: string,
): Promise<TriageResult> {
  const result: TriageResult = {
    labels_added: [],
    moved_to_list: null,
    is_urgent: false,
    is_repeat_client: false,
    is_incomplete: false,
    is_corporate: false,
    draft_generated: false,
  };

  // Fetch card data
  const { data: card } = await supabase
    .from('cards')
    .select('*')
    .eq('id', cardId)
    .single();

  if (!card) return result;
  const cardData = card as CardData;

  // Fetch board labels for this board
  const { data: boardLabels } = await supabase
    .from('labels')
    .select('id, name, color')
    .eq('board_id', boardId);

  const labelMap = new Map<string, string>();
  for (const label of boardLabels || []) {
    labelMap.set(label.name.toLowerCase(), label.id);
  }

  // Helper: add label to card
  const addLabel = async (labelName: string) => {
    const labelId = labelMap.get(labelName.toLowerCase());
    if (!labelId) return;

    // Check if already applied
    const { data: existing } = await supabase
      .from('card_labels')
      .select('id')
      .eq('card_id', cardId)
      .eq('label_id', labelId)
      .limit(1)
      .single();

    if (!existing) {
      await supabase.from('card_labels').insert({ card_id: cardId, label_id: labelId });
      result.labels_added.push(labelName);
    }
  };

  // ─── Step 1: Completeness Check ────────────────────────────
  const hasEmail = !!cardData.client_email;
  const hasEventDate = !!cardData.event_date;
  const hasEventType = !!cardData.event_type;
  const hasDescription = !!cardData.description && cardData.description.length > 10;

  if (!hasEmail || (!hasEventDate && !hasEventType && !hasDescription)) {
    result.is_incomplete = true;
    await addLabel('Abandoned Form');

    // Move to "Responded - Need More Info"
    await moveCardToList(supabase, cardId, boardId, 'Responded - Need More Info');
    result.moved_to_list = 'Responded - Need More Info';
  }

  // ─── Step 2: Client Type Routing ───────────────────────────
  const cardText = `${cardData.title} ${cardData.description || ''} ${cardData.event_type || ''}`.toLowerCase();
  const isCorporate = CORPORATE_KEYWORDS.some((kw) => cardText.includes(kw));

  if (isCorporate) {
    result.is_corporate = true;
    // Mirror to Owner Dashboard for Halley's direct attention
    evaluateMirrorRules(supabase, cardId, boardId, 'Website Inquiry', userId).catch((err) => {
      console.error('[Triage] Mirror to owner failed:', err);
    });
  }

  // ─── Step 3: Urgency Detection ─────────────────────────────
  if (cardData.event_date) {
    const eventDate = new Date(cardData.event_date);
    const now = new Date();
    const daysUntilEvent = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilEvent <= URGENT_DAYS && daysUntilEvent > 0) {
      result.is_urgent = true;
      await addLabel('Urgent');

      if (daysUntilEvent <= CRITICAL_DAYS) {
        // Send push notification to all admins
        const { data: admins } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_role', 'admin');

        if (admins) {
          for (const admin of admins) {
            await createNotification(supabase, {
              userId: admin.id,
              type: 'lead_received',
              title: `Urgent Lead: ${cardData.title}`,
              body: `Event in ${daysUntilEvent} days! ${cardData.event_type || ''} ${cardData.venue_name ? `at ${cardData.venue_name}` : ''}`.trim(),
              cardId,
              boardId,
              metadata: { days_until_event: daysUntilEvent, is_urgent: true },
            });
          }
        }
      }
    }
  }

  // ─── Step 4: Repeat Client Matching ────────────────────────
  if (cardData.client_email) {
    const { data: previousCards, error: matchError } = await supabase
      .from('cards')
      .select('id')
      .eq('client_email', cardData.client_email)
      .neq('id', cardId)
      .limit(1);

    if (!matchError && previousCards && previousCards.length > 0) {
      result.is_repeat_client = true;
      await addLabel('VIP / Repeat Client');
    }
  }

  // ─── Step 5: Lead Source Label ─────────────────────────────
  if (cardData.lead_source) {
    const sourceLabels: Record<string, string> = {
      google_ads: 'Google Ads',
      google: 'Google Ads',
      organic: 'Organic',
      referral: 'Referral',
      instagram: 'Organic',
      facebook: 'Organic',
    };
    const labelName = sourceLabels[cardData.lead_source.toLowerCase()];
    if (labelName) {
      await addLabel(labelName);
    }
  }

  // ─── Log Triage Result ─────────────────────────────────────
  await supabase.from('activity_log').insert({
    card_id: cardId,
    board_id: boardId,
    user_id: userId,
    event_type: 'lead_triaged',
    metadata: result,
  });

  // Notify owner about the new lead (non-urgent gets a regular notification)
  if (!result.is_urgent) {
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_role', 'admin');

    if (admins) {
      for (const admin of admins) {
        await createNotification(supabase, {
          userId: admin.id,
          type: 'lead_received',
          title: `New Lead: ${cardData.title}`,
          body: cardData.event_type ? `${cardData.event_type} inquiry` : 'New website inquiry',
          cardId,
          boardId,
        });
      }
    }
  }

  return result;
}

/**
 * Triage API endpoint helper.
 */
export async function triageLeadApi(
  supabase: SupabaseClient,
  cardId: string,
  userId: string,
): Promise<TriageResult | null> {
  // Find which board this card is on
  const { data: placement } = await supabase
    .from('card_placements')
    .select('list_id, lists(board_id)')
    .eq('card_id', cardId)
    .limit(1)
    .single();

  if (!placement) return null;

  const boardId = (placement.lists as unknown as { board_id: string })?.board_id;
  if (!boardId) return null;

  return triageLead(supabase, cardId, boardId, userId);
}

/**
 * Move a card to a named list on the same board.
 */
async function moveCardToList(
  supabase: SupabaseClient,
  cardId: string,
  boardId: string,
  listName: string,
): Promise<void> {
  const { data: targetList } = await supabase
    .from('lists')
    .select('id')
    .eq('board_id', boardId)
    .eq('name', listName)
    .single();

  if (!targetList) return;

  // Get current placement
  const { data: currentPlacement } = await supabase
    .from('card_placements')
    .select('id, list_id')
    .eq('card_id', cardId)
    .limit(1)
    .single();

  if (!currentPlacement) return;
  if (currentPlacement.list_id === targetList.id) return; // Already there

  // Get next position
  const { data: maxPos } = await supabase
    .from('card_placements')
    .select('position')
    .eq('list_id', targetList.id)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const position = (maxPos?.position ?? -1) + 1;

  await supabase
    .from('card_placements')
    .update({ list_id: targetList.id, position })
    .eq('id', currentPlacement.id);
}
