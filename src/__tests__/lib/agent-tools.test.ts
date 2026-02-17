import { describe, it, expect } from 'vitest';
import {
  getAgentToolDefinitions,
  needsAgentConfirmation,
  shouldIncludeWebSearch,
  buildAgentConfirmationMessage,
  _AGENT_TOOL_DEFINITIONS_FOR_TESTING as TOOL_DEFS,
} from '@/lib/ai/agent-tools';
import type { AgentSkill, BoardAgent } from '@/lib/types';

// ============================================================================
// HELPER: minimal skill/boardAgent factories
// ============================================================================

function makeSkill(overrides: Partial<AgentSkill> = {}): AgentSkill {
  return {
    id: 'test-skill-id',
    slug: 'test-skill',
    name: 'Test Skill',
    description: 'A test skill',
    category: 'content',
    pack: 'skills',
    system_prompt: 'You are a test skill.',
    quality_tier: 'solid',
    quality_score: 70,
    quality_notes: '',
    strengths: [],
    weaknesses: [],
    improvement_suggestions: [],
    supported_tools: [],
    required_context: [],
    output_format: 'text',
    estimated_tokens: 2000,
    depends_on: [],
    feeds_into: [],
    requires_mcp_tools: [],
    fallback_behavior: null,
    reference_docs: [],
    icon: '🤖',
    color: '#000',
    sort_order: 0,
    is_active: true,
    last_quality_review_at: null,
    version: '1.0.0',
    created_at: '',
    updated_at: '',
    ...overrides,
  } as AgentSkill;
}

function makeBoardAgent(overrides: Partial<BoardAgent> = {}): BoardAgent {
  return {
    id: 'test-ba-id',
    board_id: 'test-board',
    skill_id: 'test-skill-id',
    is_active: true,
    custom_prompt_additions: null,
    custom_tools: null,
    requires_confirmation: true,
    max_iterations: 10,
    model_preference: null,
    auto_trigger_on: [],
    total_executions: 0,
    successful_executions: 0,
    total_tokens_used: 0,
    total_cost_usd: 0,
    avg_quality_rating: null,
    last_executed_at: null,
    created_by: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  } as BoardAgent;
}

// ============================================================================
// TOOL DEFINITION SCHEMA TESTS
// ============================================================================

