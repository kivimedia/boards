import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Extract meaningful search terms from a KM Boards URL.
 * e.g. "/c/jesus/kim/sara-march-18-flyer" -> "sara march 18 flyer"
 * e.g. "https://kmboards.co/c/jesus/kim/sara-march-18-flyer" -> "sara march 18 flyer"
 */
export function extractSearchFromUrl(input: string): string | null {
  // Strip domain prefix if present
  const path = input.replace(/^https?:\/\/[^/]+/, '');
  // /c/board-slug/person-slug/card-slug
  const cardMatch = path.match(/\/c\/[\w-]+\/[\w-]+\/([\w-]+)/);
  if (cardMatch) return cardMatch[1].replace(/-/g, ' ');
  // /c/uuid/card-slug (legacy)
  const legacyMatch = path.match(/\/c\/[0-9a-f-]{36}\/([\w-]+)/);
  if (legacyMatch) return legacyMatch[1].replace(/-/g, ' ');
  // /board/board-slug
  const boardMatch = path.match(/\/board\/([\w-]+)/);
  if (boardMatch) return boardMatch[1].replace(/-/g, ' ');
  return null;
}

export interface SearchResult {
  type: 'card' | 'board' | 'comment' | 'person';
  id: string;
  title: string;
  subtitle: string | null;
  url: string;
  metadata?: Record<string, unknown>;
}

export async function searchCards(
  supabase: SupabaseClient,
  query: string,
  limit = 10,
  boardId?: string
): Promise<SearchResult[]> {
  if (boardId) {
    // Board-scoped search: join through card_placements -> lists
    const { data } = await supabase
      .from('card_placements')
      .select('card_id, cards!inner(id, title, description), lists!inner(id, name, board_id)')
      .eq('lists.board_id', boardId)
      .or(`cards.title.ilike.%${query}%,cards.description.ilike.%${query}%`)
      .limit(limit);

    return (data || []).map((row: any) => ({
      type: 'card' as const,
      id: row.cards.id,
      title: row.cards.title,
      subtitle: row.lists?.name || null,
      list_name: row.lists?.name || null,
      url: `/card/${row.cards.id}`,
    }));
  }

  const { data } = await supabase
    .from('cards')
    .select('id, title, description')
    .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
    .limit(limit);

  return (data || []).map((card) => ({
    type: 'card' as const,
    id: card.id,
    title: card.title,
    subtitle: card.description?.slice(0, 80) || null,
    url: `/card/${card.id}`,
  }));
}

export async function searchBoards(
  supabase: SupabaseClient,
  query: string,
  limit = 5
): Promise<SearchResult[]> {
  const { data } = await supabase
    .from('boards')
    .select('id, name, type')
    .ilike('name', `%${query}%`)
    .limit(limit);

  return (data || []).map((board) => ({
    type: 'board' as const,
    id: board.id,
    title: board.name,
    subtitle: board.type,
    url: `/board/${board.id}`,
  }));
}

export async function searchComments(
  supabase: SupabaseClient,
  query: string,
  limit = 5
): Promise<SearchResult[]> {
  const { data } = await supabase
    .from('comments')
    .select('id, content, card_id')
    .ilike('content', `%${query}%`)
    .limit(limit);

  return (data || []).map((comment) => ({
    type: 'comment' as const,
    id: comment.id,
    title: comment.content.slice(0, 80),
    subtitle: null,
    url: `/card/${comment.card_id}`,
  }));
}

export async function searchPeople(
  supabase: SupabaseClient,
  query: string,
  limit = 5
): Promise<SearchResult[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, role')
    .ilike('display_name', `%${query}%`)
    .limit(limit);

  return (data || []).map((person) => ({
    type: 'person' as const,
    id: person.id,
    title: person.display_name,
    subtitle: person.role,
    url: '#',
  }));
}

export async function aggregateSearch(
  supabase: SupabaseClient,
  query: string
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const [cards, boards, comments, people] = await Promise.all([
    searchCards(supabase, query),
    searchBoards(supabase, query),
    searchComments(supabase, query),
    searchPeople(supabase, query),
  ]);

  return [...cards, ...boards, ...comments, ...people];
}

const RECENT_SEARCHES_KEY = 'agency-board-recent-searches';
const MAX_RECENT = 5;

export function getRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
  } catch {
    return [];
  }
}

export function addRecentSearch(query: string): void {
  if (typeof window === 'undefined') return;
  const recent = getRecentSearches().filter((q) => q !== query);
  recent.unshift(query);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

export function clearRecentSearches(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(RECENT_SEARCHES_KEY);
}
