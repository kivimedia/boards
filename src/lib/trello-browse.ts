import { SupabaseClient } from '@supabase/supabase-js';
import type { TrelloBoard, TrelloList, TrelloCard } from './types';

const TRELLO_API_BASE = 'https://api.trello.com/1';

interface TrelloAuth {
  key: string;
  token: string;
}

// ============================================================================
// CREDENTIAL RETRIEVAL
// ============================================================================

/**
 * Get Trello API credentials from the most recent completed migration job.
 * Returns null if no credentials are available.
 */
export async function getTrelloCredentials(
  supabase: SupabaseClient
): Promise<TrelloAuth | null> {
  const { data } = await supabase
    .from('migration_jobs')
    .select('config')
    .eq('type', 'trello')
    .in('status', ['completed', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!data?.config) return null;

  const config = data.config as { trello_api_key?: string; trello_token?: string };
  if (!config.trello_api_key || !config.trello_token) return null;

  return { key: config.trello_api_key, token: config.trello_token };
}

// ============================================================================
// TRELLO API (lightweight fetch for browsing)
// ============================================================================

async function trelloGet<T>(path: string, auth: TrelloAuth): Promise<T> {
  const url = new URL(`${TRELLO_API_BASE}${path}`);
  url.searchParams.set('key', auth.key);
  url.searchParams.set('token', auth.token);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Trello API ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

export async function browseTrelloBoards(auth: TrelloAuth): Promise<TrelloBoard[]> {
  return trelloGet<TrelloBoard[]>('/members/me/boards?filter=open', auth);
}

export async function browseTrelloLists(auth: TrelloAuth, boardId: string): Promise<TrelloList[]> {
  return trelloGet<TrelloList[]>(`/boards/${boardId}/lists?filter=open`, auth);
}

export async function browseTrelloCards(auth: TrelloAuth, listId: string): Promise<TrelloCard[]> {
  return trelloGet<TrelloCard[]>(`/lists/${listId}/cards?filter=open`, auth);
}

// ============================================================================
// CLIENT TRELLO CARD MAPPING
// ============================================================================

export interface ClientTrelloCard {
  id: string;
  client_id: string;
  trello_board_id: string;
  trello_board_name: string;
  trello_list_id: string;
  trello_list_name: string;
  trello_card_id: string;
  trello_card_name: string;
  added_by: string | null;
  created_at: string;
}

export async function getClientTrelloCards(
  supabase: SupabaseClient,
  clientId: string
): Promise<ClientTrelloCard[]> {
  const { data, error } = await supabase
    .from('client_trello_cards')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as ClientTrelloCard[];
}

export async function linkTrelloCard(
  supabase: SupabaseClient,
  clientId: string,
  card: {
    trello_board_id: string;
    trello_board_name: string;
    trello_list_id: string;
    trello_list_name: string;
    trello_card_id: string;
    trello_card_name: string;
  },
  userId: string
): Promise<ClientTrelloCard> {
  const { data, error } = await supabase
    .from('client_trello_cards')
    .insert({
      client_id: clientId,
      ...card,
      added_by: userId,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ClientTrelloCard;
}

export async function unlinkTrelloCard(
  supabase: SupabaseClient,
  mappingId: string
): Promise<void> {
  const { error } = await supabase
    .from('client_trello_cards')
    .delete()
    .eq('id', mappingId);

  if (error) throw new Error(error.message);
}
