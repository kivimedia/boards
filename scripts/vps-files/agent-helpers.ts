import { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// AGENT HELPERS - VPS port of agent-engine.ts skill/context functions
// Stripped to essentials needed by standalone & chain workers
// ============================================================================

export interface AgentSkill {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  pack: string;
  system_prompt: string;
  quality_tier: string;
  quality_score: number;
  supported_tools: string[];
  required_context: string[];
  output_format: string;
  estimated_tokens: number;
  depends_on: string[];
  feeds_into: string[];
  icon: string;
  color: string;
  is_active: boolean;
}

/**
 * Load a skill by ID.
 */
export async function loadSkill(
  supabase: SupabaseClient,
  skillId: string
): Promise<AgentSkill | null> {
  const { data, error } = await supabase
    .from('agent_skills')
    .select('*')
    .eq('id', skillId)
    .single();
  if (error) return null;
  return data;
}

/**
 * Load a skill by slug.
 */
export async function loadSkillBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<AgentSkill | null> {
  const { data, error } = await supabase
    .from('agent_skills')
    .select('*')
    .eq('slug', slug)
    .single();
  if (error) return null;
  return data;
}

/**
 * List all active skills.
 */
export async function listActiveSkills(
  supabase: SupabaseClient
): Promise<AgentSkill[]> {
  const { data, error } = await supabase
    .from('agent_skills')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) return [];
  return data ?? [];
}

/**
 * Topological sort of skill dependency graph.
 * Returns ordered list of skills to execute, with the target skill last.
 */
export function topologicalSort(
  allSkills: AgentSkill[],
  targetSlug: string
): AgentSkill[] {
  const slugMap = new Map<string, AgentSkill>();
  for (const s of allSkills) slugMap.set(s.slug, s);

  const target = slugMap.get(targetSlug);
  if (!target) throw new Error(`Target skill "${targetSlug}" not found`);

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const order: AgentSkill[] = [];

  function visit(slug: string) {
    if (visited.has(slug)) return;
    if (visiting.has(slug)) {
      throw new Error(`Circular dependency detected involving "${slug}"`);
    }

    visiting.add(slug);
    const skill = slugMap.get(slug);
    if (skill) {
      for (const dep of skill.depends_on ?? []) {
        if (slugMap.has(dep)) visit(dep);
      }
      visited.add(slug);
      visiting.delete(slug);
      order.push(skill);
    } else {
      visited.add(slug);
      visiting.delete(slug);
    }
  }

  visit(targetSlug);
  return order;
}

/**
 * Cost calculation for Anthropic models.
 * Matches the VPS cost-tracker.ts patterns.
 */
export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const rates: Record<string, { input: number; output: number }> = {
    'claude-sonnet-4-5-20250929': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
    'claude-sonnet-4-20250514': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
    'claude-haiku-4-5-20251001': { input: 0.80 / 1_000_000, output: 4 / 1_000_000 },
    'claude-opus-4-20250514': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
  };
  const rate = rates[modelId] ?? rates['claude-sonnet-4-5-20250929'];
  return inputTokens * rate.input + outputTokens * rate.output;
}
