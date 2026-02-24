/**
 * Suggested list name mappings from Halley's known Trello board names
 * to the canonical Carolina Balloons HQ list names.
 *
 * Used during Trello migration to auto-suggest the best board type
 * and rename lists to match the HQ convention.
 */

import { BoardType } from './types';

/** Known Trello board names → suggested HQ board type */
export const TRELLO_BOARD_NAME_SUGGESTIONS: Record<string, BoardType> = {
  // Boutique Decor board
  'boutique decor': 'boutique_decor',
  'boutique': 'boutique_decor',
  'decor leads': 'boutique_decor',
  'balloon decor': 'boutique_decor',

  // Marquee Letters board
  'marquee letters': 'marquee_letters',
  'marquee': 'marquee_letters',
  'letter rentals': 'marquee_letters',
  'letters': 'marquee_letters',

  // Private Clients board
  'private clients': 'private_clients',
  'private': 'private_clients',
  'vip clients': 'private_clients',
  'repeat clients': 'private_clients',

  // Owner Dashboard
  'owner dashboard': 'owner_dashboard',
  'halley': 'owner_dashboard',
  "halley's board": 'owner_dashboard',
  'owner': 'owner_dashboard',

  // VA Workspace
  'va workspace': 'va_workspace',
  'tiffany': 'va_workspace',
  "tiffany's board": 'va_workspace',
  'va': 'va_workspace',
  'virtual assistant': 'va_workspace',

  // General Tasks
  'general': 'general_tasks',
  'tasks': 'general_tasks',
  'general tasks': 'general_tasks',
  'to do': 'general_tasks',
};

/**
 * Common Trello list names → canonical HQ list names.
 * Only includes names that differ. If a name isn't here, it's kept as-is.
 */
export const TRELLO_LIST_RENAMES: Record<string, string> = {
  // Common Trello patterns → HQ names
  'to do': 'Website Inquiry',
  'doing': 'In Progress',
  'done': 'Thank You Sent / Complete',
  'inbox': 'Website Inquiry',
  'new leads': 'Website Inquiry',
  'new inquiries': 'Website Inquiry',
  'follow up': 'Needs Follow-Up',
  'follow-up': 'Needs Follow-Up',
  'need to follow up': 'Needs Follow-Up',
  'proposals': 'Proposal/Pricing Sent',
  'proposals sent': 'Proposal/Pricing Sent',
  'pricing sent': 'Proposal/Pricing Sent',
  'waiting for payment': 'Needs to Pay Before Event',
  'paid': 'Paid in Full',
  'booked': 'Paid in Full',
  'completed': 'Thank You Sent / Complete',
  'archived': 'Archived',
  'lost': "Didn't Book",
  'lost leads': "Didn't Book",
  "didn't book": "Didn't Book",
  'cancelled': "Didn't Book",
};

/**
 * Suggest a board type based on the Trello board name.
 * Returns undefined if no confident match.
 */
export function suggestBoardType(trelloBoardName: string): BoardType | undefined {
  const lower = trelloBoardName.toLowerCase().trim();

  // Exact match first
  if (TRELLO_BOARD_NAME_SUGGESTIONS[lower]) {
    return TRELLO_BOARD_NAME_SUGGESTIONS[lower];
  }

  // Partial match (board name contains a known key)
  for (const [key, boardType] of Object.entries(TRELLO_BOARD_NAME_SUGGESTIONS)) {
    if (lower.includes(key)) return boardType;
  }

  return undefined;
}

/**
 * Suggest a canonical HQ list name from a Trello list name.
 * Returns the original name if no mapping is found.
 */
export function suggestListName(trelloListName: string): string {
  const lower = trelloListName.toLowerCase().trim();
  return TRELLO_LIST_RENAMES[lower] || trelloListName;
}
