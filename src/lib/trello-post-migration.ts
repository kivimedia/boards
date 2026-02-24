/**
 * Post-migration processing for cards imported from Trello.
 *
 * Extracts structured lead data from free-text descriptions:
 * - Emails from card descriptions/comments
 * - Event dates (mentions of dates in descriptions)
 * - Pricing/estimated value from mentions of dollar amounts
 * - "Didn't book" detection from list names
 */

import { SupabaseClient } from '@supabase/supabase-js';

// Regex patterns for extraction
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const DOLLAR_REGEX = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g;
const DATE_REGEX = /(?:\d{1,2}\/\d{1,2}\/\d{2,4})|(?:\d{4}-\d{2}-\d{2})|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2},?\s*\d{2,4})/gi;

/** Lists whose names imply the card didn't book */
const DIDNT_BOOK_LIST_PATTERNS = [
  "didn't book",
  'didnt book',
  'lost',
  'cancelled',
  'not booked',
  'dead leads',
];

interface ExtractionResult {
  cardId: string;
  updates: Record<string, unknown>;
}

/**
 * Extract emails from text.
 */
function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_REGEX);
  if (!matches) return [];
  // Deduplicate and filter out common non-client emails
  const excluded = ['noreply@', 'no-reply@', 'notifications@', 'trello.com', 'support@'];
  return Array.from(new Set(matches)).filter(
    (email) => !excluded.some((ex) => email.toLowerCase().includes(ex)),
  );
}

/**
 * Extract phone numbers from text.
 */
function extractPhones(text: string): string[] {
  const matches = text.match(PHONE_REGEX);
  if (!matches) return [];
  return Array.from(new Set(matches));
}

/**
 * Extract dollar amounts from text and return the highest (likely the quote).
 */
function extractEstimatedValue(text: string): number | null {
  const matches = Array.from(text.matchAll(DOLLAR_REGEX));
  if (matches.length === 0) return null;
  const values = matches.map((m) => parseFloat(m[1].replace(/,/g, '')));
  return Math.max(...values);
}

/**
 * Try to parse a date from text (first match).
 */
function extractEventDate(text: string): string | null {
  const matches = text.match(DATE_REGEX);
  if (!matches) return null;

  for (const dateStr of matches) {
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2020) {
        return d.toISOString();
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Run post-migration extraction on all cards in a board.
 * Only updates fields that are currently null (doesn't overwrite user data).
 *
 * @param boardId - The HQ board to process
 * @returns Count of cards updated
 */
export async function runPostMigrationExtraction(
  supabase: SupabaseClient,
  boardId: string,
): Promise<{ cardsProcessed: number; cardsUpdated: number; errors: string[] }> {
  const errors: string[] = [];
  let cardsProcessed = 0;
  let cardsUpdated = 0;

  // Get all cards on this board (via placements)
  const { data: placements } = await supabase
    .from('card_placements')
    .select(`
      card_id,
      list:lists!inner(name),
      card:cards!inner(
        id, title, description,
        client_email, client_phone, estimated_value, event_date
      )
    `)
    .eq('lists.board_id', boardId)
    .eq('is_mirror', false);

  if (!placements || placements.length === 0) return { cardsProcessed: 0, cardsUpdated: 0, errors };

  const results: ExtractionResult[] = [];

  for (const placement of placements) {
    cardsProcessed++;
    const card = placement.card as any;
    const listName = (placement.list as any)?.name || '';
    const text = `${card.title || ''} ${card.description || ''}`;
    const updates: Record<string, unknown> = {};

    // Extract email if not already set
    if (!card.client_email) {
      const emails = extractEmails(text);
      if (emails.length > 0) updates.client_email = emails[0];
    }

    // Extract phone if not already set
    if (!card.client_phone) {
      const phones = extractPhones(text);
      if (phones.length > 0) updates.client_phone = phones[0];
    }

    // Extract estimated value if not already set
    if (card.estimated_value === null || card.estimated_value === undefined) {
      const value = extractEstimatedValue(text);
      if (value !== null) updates.estimated_value = value;
    }

    // Extract event date if not already set
    if (!card.event_date) {
      const date = extractEventDate(text);
      if (date) updates.event_date = date;
    }

    // Detect "didn't book" from list name
    const lowerListName = listName.toLowerCase();
    if (DIDNT_BOOK_LIST_PATTERNS.some((p) => lowerListName.includes(p))) {
      if (!card.didnt_book_reason) {
        updates.didnt_book_reason = 'other';
      }
    }

    if (Object.keys(updates).length > 0) {
      results.push({ cardId: card.id, updates });
    }
  }

  // Apply updates in batches
  for (const { cardId, updates } of results) {
    try {
      const { error } = await supabase
        .from('cards')
        .update(updates)
        .eq('id', cardId);

      if (error) {
        errors.push(`Card ${cardId}: ${error.message}`);
      } else {
        cardsUpdated++;
      }
    } catch (err) {
      errors.push(`Card ${cardId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { cardsProcessed, cardsUpdated, errors };
}
