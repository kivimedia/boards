import { SupabaseClient } from '@supabase/supabase-js';
import type { SavedFilter } from './types';

// ============================================================================
// SAVED FILTERS (v5.3.0)
// ============================================================================

/**
 * Get all saved filters for a board that are either owned by the user
 * or shared, ordered by name.
 */
export async function getSavedFilters(
  supabase: SupabaseClient,
  boardId: string,
  userId: string
): Promise<SavedFilter[]> {
  const { data, error } = await supabase
    .from('saved_filters')
    .select('*')
    .eq('board_id', boardId)
    .or(`user_id.eq.${userId},is_shared.eq.true`)
    .order('name');

  if (error) {
    console.error('[SavedFilters] Failed to get saved filters:', error.message);
    return [];
  }

  return (data || []) as SavedFilter[];
}

/**
 * Create a new saved filter. If is_default is true, first unset any existing
 * default filter for this user+board combination.
 */
export async function createSavedFilter(
  supabase: SupabaseClient,
  params: {
    board_id: string;
    user_id: string;
    name: string;
    filter_config: Record<string, unknown>;
    is_default?: boolean;
    is_shared?: boolean;
  }
): Promise<SavedFilter | null> {
  if (params.is_default) {
    const { error: unsetError } = await supabase
      .from('saved_filters')
      .update({ is_default: false })
      .eq('board_id', params.board_id)
      .eq('user_id', params.user_id)
      .eq('is_default', true);

    if (unsetError) {
      console.error('[SavedFilters] Failed to unset existing defaults:', unsetError.message);
    }
  }

  const { data, error } = await supabase
    .from('saved_filters')
    .insert({
      board_id: params.board_id,
      user_id: params.user_id,
      name: params.name,
      filter_config: params.filter_config,
      is_default: params.is_default ?? false,
      is_shared: params.is_shared ?? false,
    })
    .select()
    .single();

  if (error) {
    console.error('[SavedFilters] Failed to create saved filter:', error.message);
    return null;
  }

  return data as SavedFilter;
}

/**
 * Update a saved filter. Only the owner (matching user_id) can update.
 * If is_default is changed to true, unset other defaults first.
 */
export async function updateSavedFilter(
  supabase: SupabaseClient,
  filterId: string,
  userId: string,
  updates: Partial<{
    name: string;
    filter_config: Record<string, unknown>;
    is_default: boolean;
    is_shared: boolean;
  }>
): Promise<SavedFilter | null> {
  if (updates.is_default === true) {
    // Need the board_id to scope the unset query
    const { data: existing } = await supabase
      .from('saved_filters')
      .select('board_id')
      .eq('id', filterId)
      .eq('user_id', userId)
      .single();

    if (existing) {
      const { error: unsetError } = await supabase
        .from('saved_filters')
        .update({ is_default: false })
        .eq('board_id', existing.board_id)
        .eq('user_id', userId)
        .eq('is_default', true);

      if (unsetError) {
        console.error('[SavedFilters] Failed to unset existing defaults:', unsetError.message);
      }
    }
  }

  const { data, error } = await supabase
    .from('saved_filters')
    .update(updates)
    .eq('id', filterId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('[SavedFilters] Failed to update saved filter:', error.message);
    return null;
  }

  return data as SavedFilter;
}

/**
 * Delete a saved filter. Only the owner (matching user_id) can delete.
 */
export async function deleteSavedFilter(
  supabase: SupabaseClient,
  filterId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('saved_filters')
    .delete()
    .eq('id', filterId)
    .eq('user_id', userId);

  if (error) {
    console.error('[SavedFilters] Failed to delete saved filter:', error.message);
  }
}

/**
 * Get the default filter for a specific user+board combination.
 * Returns the filter with is_default=true, or null if none exists.
 */
export async function getDefaultFilter(
  supabase: SupabaseClient,
  boardId: string,
  userId: string
): Promise<SavedFilter | null> {
  const { data, error } = await supabase
    .from('saved_filters')
    .select('*')
    .eq('board_id', boardId)
    .eq('user_id', userId)
    .eq('is_default', true)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      // PGRST116 = no rows found, which is expected if no default exists
      console.error('[SavedFilters] Failed to get default filter:', error.message);
    }
    return null;
  }

  return data as SavedFilter;
}
