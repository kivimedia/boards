import { SupabaseClient } from '@supabase/supabase-js';
import type {
  AgentSkill,
  BoardAgent,
  AgentExecution,
  AgentToolCall,
  CardAgentTask,
  SkillImprovementLog,
  SkillQualityDashboard,
  AgentExecutionStats,
  AgentQualityTier,
  AgentSkillCategory,
  AgentSkillPack,
  AgentExecutionStatus,
} from './types';

// ============================================================================
// SKILL LIBRARY CRUD
// ============================================================================

export async function listSkills(
  supabase: SupabaseClient,
  filters?: {
    category?: AgentSkillCategory;
    pack?: AgentSkillPack;
    quality_tier?: AgentQualityTier;
    is_active?: boolean;
    search?: string;
  }
): Promise<AgentSkill[]> {
  let query = supabase
    .from('agent_skills')
    .select('*')
    .order('sort_order', { ascending: true });

  if (filters?.category) query = query.eq('category', filters.category);
  if (filters?.pack) query = query.eq('pack', filters.pack);
  if (filters?.quality_tier) query = query.eq('quality_tier', filters.quality_tier);
  if (filters?.is_active !== undefined) query = query.eq('is_active', filters.is_active);
  if (filters?.search) query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list skills: ${error.message}`);
  return data ?? [];
}

export async function getSkill(
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

export async function getSkillBySlug(
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

export async function updateSkill(
  supabase: SupabaseClient,
  skillId: string,
  updates: Partial<AgentSkill>,
  _userId?: string
): Promise<AgentSkill> {
  const { data, error } = await supabase
    .from('agent_skills')
    .update(updates)
    .eq('id', skillId)
    .select()
    .single();
  if (error) throw new Error(`Failed to update skill: ${error.message}`);
  return data;
}

export async function createSkill(
  supabase: SupabaseClient,
  skill: Omit<AgentSkill, 'id' | 'created_at' | 'updated_at'>
): Promise<AgentSkill> {
  const { data, error } = await supabase
    .from('agent_skills')
    .insert(skill)
    .select()
    .single();
  if (error) throw new Error(`Failed to create skill: ${error.message}`);
  return data;
}

// ============================================================================
// BOARD AGENTS CRUD
// ============================================================================

export async function listBoardAgents(
  supabase: SupabaseClient,
  boardId: string,
  includeInactive = false
): Promise<BoardAgent[]> {
  let query = supabase
    .from('board_agents')
    .select('*, skill:agent_skills(*)')
    .eq('board_id', boardId)
    .order('created_at', { ascending: true });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list board agents: ${error.message}`);
  return data ?? [];
}

export async function getBoardAgent(
  supabase: SupabaseClient,
  agentId: string
): Promise<BoardAgent | null> {
  const { data, error } = await supabase
    .from('board_agents')
    .select('*, skill:agent_skills(*)')
    .eq('id', agentId)
    .single();
  if (error) return null;
  return data;
}

export async function addAgentToBoard(
  supabase: SupabaseClient,
  boardId: string,
  skillId: string,
  config?: {
    custom_prompt_additions?: string;
    model_preference?: string;
    auto_trigger_on?: string[];
    requires_confirmation?: boolean;
  }
): Promise<BoardAgent> {
  const { data, error } = await supabase
    .from('board_agents')
    .insert({
      board_id: boardId,
      skill_id: skillId,
      ...config,
    })
    .select('*, skill:agent_skills(*)')
    .single();
  if (error) throw new Error(`Failed to add agent to board: ${error.message}`);
  return data;
}

export async function updateBoardAgent(
  supabase: SupabaseClient,
  agentId: string,
  updates: Partial<BoardAgent>
): Promise<BoardAgent> {
  const { data, error } = await supabase
    .from('board_agents')
    .update(updates)
    .eq('id', agentId)
    .select('*, skill:agent_skills(*)')
    .single();
  if (error) throw new Error(`Failed to update board agent: ${error.message}`);
  return data;
}

export async function removeAgentFromBoard(
  supabase: SupabaseClient,
  agentId: string
): Promise<void> {
  const { error } = await supabase
    .from('board_agents')
    .delete()
    .eq('id', agentId);
  if (error) throw new Error(`Failed to remove agent: ${error.message}`);
}

// ============================================================================
// AGENT EXECUTION
// ============================================================================

