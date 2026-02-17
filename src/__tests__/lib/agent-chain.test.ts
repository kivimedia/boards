import { describe, it, expect } from 'vitest';
import { topologicalSort } from '@/lib/ai/agent-chain';
import type { AgentSkill } from '@/lib/types';

// ============================================================================
// HELPER: minimal skill factory
// ============================================================================

function makeSkill(slug: string, dependsOn: string[] = []): AgentSkill {
  return {
    id: `id-${slug}`,
    slug,
    name: slug,
    description: '',
    category: 'content',
    pack: 'skills',
    system_prompt: '',
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
    depends_on: dependsOn,
    feeds_into: [],
    requires_mcp_tools: [],
    fallback_behavior: null,
    reference_docs: [],
    icon: '',
    color: '',
    sort_order: 0,
    is_active: true,
    last_quality_review_at: null,
    version: '1.0.0',
    created_at: '',
    updated_at: '',
  } as AgentSkill;
}

// ============================================================================
// TOPOLOGICAL SORT TESTS
// ============================================================================

describe('topologicalSort', () => {
  it('returns single skill when no dependencies', () => {
    const skills = [makeSkill('a')];
    const result = topologicalSort(skills, 'a');
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('a');
  });

  it('returns skills in dependency order', () => {
    const skills = [
      makeSkill('a'),
      makeSkill('b', ['a']),
      makeSkill('c', ['b']),
    ];
    const result = topologicalSort(skills, 'c');
    const slugs = result.map(s => s.slug);
    expect(slugs).toEqual(['a', 'b', 'c']);
  });

  it('handles diamond dependencies', () => {
    // D depends on both B and C, which both depend on A
    const skills = [
      makeSkill('a'),
      makeSkill('b', ['a']),
      makeSkill('c', ['a']),
      makeSkill('d', ['b', 'c']),
    ];
    const result = topologicalSort(skills, 'd');
    const slugs = result.map(s => s.slug);

    // A must come before B and C, D must be last
    expect(slugs.indexOf('a')).toBeLessThan(slugs.indexOf('b'));
    expect(slugs.indexOf('a')).toBeLessThan(slugs.indexOf('c'));
    expect(slugs[slugs.length - 1]).toBe('d');
    expect(result).toHaveLength(4);
  });

  it('handles multiple independent dependencies', () => {
    const skills = [
      makeSkill('a'),
      makeSkill('b'),
      makeSkill('c', ['a', 'b']),
    ];
    const result = topologicalSort(skills, 'c');
    const slugs = result.map(s => s.slug);
    expect(slugs).toContain('a');
    expect(slugs).toContain('b');
    expect(slugs[slugs.length - 1]).toBe('c');
  });

  it('throws on circular dependency', () => {
    const skills = [
      makeSkill('a', ['b']),
      makeSkill('b', ['a']),
    ];
    expect(() => topologicalSort(skills, 'a')).toThrow('Circular dependency');
  });

  it('throws on self-referencing dependency', () => {
    const skills = [
      makeSkill('a', ['a']),
    ];
    expect(() => topologicalSort(skills, 'a')).toThrow('Circular dependency');
  });

  it('throws when target skill not found', () => {
    const skills = [makeSkill('a')];
    expect(() => topologicalSort(skills, 'missing')).toThrow('Target skill "missing" not found');
  });

  it('ignores missing dependencies gracefully', () => {
    // B depends on "missing" which doesn't exist in the skills list
    const skills = [
      makeSkill('a'),
      makeSkill('b', ['a', 'missing']),
    ];
    const result = topologicalSort(skills, 'b');
    const slugs = result.map(s => s.slug);
    expect(slugs).toEqual(['a', 'b']);
  });

  it('returns only relevant dependencies (not all skills)', () => {
    const skills = [
      makeSkill('a'),
      makeSkill('b'),
      makeSkill('c', ['a']),
      makeSkill('unrelated'),
    ];
    const result = topologicalSort(skills, 'c');
    const slugs = result.map(s => s.slug);
    expect(slugs).toContain('a');
    expect(slugs).toContain('c');
    expect(slugs).not.toContain('b');
    expect(slugs).not.toContain('unrelated');
  });

  it('handles deep chains', () => {
    const skills = [
      makeSkill('a'),
      makeSkill('b', ['a']),
      makeSkill('c', ['b']),
      makeSkill('d', ['c']),
      makeSkill('e', ['d']),
    ];
    const result = topologicalSort(skills, 'e');
    expect(result.map(s => s.slug)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('detects circular dependency in longer chain', () => {
    const skills = [
      makeSkill('a', ['c']),
      makeSkill('b', ['a']),
      makeSkill('c', ['b']),
    ];
    expect(() => topologicalSort(skills, 'c')).toThrow('Circular dependency');
  });
});

// ============================================================================
// CHAIN PLAN STRUCTURE
// ============================================================================

describe('Chain plan structure', () => {
  it('SkillChainStep has required fields', () => {
    // This is a type-level check -- we verify the shape used in topologicalSort output
    const skills = [makeSkill('a'), makeSkill('b', ['a'])];
    const result = topologicalSort(skills, 'b');
    for (const skill of result) {
      expect(skill.slug).toBeTruthy();
      expect(skill.name).toBeTruthy();
      expect(typeof skill.estimated_tokens).toBe('number');
    }
  });
});