describe('Agent tool definitions', () => {
  it('defines 9 tools (think + 8 board tools)', () => {
    expect(TOOL_DEFS).toHaveLength(9);
  });

  it('every tool has name, description, input_schema', () => {
    for (const tool of TOOL_DEFS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.input_schema).toBeTruthy();
      expect(tool.input_schema.type).toBe('object');
    }
  });

  it('every tool has _meta with category and needs_confirmation', () => {
    for (const tool of TOOL_DEFS) {
      expect(tool._meta).toBeDefined();
      expect(tool._meta.category).toBeTruthy();
      expect(typeof tool._meta.needs_confirmation).toBe('boolean');
    }
  });

  it('think tool is internal and does not need confirmation', () => {
    const think = TOOL_DEFS.find(t => t.name === 'think')!;
    expect(think._meta.category).toBe('internal');
    expect(think._meta.needs_confirmation).toBe(false);
  });

  it('read tools do not need confirmation', () => {
    const readTools = TOOL_DEFS.filter(t => t._meta.category === 'read');
    expect(readTools.length).toBeGreaterThanOrEqual(4);
    for (const t of readTools) {
      expect(t._meta.needs_confirmation).toBe(false);
    }
  });

  it('write tools that need confirmation: create_card, update_card, move_card', () => {
    const writeConfirm = TOOL_DEFS.filter(t => t._meta.category === 'write' && t._meta.needs_confirmation);
    const names = writeConfirm.map(t => t.name).sort();
    expect(names).toEqual(['create_card', 'move_card', 'update_card']);
  });

  it('add_comment is a write tool but does NOT need confirmation', () => {
    const addComment = TOOL_DEFS.find(t => t.name === 'add_comment')!;
    expect(addComment._meta.category).toBe('write');
    expect(addComment._meta.needs_confirmation).toBe(false);
  });

  it('tool names are unique', () => {
    const names = TOOL_DEFS.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

// ============================================================================
// TOOL FILTERING TESTS
// ============================================================================

describe('getAgentToolDefinitions', () => {
  it('returns empty array when skill has no supported_tools', () => {
    const skill = makeSkill({ supported_tools: [] });
    expect(getAgentToolDefinitions(skill)).toEqual([]);
  });

  it('returns matching tools when skill has supported_tools', () => {
    const skill = makeSkill({ supported_tools: ['list_cards', 'get_card'] });
    const tools = getAgentToolDefinitions(skill);
    const names = tools.map(t => t.name);
    // Should include think (always), list_cards, get_card
    expect(names).toContain('think');
    expect(names).toContain('list_cards');
    expect(names).toContain('get_card');
    expect(names).not.toContain('create_card');
  });

  it('always includes think when any tools are enabled', () => {
    const skill = makeSkill({ supported_tools: ['search_cards'] });
    const tools = getAgentToolDefinitions(skill);
    expect(tools.some(t => t.name === 'think')).toBe(true);
  });

  it('does not duplicate think if explicitly listed', () => {
    const skill = makeSkill({ supported_tools: ['think', 'list_cards'] });
    const tools = getAgentToolDefinitions(skill);
    const thinkCount = tools.filter(t => t.name === 'think').length;
    expect(thinkCount).toBe(1);
  });

  it('further filters by boardAgent.custom_tools', () => {
    const skill = makeSkill({ supported_tools: ['list_cards', 'get_card', 'create_card'] });
    const ba = makeBoardAgent({ custom_tools: ['list_cards', 'get_card'] });
    const tools = getAgentToolDefinitions(skill, ba);
    const names = tools.map(t => t.name);
    expect(names).toContain('list_cards');
    expect(names).toContain('get_card');
    expect(names).not.toContain('create_card');
  });

  it('strips _meta from returned tools', () => {
    const skill = makeSkill({ supported_tools: ['list_cards'] });
    const tools = getAgentToolDefinitions(skill);
    for (const t of tools) {
      expect((t as any)._meta).toBeUndefined();
    }
  });

  it('boardAgent with empty custom_tools does not restrict', () => {
    const skill = makeSkill({ supported_tools: ['list_cards', 'get_card'] });
    const ba = makeBoardAgent({ custom_tools: [] });
    const tools = getAgentToolDefinitions(skill, ba);
    // Empty custom_tools means no restriction (length 0 check)
    expect(tools.length).toBeGreaterThanOrEqual(2);
  });

  it('boardAgent null does not restrict', () => {
    const skill = makeSkill({ supported_tools: ['list_cards'] });
    const tools = getAgentToolDefinitions(skill, null);
    expect(tools.some(t => t.name === 'list_cards')).toBe(true);
  });
});

// ============================================================================
// CONFIRMATION LOGIC TESTS
// ============================================================================

describe('needsAgentConfirmation', () => {
  it('returns false for read tools', () => {
    expect(needsAgentConfirmation('list_cards')).toBe(false);
    expect(needsAgentConfirmation('get_card')).toBe(false);
    expect(needsAgentConfirmation('search_cards')).toBe(false);
    expect(needsAgentConfirmation('get_board_summary')).toBe(false);
  });

  it('returns false for think tool', () => {
    expect(needsAgentConfirmation('think')).toBe(false);
  });

  it('returns true for write tools that need confirmation (no boardAgent)', () => {
    expect(needsAgentConfirmation('create_card')).toBe(true);
    expect(needsAgentConfirmation('update_card')).toBe(true);
    expect(needsAgentConfirmation('move_card')).toBe(true);
  });

  it('returns false for add_comment (write but no confirmation)', () => {
    expect(needsAgentConfirmation('add_comment')).toBe(false);
  });

  it('returns false when boardAgent.requires_confirmation is false', () => {
    const ba = makeBoardAgent({ requires_confirmation: false });
    expect(needsAgentConfirmation('create_card', ba)).toBe(false);
    expect(needsAgentConfirmation('update_card', ba)).toBe(false);
  });

  it('returns true when boardAgent.requires_confirmation is true', () => {
    const ba = makeBoardAgent({ requires_confirmation: true });
    expect(needsAgentConfirmation('create_card', ba)).toBe(true);
  });

  it('returns false for unknown tools', () => {
    expect(needsAgentConfirmation('unknown_tool')).toBe(false);
  });
});

// ============================================================================
// WEB SEARCH INCLUSION
// ============================================================================

describe('shouldIncludeWebSearch', () => {
  it('returns true when skill has web_search in supported_tools', () => {
    const skill = makeSkill({ supported_tools: ['web_search', 'list_cards'] });
    expect(shouldIncludeWebSearch(skill)).toBe(true);
  });

  it('returns false when skill does not have web_search', () => {
    const skill = makeSkill({ supported_tools: ['list_cards'] });
    expect(shouldIncludeWebSearch(skill)).toBe(false);
  });

  it('returns false when skill has empty supported_tools', () => {
    const skill = makeSkill({ supported_tools: [] });
    expect(shouldIncludeWebSearch(skill)).toBe(false);
  });
});

// ============================================================================
// CONFIRMATION MESSAGES
// ============================================================================

describe('buildAgentConfirmationMessage', () => {
  it('builds message for create_card', () => {
    const msg = buildAgentConfirmationMessage('create_card', { title: 'New Task', list_name: 'To Do' });
    expect(msg).toContain('Create card');
    expect(msg).toContain('New Task');
    expect(msg).toContain('To Do');
  });

  it('builds message for update_card', () => {
    const msg = buildAgentConfirmationMessage('update_card', { card_id: 'abc', priority: 'urgent', title: 'Updated' });
    expect(msg).toContain('Update card');
    expect(msg).toContain('priority');
    expect(msg).toContain('title');
  });

  it('builds message for move_card', () => {
    const msg = buildAgentConfirmationMessage('move_card', { card_id: 'abc', target_list_name: 'Done' });
    expect(msg).toContain('Move card');
    expect(msg).toContain('Done');
  });

  it('builds generic message for unknown tools', () => {
    const msg = buildAgentConfirmationMessage('custom_tool', {});
    expect(msg).toContain('Execute');
    expect(msg).toContain('custom_tool');
  });
});
