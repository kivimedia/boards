import { SupabaseClient } from '@supabase/supabase-js';

export async function checkVersionConflict(
  supabase: SupabaseClient,
  cardId: string,
  expectedVersion: number
): Promise<
  | { conflict: true; currentVersion: number; serverData: Record<string, unknown> }
  | { conflict: false }
> {
  const { data: card, error } = await supabase
    .from('cards')
    .select('*')
    .eq('id', cardId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch card ${cardId}: ${error.message}`);
  }

  if (card.version !== expectedVersion) {
    return {
      conflict: true,
      currentVersion: card.version,
      serverData: card,
    };
  }

  return { conflict: false };
}

export async function bumpVersion(
  supabase: SupabaseClient,
  cardId: string,
  currentVersion: number
): Promise<number> {
  const newVersion = currentVersion + 1;

  const { data, error } = await supabase
    .from('cards')
    .update({ version: newVersion, updated_at: new Date().toISOString() })
    .eq('id', cardId)
    .eq('version', currentVersion)
    .select('version')
    .single();

  if (error || !data) {
    throw new Error(
      `Version conflict: card ${cardId} has been modified by another user. Expected version ${currentVersion}.`
    );
  }

  return data.version;
}

export function resolveConflict(
  localData: Record<string, unknown>,
  serverData: Record<string, unknown>,
  resolution: 'keep_mine' | 'keep_theirs' | 'merge'
): Record<string, unknown> {
  if (resolution === 'keep_mine') {
    return localData;
  }

  if (resolution === 'keep_theirs') {
    return serverData;
  }

  // merge: field-by-field merge where local wins for non-null changed fields, server wins for rest
  const merged: Record<string, unknown> = { ...serverData };

  for (const key of Object.keys(localData)) {
    if (localData[key] !== null && localData[key] !== undefined && localData[key] !== serverData[key]) {
      merged[key] = localData[key];
    }
  }

  return merged;
}

export async function getCardVersion(
  supabase: SupabaseClient,
  cardId: string
): Promise<number> {
  const { data, error } = await supabase
    .from('cards')
    .select('version')
    .eq('id', cardId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to fetch version for card ${cardId}: ${error?.message}`);
  }

  return data.version;
}
