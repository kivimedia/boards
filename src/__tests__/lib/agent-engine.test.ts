import { describe, it, expect } from 'vitest';
import * as agentEngine from '@/lib/agent-engine';
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
} from '@/lib/types';

// ============================================================================
// HELPERS — mock data factories
// ============================================================================

function createMockAgentSkill(overrides: Partial<AgentSkill> = {}): AgentSkill {
  return {
    id: 'skill-1',
    slug: 'blog-writer',
    name: 'Blog Writer',
    description: 'Writes blog posts',
    category: 'content',
    pack: 'skills',
    system_prompt: 'You are a blog writer.',
    quality_tier: 'solid',
    quality_score: 75,
    quality_notes: null,
    strengths: ['SEO', 'engagement'],
    weaknesses: ['technical depth'],
    improvement_suggestions: ['Add more examples'],
    last_quality_review_at: '2025-01-01T00:00:00Z',
    supported_tools: [],
    required_context: ['card'],
    output_format: 'markdown',
    estimated_tokens: 2000,
    depends_on: [],
    feeds_into: [],
    requires_mcp_tools: [],
    fallback_behavior: null,
    reference_docs: [],
    version: '1.0.0',
    is_active: true,
    icon: null,
    color: null,
    sort_order: 0,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockBoardAgent(overrides: Partial<BoardAgent> = {}): BoardAgent {
  return {
    id: 'agent-1',
    board_id: 'board-1',
    skill_id: 'skill-1',
    custom_prompt_additions: null,
    custom_tools: null,
    model_preference: null,
    is_active: true,
    auto_trigger_on: [],
    max_iterations: 3,
    requires_confirmation: false,
    total_executions: 0,
    successful_executions: 0,
    total_tokens_used: 0,
    total_cost_usd: 0,
    avg_quality_rating: null,
    last_executed_at: null,
    created_by: 'user-1',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockExecution(overrides: Partial<AgentExecution> = {}): AgentExecution {
  return {
    id: 'exec-1',
    board_agent_id: 'agent-1',
    skill_id: 'skill-1',
    board_id: 'board-1',
    card_id: 'card-1',
    user_id: 'user-1',
    trigger_type: 'manual',
    trigger_data: {},
    input_message: 'Test input',
    input_context: {},
    output_response: null,
    output_artifacts: [],
    model_used: null,
    iterations_used: 0,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    duration_ms: null,
    status: 'running',
    error_message: null,
    quality_rating: null,
    quality_feedback: null,
    was_useful: null,
    created_at: '2025-01-01T00:00:00Z',
    completed_at: null,
    ...overrides,
  };
}

function createMockCardAgentTask(overrides: Partial<CardAgentTask> = {}): CardAgentTask {
  return {
    id: 'task-1',
    card_id: 'card-1',
    skill_id: 'skill-1',
    execution_id: null,
    title: 'Write blog post',
    input_prompt: null,
    status: 'pending',
    output_preview: null,
    output_full: null,
    output_artifacts: [],
    quality_rating: null,
    was_applied: false,
    sort_order: 0,
    created_by: 'user-1',
    created_at: '2025-01-01T00:00:00Z',
    completed_at: null,
    ...overrides,
  };
}

function createMockImprovementLog(overrides: Partial<SkillImprovementLog> = {}): SkillImprovementLog {
  return {
    id: 'log-1',
    skill_id: 'skill-1',
    change_type: 'prompt_update',
    change_description: 'Improved prompt clarity',
    quality_score_before: 60,
    quality_score_after: 75,
    quality_tier_before: 'has_potential',
    quality_tier_after: 'solid',
    changed_by: 'user-1',
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Agent Engine', () => {
  // --------------------------------------------------------------------------
  // Exports existence
  // --------------------------------------------------------------------------
  describe('module exports', () => {
    it('exports listSkills as a function', () => {
      expect(typeof agentEngine.listSkills).toBe('function');
    });

    it('exports getSkill as a function', () => {
      expect(typeof agentEngine.getSkill).toBe('function');
    });

    it('exports getSkillBySlug as a function', () => {
      expect(typeof agentEngine.getSkillBySlug).toBe('function');
    });

    it('exports updateSkill as a function', () => {
      expect(typeof agentEngine.updateSkill).toBe('function');
    });

    it('exports createSkill as a function', () => {
      expect(typeof agentEngine.createSkill).toBe('function');
    });

    it('exports seedSkills as a function', () => {
      expect(typeof agentEngine.seedSkills).toBe('function');
    });

    it('exports updateImprovedSkills as a function', () => {
      expect(typeof agentEngine.updateImprovedSkills).toBe('function');
    });

    it('exports listBoardAgents as a function', () => {
      expect(typeof agentEngine.listBoardAgents).toBe('function');
    });

    it('exports getBoardAgent as a function', () => {
      expect(typeof agentEngine.getBoardAgent).toBe('function');
    });

    it('exports addAgentToBoard as a function', () => {
      expect(typeof agentEngine.addAgentToBoard).toBe('function');
    });

    it('exports updateBoardAgent as a function', () => {
      expect(typeof agentEngine.updateBoardAgent).toBe('function');
    });

    it('exports removeAgentFromBoard as a function', () => {
      expect(typeof agentEngine.removeAgentFromBoard).toBe('function');
    });

    it('exports createExecution as a function', () => {
      expect(typeof agentEngine.createExecution).toBe('function');
    });

    it('exports completeExecution as a function', () => {
      expect(typeof agentEngine.completeExecution).toBe('function');
    });

    it('exports rateExecution as a function', () => {
      expect(typeof agentEngine.rateExecution).toBe('function');
    });

    it('exports listExecutions as a function', () => {
      expect(typeof agentEngine.listExecutions).toBe('function');
    });

    it('exports createToolCall as a function', () => {
      expect(typeof agentEngine.createToolCall).toBe('function');
    });

    it('exports completeToolCall as a function', () => {
      expect(typeof agentEngine.completeToolCall).toBe('function');
    });

    it('exports listCardAgentTasks as a function', () => {
      expect(typeof agentEngine.listCardAgentTasks).toBe('function');
    });

    it('exports createCardAgentTask as a function', () => {
      expect(typeof agentEngine.createCardAgentTask).toBe('function');
    });

    it('exports updateCardAgentTask as a function', () => {
      expect(typeof agentEngine.updateCardAgentTask).toBe('function');
    });

    it('exports deleteCardAgentTask as a function', () => {
      expect(typeof agentEngine.deleteCardAgentTask).toBe('function');
    });

    it('exports logSkillImprovement as a function', () => {
      expect(typeof agentEngine.logSkillImprovement).toBe('function');
    });

    it('exports getImprovementHistory as a function', () => {
      expect(typeof agentEngine.getImprovementHistory).toBe('function');
    });

    it('exports getSkillQualityDashboard as a function', () => {
      expect(typeof agentEngine.getSkillQualityDashboard).toBe('function');
    });

    it('exports getExecutionStats as a function', () => {
      expect(typeof agentEngine.getExecutionStats).toBe('function');
    });
  });

  // --------------------------------------------------------------------------
  // Function arity
  // --------------------------------------------------------------------------
  describe('function arity', () => {
    it('listSkills accepts 1-2 arguments (supabase, filters?)', () => {
      expect(agentEngine.listSkills.length).toBeGreaterThanOrEqual(1);
      expect(agentEngine.listSkills.length).toBeLessThanOrEqual(2);
    });

    it('getSkill accepts 2 arguments (supabase, skillId)', () => {
      expect(agentEngine.getSkill.length).toBe(2);
    });

    it('getSkillBySlug accepts 2 arguments (supabase, slug)', () => {
      expect(agentEngine.getSkillBySlug.length).toBe(2);
    });

    it('updateSkill accepts 3-4 arguments (supabase, skillId, updates, userId?)', () => {
      expect(agentEngine.updateSkill.length).toBeGreaterThanOrEqual(3);
    });

    it('createSkill accepts 2 arguments (supabase, skill)', () => {
      expect(agentEngine.createSkill.length).toBe(2);
    });

    it('seedSkills accepts 2 arguments (supabase, skillPrompts)', () => {
      expect(agentEngine.seedSkills.length).toBe(2);
    });

    it('listBoardAgents has at least 2 required params (supabase, boardId)', () => {
      expect(agentEngine.listBoardAgents.length).toBeGreaterThanOrEqual(2);
    });

    it('getBoardAgent accepts 2 arguments (supabase, agentId)', () => {
      expect(agentEngine.getBoardAgent.length).toBe(2);
    });

    it('addAgentToBoard accepts at least 3 arguments (supabase, boardId, skillId)', () => {
      expect(agentEngine.addAgentToBoard.length).toBeGreaterThanOrEqual(3);
    });

    it('updateBoardAgent accepts 3 arguments (supabase, agentId, updates)', () => {
      expect(agentEngine.updateBoardAgent.length).toBe(3);
    });

    it('removeAgentFromBoard accepts 2 arguments (supabase, agentId)', () => {
      expect(agentEngine.removeAgentFromBoard.length).toBe(2);
    });

    it('createExecution accepts 2 arguments (supabase, params)', () => {
      expect(agentEngine.createExecution.length).toBe(2);
    });

    it('completeExecution accepts 3 arguments (supabase, executionId, result)', () => {
      expect(agentEngine.completeExecution.length).toBe(3);
    });

    it('rateExecution accepts 3 arguments (supabase, executionId, rating)', () => {
      expect(agentEngine.rateExecution.length).toBe(3);
    });

    it('listExecutions accepts 2 arguments (supabase, filters)', () => {
      expect(agentEngine.listExecutions.length).toBe(2);
    });

    it('createToolCall accepts 3 arguments (supabase, executionId, toolCall)', () => {
      expect(agentEngine.createToolCall.length).toBe(3);
    });

    it('completeToolCall accepts 3 arguments (supabase, toolCallId, result)', () => {
      expect(agentEngine.completeToolCall.length).toBe(3);
    });

    it('listCardAgentTasks accepts 2 arguments (supabase, cardId)', () => {
      expect(agentEngine.listCardAgentTasks.length).toBe(2);
    });

    it('createCardAgentTask accepts 2 arguments (supabase, task)', () => {
      expect(agentEngine.createCardAgentTask.length).toBe(2);
    });

    it('updateCardAgentTask accepts 3 arguments (supabase, taskId, updates)', () => {
      expect(agentEngine.updateCardAgentTask.length).toBe(3);
    });

    it('deleteCardAgentTask accepts 2 arguments (supabase, taskId)', () => {
      expect(agentEngine.deleteCardAgentTask.length).toBe(2);
    });

    it('logSkillImprovement accepts 2 arguments (supabase, entry)', () => {
      expect(agentEngine.logSkillImprovement.length).toBe(2);
    });

    it('getImprovementHistory has at least 1 required param (supabase)', () => {
      expect(agentEngine.getImprovementHistory.length).toBeGreaterThanOrEqual(1);
    });

    it('getSkillQualityDashboard accepts 1 argument (supabase)', () => {
      expect(agentEngine.getSkillQualityDashboard.length).toBe(1);
    });

    it('getExecutionStats has at least 1 required param (supabase)', () => {
      expect(agentEngine.getExecutionStats.length).toBeGreaterThanOrEqual(1);
    });
  });

  // --------------------------------------------------------------------------
  // Interface shapes (via mock factories)
  // --------------------------------------------------------------------------
  describe('AgentSkill interface shape', () => {
    const skill = createMockAgentSkill();

    it('has required string fields', () => {
      expect(typeof skill.id).toBe('string');
      expect(typeof skill.slug).toBe('string');
      expect(typeof skill.name).toBe('string');
      expect(typeof skill.description).toBe('string');
      expect(typeof skill.system_prompt).toBe('string');
      expect(typeof skill.output_format).toBe('string');
      expect(typeof skill.version).toBe('string');
    });

    it('has required numeric fields', () => {
      expect(typeof skill.quality_score).toBe('number');
      expect(typeof skill.estimated_tokens).toBe('number');
      expect(typeof skill.sort_order).toBe('number');
    });

    it('has required boolean field is_active', () => {
      expect(typeof skill.is_active).toBe('boolean');
    });

    it('has required array fields', () => {
      expect(Array.isArray(skill.strengths)).toBe(true);
      expect(Array.isArray(skill.weaknesses)).toBe(true);
      expect(Array.isArray(skill.improvement_suggestions)).toBe(true);
      expect(Array.isArray(skill.supported_tools)).toBe(true);
      expect(Array.isArray(skill.required_context)).toBe(true);
      expect(Array.isArray(skill.depends_on)).toBe(true);
      expect(Array.isArray(skill.feeds_into)).toBe(true);
      expect(Array.isArray(skill.requires_mcp_tools)).toBe(true);
      expect(Array.isArray(skill.reference_docs)).toBe(true);
    });

    it('category is a valid AgentSkillCategory value', () => {
      const valid: AgentSkillCategory[] = ['content', 'creative', 'strategy', 'seo', 'meta'];
      expect(valid).toContain(skill.category);
    });

    it('pack is a valid AgentSkillPack value', () => {
      const valid: AgentSkillPack[] = ['skills', 'creative', 'custom'];
      expect(valid).toContain(skill.pack);
    });

    it('quality_tier is a valid AgentQualityTier value', () => {
      const valid: AgentQualityTier[] = [
        'genuinely_smart', 'solid', 'has_potential', 'placeholder', 'tool_dependent',
      ];
      expect(valid).toContain(skill.quality_tier);
    });
  });

  describe('BoardAgent interface shape', () => {
    const agent = createMockBoardAgent();

    it('has required string fields', () => {
      expect(typeof agent.id).toBe('string');
      expect(typeof agent.board_id).toBe('string');
      expect(typeof agent.skill_id).toBe('string');
    });

    it('has required numeric fields', () => {
      expect(typeof agent.max_iterations).toBe('number');
      expect(typeof agent.total_executions).toBe('number');
      expect(typeof agent.successful_executions).toBe('number');
      expect(typeof agent.total_tokens_used).toBe('number');
      expect(typeof agent.total_cost_usd).toBe('number');
    });

    it('has required boolean fields', () => {
      expect(typeof agent.is_active).toBe('boolean');
      expect(typeof agent.requires_confirmation).toBe('boolean');
    });

    it('auto_trigger_on is an array', () => {
      expect(Array.isArray(agent.auto_trigger_on)).toBe(true);
    });

    it('nullable fields can be null', () => {
      const agentWithNulls = createMockBoardAgent({
        custom_prompt_additions: null,
        custom_tools: null,
        model_preference: null,
        avg_quality_rating: null,
        last_executed_at: null,
      });
      expect(agentWithNulls.custom_prompt_additions).toBeNull();
      expect(agentWithNulls.custom_tools).toBeNull();
      expect(agentWithNulls.model_preference).toBeNull();
      expect(agentWithNulls.avg_quality_rating).toBeNull();
      expect(agentWithNulls.last_executed_at).toBeNull();
    });
  });

  describe('AgentExecution interface shape', () => {
    const exec = createMockExecution();

    it('has required string fields', () => {
      expect(typeof exec.id).toBe('string');
      expect(typeof exec.board_agent_id).toBe('string');
      expect(typeof exec.skill_id).toBe('string');
      expect(typeof exec.user_id).toBe('string');
      expect(typeof exec.input_message).toBe('string');
    });

    it('status is a valid AgentExecutionStatus', () => {
      const valid: AgentExecutionStatus[] = ['running', 'success', 'failed', 'cancelled', 'pending_confirmation'];
      expect(valid).toContain(exec.status);
    });

    it('trigger_data and input_context are objects', () => {
      expect(typeof exec.trigger_data).toBe('object');
      expect(typeof exec.input_context).toBe('object');
    });

    it('output_artifacts is an array', () => {
      expect(Array.isArray(exec.output_artifacts)).toBe(true);
    });

    it('numeric fields are numbers', () => {
      expect(typeof exec.iterations_used).toBe('number');
      expect(typeof exec.input_tokens).toBe('number');
      expect(typeof exec.output_tokens).toBe('number');
      expect(typeof exec.cost_usd).toBe('number');
    });
  });

  describe('CardAgentTask interface shape', () => {
    const task = createMockCardAgentTask();

    it('has required string fields', () => {
      expect(typeof task.id).toBe('string');
      expect(typeof task.card_id).toBe('string');
      expect(typeof task.skill_id).toBe('string');
      expect(typeof task.title).toBe('string');
    });

    it('has required boolean was_applied field', () => {
      expect(typeof task.was_applied).toBe('boolean');
    });

    it('output_artifacts is an array', () => {
      expect(Array.isArray(task.output_artifacts)).toBe(true);
    });

    it('status is a valid CardAgentTaskStatus', () => {
      const valid = ['pending', 'running', 'completed', 'failed', 'cancelled'];
      expect(valid).toContain(task.status);
    });
  });

  describe('SkillImprovementLog interface shape', () => {
    const log = createMockImprovementLog();

    it('has required string fields', () => {
      expect(typeof log.id).toBe('string');
      expect(typeof log.skill_id).toBe('string');
      expect(typeof log.change_type).toBe('string');
      expect(typeof log.change_description).toBe('string');
    });

    it('score fields are numbers or null', () => {
      expect(typeof log.quality_score_before === 'number' || log.quality_score_before === null).toBe(true);
      expect(typeof log.quality_score_after === 'number' || log.quality_score_after === null).toBe(true);
    });

    it('tier fields are strings or null', () => {
      expect(typeof log.quality_tier_before === 'string' || log.quality_tier_before === null).toBe(true);
      expect(typeof log.quality_tier_after === 'string' || log.quality_tier_after === null).toBe(true);
    });
  });

  describe('SkillQualityDashboard interface shape', () => {
    it('has the expected structure with correct field types', () => {
      const dashboard: SkillQualityDashboard = {
        total_skills: 16,
        by_tier: {
          genuinely_smart: 3,
          solid: 5,
          has_potential: 4,
          placeholder: 2,
          tool_dependent: 2,
        },
        by_category: { content: 5, creative: 4, strategy: 3, seo: 2, meta: 2 },
        by_pack: { skills: 10, creative: 4, custom: 2 },
        avg_quality_score: 68,
        skills_needing_improvement: [],
        recent_improvements: [],
        top_performers: [],
      };

      expect(typeof dashboard.total_skills).toBe('number');
      expect(typeof dashboard.avg_quality_score).toBe('number');
      expect(typeof dashboard.by_tier).toBe('object');
      expect(typeof dashboard.by_category).toBe('object');
      expect(typeof dashboard.by_pack).toBe('object');
      expect(Array.isArray(dashboard.skills_needing_improvement)).toBe(true);
      expect(Array.isArray(dashboard.recent_improvements)).toBe(true);
      expect(Array.isArray(dashboard.top_performers)).toBe(true);
    });

    it('by_tier covers all 5 quality tiers', () => {
      const tiers: AgentQualityTier[] = [
        'genuinely_smart', 'solid', 'has_potential', 'placeholder', 'tool_dependent',
      ];
      const dashboard: SkillQualityDashboard = {
        total_skills: 0,
        by_tier: { genuinely_smart: 0, solid: 0, has_potential: 0, placeholder: 0, tool_dependent: 0 },
        by_category: {} as Record<AgentSkillCategory, number>,
        by_pack: {} as Record<AgentSkillPack, number>,
        avg_quality_score: 0,
        skills_needing_improvement: [],
        recent_improvements: [],
        top_performers: [],
      };

      for (const tier of tiers) {
        expect(tier in dashboard.by_tier).toBe(true);
      }
    });
  });

  describe('AgentExecutionStats interface shape', () => {
    it('has the expected structure', () => {
      const stats: AgentExecutionStats = {
        total_executions: 100,
        success_rate: 0.85,
        total_cost_usd: 12.5,
        total_tokens: 500000,
        avg_duration_ms: 3200,
        avg_quality_rating: 4.2,
        by_skill: [
          { skill_id: 's1', skill_name: 'Blog Writer', count: 50, avg_rating: 4.5 },
        ],
        by_day: [
          { date: '2025-01-15', count: 10, cost: 1.2 },
        ],
      };

      expect(typeof stats.total_executions).toBe('number');
      expect(typeof stats.success_rate).toBe('number');
      expect(typeof stats.total_cost_usd).toBe('number');
      expect(typeof stats.total_tokens).toBe('number');
      expect(typeof stats.avg_duration_ms).toBe('number');
      expect(Array.isArray(stats.by_skill)).toBe(true);
      expect(Array.isArray(stats.by_day)).toBe(true);
    });

    it('by_skill entries have the correct shape', () => {
      const entry = { skill_id: 's1', skill_name: 'Writer', count: 10, avg_rating: 4.0 as number | null };
      expect(typeof entry.skill_id).toBe('string');
      expect(typeof entry.skill_name).toBe('string');
      expect(typeof entry.count).toBe('number');
    });

    it('by_day entries have the correct shape', () => {
      const entry = { date: '2025-01-15', count: 10, cost: 1.25 };
      expect(typeof entry.date).toBe('string');
      expect(typeof entry.count).toBe('number');
      expect(typeof entry.cost).toBe('number');
    });

    it('avg_quality_rating can be null', () => {
      const stats: AgentExecutionStats = {
        total_executions: 0,
        success_rate: 0,
        total_cost_usd: 0,
        total_tokens: 0,
        avg_duration_ms: 0,
        avg_quality_rating: null,
        by_skill: [],
        by_day: [],
      };
      expect(stats.avg_quality_rating).toBeNull();
    });
  });
});
