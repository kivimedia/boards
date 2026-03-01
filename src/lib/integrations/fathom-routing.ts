import type { SupabaseClient } from '@supabase/supabase-js';
import type { FathomTranscriptEntry } from './fathom';
import { transcriptToText } from './fathom';

// ============================================================================
// FATHOM ROUTING RULES ENGINE
// Matches Fathom recordings to clients/cards based on configurable rules.
// Rules are evaluated in priority order (highest first). First match wins.
// ============================================================================

export interface RoutingResult {
  clientId: string | null;
  cardId: string | null;
  matchedBy: string | null;
  ruleId: string | null;
}

interface RoutingRule {
  id: string;
  priority: number;
  rule_type: 'participant' | 'client_day' | 'day' | 'keyword' | 'fallback';
  conditions: Record<string, unknown>;
  target_client_id: string | null;
  target_card_id: string | null;
  enabled: boolean;
  dry_run: boolean;
  match_count: number;
}

interface ParticipantConditions {
  emails: string[];
}

interface KeywordConditions {
  keywords: string[];
}

interface DayConditions {
  days: string[];
}

interface ClientDayConditions {
  client_id: string;
  days: string[];
}

/**
 * Returns the lowercase day-of-week name from an ISO date string.
 * Example: "2026-03-01T14:30:00Z" -> "saturday"
 */
export function getDayOfWeek(dateStr: string): string {
  const date = new Date(dateStr);
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[date.getUTCDay()];
}

/**
 * Evaluate all enabled routing rules against a Fathom recording's metadata.
 * Rules are checked in priority order (highest first). The first matching
 * rule wins - its target_client_id and target_card_id are returned.
 *
 * On match, the rule's match_count is incremented (unless dry_run is true).
 */
export async function evaluateRoutingRules(params: {
  title: string | null;
  transcript: FathomTranscriptEntry[] | null;
  participants: { email: string; name: string; is_external: boolean }[];
  recordedAt: string | null;
  supabase: SupabaseClient;
}): Promise<RoutingResult> {
  const { title, transcript, participants, recordedAt, supabase } = params;

  const nullResult: RoutingResult = {
    clientId: null,
    cardId: null,
    matchedBy: null,
    ruleId: null,
  };

  // 1. Fetch all enabled rules ordered by priority DESC (highest first)
  const { data: rules, error } = await supabase
    .from('fathom_routing_rules')
    .select('id, priority, rule_type, conditions, target_client_id, target_card_id, enabled, dry_run, match_count')
    .eq('enabled', true)
    .order('priority', { ascending: false });

  if (error || !rules || rules.length === 0) {
    return nullResult;
  }

  // Pre-compute searchable text from title + transcript (used by keyword rules)
  const transcriptText = transcript ? transcriptToText(transcript) : '';
  const searchableText = [title || '', transcriptText].join(' ').toLowerCase();

  // Pre-compute participant emails (lowercased for case-insensitive matching)
  const participantEmails = participants.map(p => p.email.toLowerCase());

  // Pre-compute day of week from recording date
  const recordingDay = recordedAt ? getDayOfWeek(recordedAt) : null;

  // 2. Evaluate each rule in priority order
  for (const rule of rules as RoutingRule[]) {
    const matched = evaluateRule(rule, {
      participantEmails,
      searchableText,
      recordingDay,
    });

    if (matched) {
      // 3. Increment match_count (fire-and-forget, skip for dry_run)
      if (!rule.dry_run) {
        await supabase
          .from('fathom_routing_rules')
          .update({ match_count: (rule.match_count || 0) + 1, updated_at: new Date().toISOString() })
          .eq('id', rule.id);
      }

      return {
        clientId: rule.target_client_id,
        cardId: rule.target_card_id,
        matchedBy: rule.rule_type,
        ruleId: rule.id,
      };
    }
  }

  // 4. No rules matched
  return nullResult;
}

// --- Internal rule evaluators ---

function evaluateRule(
  rule: RoutingRule,
  context: {
    participantEmails: string[];
    searchableText: string;
    recordingDay: string | null;
  }
): boolean {
  switch (rule.rule_type) {
    case 'participant':
      return evaluateParticipantRule(rule.conditions as unknown as ParticipantConditions, context.participantEmails);

    case 'keyword':
      return evaluateKeywordRule(rule.conditions as unknown as KeywordConditions, context.searchableText);

    case 'day':
      return evaluateDayRule(rule.conditions as unknown as DayConditions, context.recordingDay);

    case 'client_day':
      return evaluateClientDayRule(rule.conditions as unknown as ClientDayConditions, context.recordingDay);

    case 'fallback':
      return true; // Always matches

    default:
      return false;
  }
}

/**
 * Participant rule: matches if any participant email is in the rule's email list.
 * conditions = { emails: ["client@example.com", "other@example.com"] }
 */
function evaluateParticipantRule(conditions: ParticipantConditions, participantEmails: string[]): boolean {
  if (!conditions?.emails || !Array.isArray(conditions.emails) || conditions.emails.length === 0) {
    return false;
  }

  const ruleEmails = conditions.emails.map(e => e.toLowerCase());
  return participantEmails.some(pe => ruleEmails.includes(pe));
}

/**
 * Keyword rule: matches if any keyword appears in the title or transcript text.
 * Case-insensitive search.
 * conditions = { keywords: ["project X", "acme corp"] }
 */
function evaluateKeywordRule(conditions: KeywordConditions, searchableText: string): boolean {
  if (!conditions?.keywords || !Array.isArray(conditions.keywords) || conditions.keywords.length === 0) {
    return false;
  }

  return conditions.keywords.some(kw => searchableText.includes(kw.toLowerCase()));
}

/**
 * Day rule: matches if the recording day of week is in the rule's days list.
 * conditions = { days: ["monday", "wednesday"] }
 */
function evaluateDayRule(conditions: DayConditions, recordingDay: string | null): boolean {
  if (!recordingDay) return false;
  if (!conditions?.days || !Array.isArray(conditions.days) || conditions.days.length === 0) {
    return false;
  }

  return conditions.days.map(d => d.toLowerCase()).includes(recordingDay);
}

/**
 * Client-day rule: matches if both the target_client_id matches AND the recording
 * day is in the rule's days list. The client_id in conditions is used for validation
 * (it should match the rule's target_client_id).
 * conditions = { client_id: "uuid-here", days: ["monday"] }
 */
function evaluateClientDayRule(conditions: ClientDayConditions, recordingDay: string | null): boolean {
  if (!recordingDay) return false;
  if (!conditions?.client_id || !conditions?.days || !Array.isArray(conditions.days) || conditions.days.length === 0) {
    return false;
  }

  return conditions.days.map(d => d.toLowerCase()).includes(recordingDay);
}