export async function createExecution(
  supabase: SupabaseClient,
  params: {
    board_agent_id: string;
    skill_id: string;
    board_id?: string;
    card_id?: string;
    user_id: string;
    trigger_type: string;
    trigger_data?: Record<string, unknown>;
    input_message: string;
    input_context?: Record<string, unknown>;
  }
): Promise<AgentExecution> {
  const { data, error } = await supabase
    .from('agent_executions')
    .insert({
      board_agent_id: params.board_agent_id,
      skill_id: params.skill_id,
      board_id: params.board_id ?? null,
      card_id: params.card_id ?? null,
      user_id: params.user_id,
      trigger_type: params.trigger_type,
      trigger_data: params.trigger_data ?? {},
      input_message: params.input_message,
      input_context: params.input_context ?? {},
      status: 'running',
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create execution: ${error.message}`);
  return data;
}

export async function completeExecution(
  supabase: SupabaseClient,
  executionId: string,
  result: {
    status: AgentExecutionStatus;
    output_response?: string;
    output_artifacts?: { type: string; content: string; filename?: string }[];
    model_used?: string;
    iterations_used?: number;
    input_tokens?: number;
    output_tokens?: number;
    cost_usd?: number;
    duration_ms?: number;
    error_message?: string;
  }
): Promise<AgentExecution> {
  const { data, error } = await supabase
    .from('agent_executions')
    .update({
      ...result,
      completed_at: new Date().toISOString(),
    })
    .eq('id', executionId)
    .select()
    .single();
  if (error) throw new Error(`Failed to complete execution: ${error.message}`);
  return data;
}

export async function rateExecution(
  supabase: SupabaseClient,
  executionId: string,
  rating: {
    quality_rating: number;
    quality_feedback?: string;
    was_useful?: boolean;
  }
): Promise<void> {
  const { error } = await supabase
    .from('agent_executions')
    .update(rating)
    .eq('id', executionId);
  if (error) throw new Error(`Failed to rate execution: ${error.message}`);
}

export async function listExecutions(
  supabase: SupabaseClient,
  filters: {
    board_agent_id?: string;
    skill_id?: string;
    card_id?: string;
    user_id?: string;
    status?: AgentExecutionStatus;
    limit?: number;
    offset?: number;
  }
): Promise<AgentExecution[]> {
  let query = supabase
    .from('agent_executions')
    .select('*, skill:agent_skills(id, name, slug, icon, color)')
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 50);

  if (filters.board_agent_id) query = query.eq('board_agent_id', filters.board_agent_id);
  if (filters.skill_id) query = query.eq('skill_id', filters.skill_id);
  if (filters.card_id) query = query.eq('card_id', filters.card_id);
  if (filters.user_id) query = query.eq('user_id', filters.user_id);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.offset) query = query.range(filters.offset, filters.offset + (filters.limit ?? 50) - 1);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list executions: ${error.message}`);
  return data ?? [];
}

// ============================================================================
// TOOL CALLS
// ============================================================================

export async function createToolCall(
  supabase: SupabaseClient,
  executionId: string,
  toolCall: {
    tool_name: string;
    tool_input: Record<string, unknown>;
    call_order: number;
  }
): Promise<AgentToolCall> {
  const { data, error } = await supabase
    .from('agent_tool_calls')
    .insert({
      execution_id: executionId,
      ...toolCall,
      status: 'pending',
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create tool call: ${error.message}`);
  return data;
}

export async function completeToolCall(
  supabase: SupabaseClient,
  toolCallId: string,
  result: {
    tool_result: Record<string, unknown>;
    status: string;
    error_message?: string;
    duration_ms?: number;
  }
): Promise<void> {
  const { error } = await supabase
    .from('agent_tool_calls')
    .update(result)
    .eq('id', toolCallId);
  if (error) throw new Error(`Failed to complete tool call: ${error.message}`);
}

// ============================================================================
// CARD AGENT TASKS
// ============================================================================

export async function listCardAgentTasks(
  supabase: SupabaseClient,
  cardId: string
): Promise<CardAgentTask[]> {
  const { data, error } = await supabase
    .from('card_agent_tasks')
    .select('*, skill:agent_skills(id, name, slug, icon, color)')
    .eq('card_id', cardId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`Failed to list card agent tasks: ${error.message}`);
  return data ?? [];
}

export async function createCardAgentTask(
  supabase: SupabaseClient,
  task: {
    card_id: string;
    skill_id: string;
    title: string;
    input_prompt?: string;
    created_by: string;
  }
): Promise<CardAgentTask> {
  // Get next sort_order
  const { data: existing } = await supabase
    .from('card_agent_tasks')
    .select('sort_order')
    .eq('card_id', task.card_id)
    .order('sort_order', { ascending: false })
    .limit(1);

  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from('card_agent_tasks')
    .insert({ ...task, sort_order: nextOrder })
    .select('*, skill:agent_skills(id, name, slug, icon, color)')
    .single();
  if (error) throw new Error(`Failed to create card agent task: ${error.message}`);
  return data;
}

export async function updateCardAgentTask(
  supabase: SupabaseClient,
  taskId: string,
  updates: Partial<CardAgentTask>
): Promise<CardAgentTask> {
  const { data, error } = await supabase
    .from('card_agent_tasks')
    .update(updates)
    .eq('id', taskId)
    .select('*, skill:agent_skills(id, name, slug, icon, color)')
    .single();
  if (error) throw new Error(`Failed to update card agent task: ${error.message}`);
  return data;
}

export async function deleteCardAgentTask(
  supabase: SupabaseClient,
  taskId: string
): Promise<void> {
  const { error } = await supabase
    .from('card_agent_tasks')
    .delete()
    .eq('id', taskId);
  if (error) throw new Error(`Failed to delete card agent task: ${error.message}`);
}

// ============================================================================
// SKILL IMPROVEMENT LOG
// ============================================================================

export async function logSkillImprovement(
  supabase: SupabaseClient,
  entry: {
    skill_id: string;
    change_type: string;
    change_description: string;
    quality_score_before?: number;
    quality_score_after?: number;
    quality_tier_before?: string;
    quality_tier_after?: string;
    changed_by?: string;
  }
): Promise<SkillImprovementLog> {
  const { data, error } = await supabase
    .from('skill_improvement_log')
    .insert(entry)
    .select()
    .single();
  if (error) throw new Error(`Failed to log improvement: ${error.message}`);
  return data;
}

export async function getImprovementHistory(
  supabase: SupabaseClient,
  skillId?: string,
  limit = 50
): Promise<SkillImprovementLog[]> {
  let query = supabase
    .from('skill_improvement_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (skillId) query = query.eq('skill_id', skillId);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to get improvement history: ${error.message}`);
  return data ?? [];
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
  skillPrompts: Map<string, string> // slug → system_prompt content
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

    const systemPrompt = skillPrompts.get(seed.slug) ?? `[Skill prompt for ${seed.name} — to be loaded from Skill.md file]`;

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
 * This is idempotent — it checks quality_score_before to avoid double-applying.
 */
export async function updateImprovedSkills(
  supabase: SupabaseClient,
  skillPrompts?: Map<string, string> // optional: slug → updated system_prompt
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
      console.warn(`Skill ${improvement.slug} not found — skipping improvement`);
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

// ============================================================================
// SKILL REVISION HISTORY
// ============================================================================

export async function getSkillRevisions(
  supabase: SupabaseClient,
  skillId: string,
  limit = 20
) {
  const { data, error } = await supabase
    .from('agent_skill_revisions')
    .select('*')
    .eq('skill_id', skillId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch skill revisions: ${error.message}`);
  return data || [];
}

export async function restoreSkillRevision(
  supabase: SupabaseClient,
  skillId: string,
  revisionId: string,
  userId: string
) {
  const { data: revision, error: revErr } = await supabase
    .from('agent_skill_revisions')
    .select('*')
    .eq('id', revisionId)
    .eq('skill_id', skillId)
    .single();

  if (revErr || !revision) throw new Error('Revision not found');

  const currentSkill = await getSkill(supabase, skillId);
  if (currentSkill) {
    await supabase.from('agent_skill_revisions').insert({
      skill_id: skillId,
      changed_by: userId,
      change_type: 'pre_restore_snapshot',
      snapshot: {
        system_prompt: currentSkill.system_prompt,
        quality_score: currentSkill.quality_score,
        quality_tier: currentSkill.quality_tier,
      },
    });
  }

  const updates: Record<string, unknown> = {};
  if (revision.snapshot?.system_prompt) updates.system_prompt = revision.snapshot.system_prompt;
  if (revision.snapshot?.quality_score != null) updates.quality_score = revision.snapshot.quality_score;
  if (revision.snapshot?.quality_tier) updates.quality_tier = revision.snapshot.quality_tier;

  if (Object.keys(updates).length > 0) {
    const { error: updateErr } = await supabase
      .from('agent_skills')
      .update(updates)
      .eq('id', skillId);
    if (updateErr) throw new Error(`Failed to restore revision: ${updateErr.message}`);
  }

  return getSkill(supabase, skillId);
}
