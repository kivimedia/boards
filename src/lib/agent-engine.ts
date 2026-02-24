import { SupabaseClient } from '@supabase/supabase-js';
import type {
  AgentSkill,
  BoardAgent,
  AgentExecution,
  AgentToolCall,
  CardAgentTask,
  SkillImprovementLog,
  SkillRevision,
  SkillQualityDashboard,
  AgentExecutionStats,
  AgentQualityTier,
  AgentSkillCategory,
  AgentSkillPack,
  AgentExecutionStatus,
} from './types';

/**
 * Agent engine — re-expanded with skill revision tracking, quality dashboard,
 * seeding, and improvement utilities.
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
  updates: Partial<AgentSkill>,
  changedBy?: string
): Promise<AgentSkill> {
  // 1. Fetch current state for revision snapshot
  const { data: current, error: fetchErr } = await supabase
    .from('agent_skills')
    .select('*')
    .eq('id', skillId)
    .single();
  if (fetchErr || !current) throw new Error(`Skill not found: ${fetchErr?.message ?? skillId}`);

  // 2. Detect which fields actually changed
  const changedFields = Object.keys(updates).filter(key => {
    return JSON.stringify((current as Record<string, unknown>)[key])
      !== JSON.stringify((updates as Record<string, unknown>)[key]);
  });

  // 3. Snapshot before updating (only if something changed)
  if (changedFields.length > 0) {
    const { data: maxRev } = await supabase
      .from('skill_revisions')
      .select('revision_number')
      .eq('skill_id', skillId)
      .order('revision_number', { ascending: false })
      .limit(1)
      .single();

    const nextRevision = (maxRev?.revision_number ?? 0) + 1;

    await supabase.from('skill_revisions').insert({
      skill_id: skillId,
      changed_by: changedBy ?? null,
      change_summary: changedFields.join(', '),
      snapshot: current,
      revision_number: nextRevision,
    });
  }

  // 4. Perform the actual update
  const { data, error } = await supabase
    .from('agent_skills')
    .update(updates)
    .eq('id', skillId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ============================================================================
// SKILL REVISION HISTORY
// ============================================================================

export async function getSkillRevisions(
  supabase: SupabaseClient,
  skillId: string,
  limit = 20
): Promise<SkillRevision[]> {
  const { data, error } = await supabase
    .from('skill_revisions')
    .select('*')
    .eq('skill_id', skillId)
    .order('revision_number', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to get revisions: ${error.message}`);
  return data ?? [];
}

export async function restoreSkillRevision(
  supabase: SupabaseClient,
  skillId: string,
  revisionId: string,
  restoredBy?: string
): Promise<AgentSkill> {
  // 1. Fetch the revision (verify it belongs to this skill)
  const { data: revision, error: revErr } = await supabase
    .from('skill_revisions')
    .select('*')
    .eq('id', revisionId)
    .eq('skill_id', skillId)
    .single();
  if (revErr || !revision) throw new Error(`Revision not found: ${revErr?.message ?? revisionId}`);

  // 2. Extract restorable fields from snapshot
  const snap = revision.snapshot as Record<string, unknown>;
  const restoreFields: Partial<AgentSkill> = {
    name: snap.name as string,
    description: snap.description as string,
    system_prompt: snap.system_prompt as string,
    quality_score: snap.quality_score as number,
    quality_tier: snap.quality_tier as AgentQualityTier,
    quality_notes: (snap.quality_notes as string) ?? null,
    is_active: snap.is_active as boolean,
    icon: (snap.icon as string) ?? null,
    strengths: snap.strengths as string[],
    weaknesses: snap.weaknesses as string[],
    improvement_suggestions: snap.improvement_suggestions as string[],
    reference_docs: snap.reference_docs as AgentSkill['reference_docs'],
  };

  // 3. updateSkill auto-snapshots current state before applying the restore
  return updateSkill(supabase, skillId, restoreFields, restoredBy);
}

// ============================================================================
// QUALITY DASHBOARD
// ============================================================================

export async function getSkillQualityDashboard(
  supabase: SupabaseClient
): Promise<SkillQualityDashboard> {
  // Fetch all skills
  const { data: skills, error: skillsError } = await supabase
    .from('agent_skills')
    .select('*')
    .eq('is_active', true)
    .order('quality_score', { ascending: true });

  if (skillsError) throw new Error(`Failed to fetch skills: ${skillsError.message}`);

  const allSkills = skills ?? [];

  // Count by tier
  const byTier: Record<AgentQualityTier, number> = {
    genuinely_smart: 0,
    solid: 0,
    has_potential: 0,
    placeholder: 0,
    tool_dependent: 0,
  };
  const byCategory: Record<string, number> = {};
  const byPack: Record<string, number> = {};

  let totalScore = 0;
  for (const s of allSkills) {
    byTier[s.quality_tier as AgentQualityTier] = (byTier[s.quality_tier as AgentQualityTier] ?? 0) + 1;
    byCategory[s.category] = (byCategory[s.category] ?? 0) + 1;
    byPack[s.pack] = (byPack[s.pack] ?? 0) + 1;
    totalScore += s.quality_score;
  }

  // Skills needing improvement (score < 60)
  const skillsNeedingImprovement = allSkills.filter((s: AgentSkill) => s.quality_score < 60);

  // Recent improvements
  const { data: improvements } = await supabase
    .from('skill_improvement_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  // Top performers (highest avg quality rating from executions)
  const { data: topPerformers } = await supabase.rpc('get_top_performing_skills', { limit_count: 5 });

  return {
    total_skills: allSkills.length,
    by_tier: byTier,
    by_category: byCategory as Record<AgentSkillCategory, number>,
    by_pack: byPack as Record<AgentSkillPack, number>,
    avg_quality_score: allSkills.length > 0 ? Math.round(totalScore / allSkills.length) : 0,
    skills_needing_improvement: skillsNeedingImprovement,
    recent_improvements: improvements ?? [],
    top_performers: topPerformers ?? [],
  };
}

export async function getExecutionStats(
  supabase: SupabaseClient,
  filters?: {
    board_id?: string;
    skill_id?: string;
    days?: number;
  }
): Promise<AgentExecutionStats> {
  const daysAgo = filters?.days ?? 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysAgo);

  let query = supabase
    .from('agent_executions')
    .select('*, skill:agent_skills(id, name)')
    .gte('created_at', cutoff.toISOString());

  if (filters?.board_id) query = query.eq('board_id', filters.board_id);
  if (filters?.skill_id) query = query.eq('skill_id', filters.skill_id);

  const { data: executions, error } = await query;
  if (error) throw new Error(`Failed to fetch execution stats: ${error.message}`);

  const execs = executions ?? [];
  const successful = execs.filter((e: AgentExecution) => e.status === 'success');
  const totalCost = execs.reduce((sum: number, e: AgentExecution) => sum + (e.cost_usd ?? 0), 0);
  const totalTokens = execs.reduce((sum: number, e: AgentExecution) => sum + (e.input_tokens ?? 0) + (e.output_tokens ?? 0), 0);
  const totalDuration = execs.reduce((sum: number, e: AgentExecution) => sum + (e.duration_ms ?? 0), 0);
  const rated = execs.filter((e: AgentExecution) => e.quality_rating != null);
  const avgRating = rated.length > 0
    ? rated.reduce((sum: number, e: AgentExecution) => sum + (e.quality_rating ?? 0), 0) / rated.length
    : null;

  // By skill
  const skillMap = new Map<string, { name: string; count: number; ratings: number[] }>();
  for (const e of execs) {
    const key = e.skill_id;
    const existing = skillMap.get(key) ?? { name: (e as AgentExecution & { skill?: { name: string } }).skill?.name ?? 'Unknown', count: 0, ratings: [] };
    existing.count++;
    if (e.quality_rating != null) existing.ratings.push(e.quality_rating);
    skillMap.set(key, existing);
  }

  const bySkill = Array.from(skillMap.entries()).map(([id, v]) => ({
    skill_id: id,
    skill_name: v.name,
    count: v.count,
    avg_rating: v.ratings.length > 0 ? v.ratings.reduce((a, b) => a + b, 0) / v.ratings.length : null,
  }));

  // By day
  const dayMap = new Map<string, { count: number; cost: number }>();
  for (const e of execs) {
    const day = e.created_at.split('T')[0];
    const existing = dayMap.get(day) ?? { count: 0, cost: 0 };
    existing.count++;
    existing.cost += e.cost_usd ?? 0;
    dayMap.set(day, existing);
  }

  const byDay = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, count: v.count, cost: v.cost }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    total_executions: execs.length,
    success_rate: execs.length > 0 ? successful.length / execs.length : 0,
    total_cost_usd: totalCost,
    total_tokens: totalTokens,
    avg_duration_ms: execs.length > 0 ? totalDuration / execs.length : 0,
    avg_quality_rating: avgRating,
    by_skill: bySkill,
    by_day: byDay,
  };
}

// ============================================================================
// SEED SKILLS (run once to populate agent_skills table)
// ============================================================================

export async function seedSkills(
  supabase: SupabaseClient,
  skillPrompts: Map<string, string> // slug -> system_prompt content
): Promise<{ created: number; skipped: number }> {
  const { SKILL_SEEDS } = await import('./agent-skill-seeds');

  let created = 0;
  let skipped = 0;

  for (const seed of SKILL_SEEDS) {
    // Check if already exists
    const { data: existing } = await supabase
      .from('agent_skills')
      .select('id')
      .eq('slug', seed.slug)
      .single();

    if (existing) {
      skipped++;
      continue;
    }

    const systemPrompt = skillPrompts.get(seed.slug) ?? `[Skill prompt for ${seed.name} -- to be loaded from Skill.md file]`;

    const { error } = await supabase.from('agent_skills').insert({
      slug: seed.slug,
      name: seed.name,
      description: seed.description,
      category: seed.category,
      pack: seed.pack,
      system_prompt: systemPrompt,
      quality_tier: seed.quality_tier,
      quality_score: seed.quality_score,
      quality_notes: seed.quality_notes,
      strengths: seed.strengths,
      weaknesses: seed.weaknesses,
      improvement_suggestions: seed.improvement_suggestions,
      supported_tools: seed.supported_tools,
      required_context: seed.required_context,
      output_format: seed.output_format,
      estimated_tokens: seed.estimated_tokens,
      depends_on: seed.depends_on,
      feeds_into: seed.feeds_into,
      requires_mcp_tools: seed.requires_mcp_tools,
      fallback_behavior: seed.fallback_behavior,
      reference_docs: seed.reference_docs,
      icon: seed.icon,
      color: seed.color,
      sort_order: seed.sort_order,
      last_quality_review_at: new Date().toISOString(),
      version: '1.0.0',
      is_active: true,
    });

    if (error) {
      console.error(`Failed to seed skill ${seed.slug}:`, error.message);
    } else {
      created++;
    }
  }

  return { created, skipped };
}

/**
 * Updates already-seeded skills with improved quality data and logs the improvements.
 * This is idempotent -- it checks quality_score_before to avoid double-applying.
 */
