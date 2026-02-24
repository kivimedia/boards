import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Stub — agent engine was removed during the Carolina Balloons HQ pivot.
 * These exports satisfy the imports in api/agents/sessions and api/agents/skills routes.
 */

export async function getSkill(supabase: SupabaseClient, skillId: string) {
  const { data } = await supabase
    .from('agent_skills')
    .select('*')
    .eq('id', skillId)
    .single();
  return data;
}

export async function updateSkill(
  supabase: SupabaseClient,
  skillId: string,
  updates: Record<string, unknown>
) {
  const { data, error } = await supabase
    .from('agent_skills')
    .update(updates)
    .eq('id', skillId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}
