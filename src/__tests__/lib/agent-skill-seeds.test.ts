import { describe, it, expect } from 'vitest';
import { SKILL_SEEDS, IMPROVEMENT_LOG } from '@/lib/agent-skill-seeds';
import type { SkillSeed, ImprovementEntry } from '@/lib/agent-skill-seeds';

// ===========================================================================
// SKILL_SEEDS count & structure
// ===========================================================================

describe('Agent Skill Seeds - SKILL_SEEDS', () => {
  it('has exactly 16 skills', () => {
    expect(SKILL_SEEDS).toHaveLength(16);
  });

  it('all slugs are unique', () => {
    const slugs = SKILL_SEEDS.map((s) => s.slug);
    const uniqueSlugs = new Set(slugs);
    expect(uniqueSlugs.size).toBe(slugs.length);
  });

  it('all sort_order values are unique', () => {
    const orders = SKILL_SEEDS.map((s) => s.sort_order);
    const uniqueOrders = new Set(orders);
    expect(uniqueOrders.size).toBe(orders.length);
  });

  it('sort_order values are 0 through 15', () => {
    const orders = SKILL_SEEDS.map((s) => s.sort_order).sort((a, b) => a - b);
    expect(orders).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it('has 10 skills in the skills pack', () => {
    const skillsPack = SKILL_SEEDS.filter((s) => s.pack === 'skills');
    expect(skillsPack).toHaveLength(10);
  });

  it('has 6 skills in the creative pack', () => {
    const creativePack = SKILL_SEEDS.filter((s) => s.pack === 'creative');
    expect(creativePack).toHaveLength(6);
  });

  it('all quality_score values are between 0 and 100 inclusive', () => {
    for (const skill of SKILL_SEEDS) {
      expect(
        skill.quality_score,
        `${skill.slug} quality_score should be 0-100`
      ).toBeGreaterThanOrEqual(0);
      expect(
        skill.quality_score,
        `${skill.slug} quality_score should be 0-100`
      ).toBeLessThanOrEqual(100);
    }
  });
});

// ===========================================================================
// Required fields present
// ===========================================================================

describe('Agent Skill Seeds - required fields', () => {
  it('every skill has a non-empty slug', () => {
    for (const skill of SKILL_SEEDS) {
      expect(skill.slug, `Skill at sort_order ${skill.sort_order} missing slug`).toBeTruthy();
      expect(typeof skill.slug).toBe('string');
    }
  });

  it('every skill has a non-empty name', () => {
    for (const skill of SKILL_SEEDS) {
      expect(skill.name, `${skill.slug} missing name`).toBeTruthy();
    }
  });

  it('every skill has a non-empty description', () => {
    for (const skill of SKILL_SEEDS) {
      expect(skill.description, `${skill.slug} missing description`).toBeTruthy();
    }
  });

  it('every skill has a valid category', () => {
    const validCategories = ['content', 'creative', 'strategy', 'seo', 'meta'];
    for (const skill of SKILL_SEEDS) {
      expect(
        validCategories,
        `${skill.slug} has invalid category: ${skill.category}`
      ).toContain(skill.category);
    }
  });

  it('every skill has a valid pack', () => {
    const validPacks = ['skills', 'creative', 'custom'];
    for (const skill of SKILL_SEEDS) {
      expect(validPacks, `${skill.slug} has invalid pack: ${skill.pack}`).toContain(skill.pack);
    }
  });

  it('every skill has a valid quality_tier', () => {
    const validTiers = ['genuinely_smart', 'solid', 'has_potential', 'placeholder', 'tool_dependent'];
    for (const skill of SKILL_SEEDS) {
      expect(
        validTiers,
        `${skill.slug} has invalid quality_tier: ${skill.quality_tier}`
      ).toContain(skill.quality_tier);
    }
  });

  it('every skill has a non-empty quality_notes', () => {
    for (const skill of SKILL_SEEDS) {
      expect(skill.quality_notes, `${skill.slug} missing quality_notes`).toBeTruthy();
    }
  });

  it('every skill has at least one strength', () => {
    for (const skill of SKILL_SEEDS) {
      expect(
        skill.strengths.length,
        `${skill.slug} should have at least one strength`
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it('every skill has at least one weakness', () => {
    for (const skill of SKILL_SEEDS) {
      expect(
        skill.weaknesses.length,
        `${skill.slug} should have at least one weakness`
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it('every skill has a non-empty icon', () => {
    for (const skill of SKILL_SEEDS) {
      expect(skill.icon, `${skill.slug} missing icon`).toBeTruthy();
    }
  });

  it('every skill has a non-empty color', () => {
    for (const skill of SKILL_SEEDS) {
      expect(skill.color, `${skill.slug} missing color`).toBeTruthy();
      // Colors should be hex format
      expect(skill.color, `${skill.slug} color should be hex`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('every skill has a non-empty output_format', () => {
    for (const skill of SKILL_SEEDS) {
      expect(skill.output_format, `${skill.slug} missing output_format`).toBeTruthy();
    }
  });

  it('every skill has a positive estimated_tokens', () => {
    for (const skill of SKILL_SEEDS) {
      expect(
        skill.estimated_tokens,
        `${skill.slug} should have positive estimated_tokens`
      ).toBeGreaterThan(0);
    }
  });
});

// ===========================================================================
// Dependency graph validation
// ===========================================================================

describe('Agent Skill Seeds - dependency graph', () => {
  const allSlugs = new Set(SKILL_SEEDS.map((s) => s.slug));

  it('depends_on references only valid slugs', () => {
    for (const skill of SKILL_SEEDS) {
      for (const dep of skill.depends_on) {
        expect(
          allSlugs.has(dep),
          `${skill.slug} depends_on "${dep}" which is not a valid slug`
        ).toBe(true);
      }
    }
  });

  it('feeds_into references only valid slugs', () => {
    for (const skill of SKILL_SEEDS) {
      for (const target of skill.feeds_into) {
        expect(
          allSlugs.has(target),
          `${skill.slug} feeds_into "${target}" which is not a valid slug`
        ).toBe(true);
      }
    }
  });

  it('no skill depends on itself', () => {
    for (const skill of SKILL_SEEDS) {
      expect(
        skill.depends_on.includes(skill.slug),
        `${skill.slug} should not depend on itself`
      ).toBe(false);
    }
  });

  it('no skill feeds into itself', () => {
    for (const skill of SKILL_SEEDS) {
      expect(
        skill.feeds_into.includes(skill.slug),
        `${skill.slug} should not feed into itself`
      ).toBe(false);
    }
  });

  it('orchestrator has no dependencies (it is the root)', () => {
    const orchestrator = SKILL_SEEDS.find((s) => s.slug === 'orchestrator');
    expect(orchestrator).toBeDefined();
    expect(orchestrator!.depends_on).toEqual([]);
  });

  it('orchestrator feeds into multiple skills', () => {
    const orchestrator = SKILL_SEEDS.find((s) => s.slug === 'orchestrator');
    expect(orchestrator).toBeDefined();
    expect(orchestrator!.feeds_into.length).toBeGreaterThanOrEqual(5);
  });
});

// ===========================================================================
// IMPROVEMENT_LOG
// ===========================================================================

describe('Agent Skill Seeds - IMPROVEMENT_LOG', () => {
  it('is an array with entries', () => {
    expect(Array.isArray(IMPROVEMENT_LOG)).toBe(true);
    expect(IMPROVEMENT_LOG.length).toBeGreaterThan(0);
  });

  it('all entries reference valid skill slugs', () => {
    const allSlugs = new Set(SKILL_SEEDS.map((s) => s.slug));
    for (const entry of IMPROVEMENT_LOG) {
      expect(
        allSlugs.has(entry.slug),
        `Improvement log entry references unknown slug: ${entry.slug}`
      ).toBe(true);
    }
  });

  it('quality_score_after is greater than quality_score_before for all entries', () => {
    for (const entry of IMPROVEMENT_LOG) {
      expect(
        entry.quality_score_after,
        `${entry.slug} score after should exceed score before`
      ).toBeGreaterThan(entry.quality_score_before);
    }
  });
});