export async function updateImprovedSkills(
  supabase: SupabaseClient,
  skillPrompts?: Map<string, string> // optional: slug -> updated system_prompt
): Promise<{ updated: number; logged: number; skipped: number }> {
  const { SKILL_SEEDS, IMPROVEMENT_LOG } = await import('./agent-skill-seeds');

  let updated = 0;
  let logged = 0;
  let skipped = 0;

  for (const improvement of IMPROVEMENT_LOG) {
    // Find the skill by slug
    const { data: skill } = await supabase
      .from('agent_skills')
      .select('id, quality_score, quality_tier')
      .eq('slug', improvement.slug)
      .single();

    if (!skill) {
      console.warn(`Skill ${improvement.slug} not found -- skipping improvement`);
      skipped++;
      continue;
    }

    // Check if already applied (score already matches or exceeds target)
    if (skill.quality_score >= improvement.quality_score_after) {
      skipped++;
      continue;
    }

    // Find the updated seed data
    const seed = SKILL_SEEDS.find(s => s.slug === improvement.slug);
    if (!seed) {
      skipped++;
      continue;
    }

    // Update the skill with new quality data
    const updateData: Record<string, unknown> = {
      description: seed.description,
      quality_tier: seed.quality_tier,
      quality_score: seed.quality_score,
      quality_notes: seed.quality_notes,
      strengths: seed.strengths,
      weaknesses: seed.weaknesses,
      improvement_suggestions: seed.improvement_suggestions,
      reference_docs: seed.reference_docs,
      last_quality_review_at: new Date().toISOString(),
    };

    // If updated system prompt provided, apply it
    if (skillPrompts?.has(improvement.slug)) {
      updateData.system_prompt = skillPrompts.get(improvement.slug);
    }

    const { error: updateError } = await supabase
      .from('agent_skills')
      .update(updateData)
      .eq('id', skill.id);

    if (updateError) {
      console.error(`Failed to update skill ${improvement.slug}:`, updateError.message);
      continue;
    }
    updated++;

    // Log the improvement
    const { error: logError } = await supabase
      .from('skill_improvement_log')
      .insert({
        skill_id: skill.id,
        change_type: improvement.change_type,
        change_description: improvement.change_description,
        quality_score_before: improvement.quality_score_before,
        quality_score_after: improvement.quality_score_after,
        quality_tier_before: improvement.quality_tier_before,
        quality_tier_after: improvement.quality_tier_after,
      });

    if (logError) {
      console.error(`Failed to log improvement for ${improvement.slug}:`, logError.message);
    } else {
      logged++;
    }
  }

  return { updated, logged, skipped };
}
