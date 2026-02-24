import { describe, it, expect } from 'vitest';
import { calculateQualityScore } from '@/lib/ai/quality-scorer';
import type { PGACandidate } from '@/lib/types';
import type { ResearchDossier } from '@/lib/ai/research-dossier';

// ============================================================================
// Helper
// ============================================================================

function makeCandidate(overrides: Partial<PGACandidate> = {}): PGACandidate {
  return {
    id: 'test-id',
    name: 'Test User',
    one_liner: 'Freelance developer building SaaS with AI tools',
    email: 'test@example.com',
    email_verified: true,
    location: 'San Francisco',
    platform_presence: {
      linkedin: 'https://linkedin.com/in/testuser',
      twitter: 'https://x.com/testuser',
      website: 'https://testuser.com',
      github: 'https://github.com/testuser',
    },
    evidence_of_paid_work: [
      { project: 'TaskFlow', description: 'SaaS project management tool', url: 'https://taskflow.io' },
      { project: 'ClientBot', description: 'AI chatbot for agencies', url: 'https://clientbot.ai' },
      { project: 'FreelanceOS', description: 'Freelance dashboard' },
    ],
    estimated_reach: { twitter_followers: 5000, linkedin_connections: 2000 },
    tools_used: ['Cursor', 'Lovable', 'Claude'],
    contact_method: 'email',
    scout_confidence: 'high',
    source: { channel: 'linkedin_scout' },
    status: 'scouted',
    rejection_reason: null,
    reviewed_by: null,
    reviewed_at: null,
    notes: null,
    quality_score: 0,
    tier: 'cold',
    next_followup_date: null,
    last_contacted_at: null,
    touch_count: 0,
    unsubscribed: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeDossier(overrides: Partial<ResearchDossier> = {}): ResearchDossier {
  return {
    candidate_id: 'test-id',
    personalization_elements: [
      {
        fact: 'Built TaskFlow SaaS with Cursor generating $5K MRR',
        source_url: 'https://linkedin.com/in/testuser/posts/1',
        source_type: 'LinkedIn post',
        screenshot_or_quote: 'Hit $5K MRR milestone',
        date_found: new Date().toISOString().split('T')[0],
        confidence: 'high',
        verification_status: 'verified',
      },
      {
        fact: 'Launched on Product Hunt with 500+ upvotes',
        source_url: 'https://producthunt.com/posts/taskflow',
        source_type: 'Product Hunt',
        screenshot_or_quote: '500+ upvotes',
        date_found: new Date().toISOString().split('T')[0],
        confidence: 'high',
        verification_status: 'verified',
      },
      {
        fact: 'Runs a YouTube channel about vibe coding',
        source_url: 'https://youtube.com/@testuser',
        source_type: 'Personal website',
        screenshot_or_quote: '10K subscribers',
        date_found: 'evergreen',
        confidence: 'medium',
        verification_status: 'verified',
      },
    ],
    tone_profile: {
      communication_style: 'casual',
      favorite_topics: ['vibe coding', 'AI tools'],
      pet_peeves: [],
      humor_level: 'playful',
      formality: 'casual',
      preferred_platforms: ['LinkedIn', 'Twitter'],
    },
    story_angle: 'From freelancer to SaaS founder using AI',
    potential_hooks: ['$5K MRR with Cursor', 'PH launch'],
    red_flags: [],
    sources_checked: 7,
    sources_found: 5,
    research_duration_ms: 30000,
    tokens_used: 5000,
    cost_usd: 0.04,
    ...overrides,
  };
}

// ============================================================================
// SCORING TESTS
// ============================================================================

describe('calculateQualityScore', () => {
  it('gives a high score to a strong candidate', () => {
    const candidate = makeCandidate();
    const dossier = makeDossier();
    const score = calculateQualityScore(candidate, dossier);

    expect(score.total).toBeGreaterThanOrEqual(7);
    expect(score.tier).toBe('hot');
    expect(score.reasons.length).toBeGreaterThan(0);
  });

  it('gives a low score to a weak candidate', () => {
    const candidate = makeCandidate({
      evidence_of_paid_work: [],
      email: null,
      email_verified: false,
      tools_used: [],
      platform_presence: {},
    });
    const score = calculateQualityScore(candidate);

    expect(score.total).toBeLessThanOrEqual(3);
    expect(score.tier).toBe('cold');
  });

  it('gives warm tier to a moderate candidate', () => {
    const candidate = makeCandidate({
      evidence_of_paid_work: [{ project: 'App', description: 'An app' }],
      email: 'test@test.com',
      email_verified: false,
      tools_used: ['Cursor'],
      platform_presence: { linkedin: 'https://linkedin.com/in/test' },
    });
    const score = calculateQualityScore(candidate);

    expect(score.total).toBeGreaterThanOrEqual(3);
    expect(score.total).toBeLessThanOrEqual(7);
    expect(score.tier).toBe('warm');
  });

  // Revenue Magnitude
  describe('revenue_magnitude', () => {
    it('scores 2 for 3+ paid projects', () => {
      const candidate = makeCandidate();
      const score = calculateQualityScore(candidate);
      expect(score.revenue_magnitude).toBe(2);
    });

    it('scores 1 for 1-2 paid projects', () => {
      const candidate = makeCandidate({
        evidence_of_paid_work: [{ project: 'App', description: 'Thing' }],
      });
      const score = calculateQualityScore(candidate);
      expect(score.revenue_magnitude).toBe(1);
    });

    it('scores 0 for no paid work', () => {
      const candidate = makeCandidate({ evidence_of_paid_work: [] });
      const score = calculateQualityScore(candidate);
      expect(score.revenue_magnitude).toBe(0);
    });

    it('boosts from dossier revenue references', () => {
      const candidate = makeCandidate({ evidence_of_paid_work: [] });
      const dossier = makeDossier({
        personalization_elements: [
          {
            fact: 'Generating $2K MRR from freelance clients',
            source_url: 'https://x.com/test/1',
            source_type: 'X/Twitter',
            screenshot_or_quote: '$2K MRR this month',
            date_found: new Date().toISOString(),
            confidence: 'high',
            verification_status: 'verified',
          },
        ],
      });
      const score = calculateQualityScore(candidate, dossier);
      expect(score.revenue_magnitude).toBeGreaterThanOrEqual(1);
    });
  });

  // Proof Strength
  describe('proof_strength', () => {
    it('scores 2 for 2+ evidence items with URLs', () => {
      const candidate = makeCandidate();
      const score = calculateQualityScore(candidate);
      expect(score.proof_strength).toBe(2);
    });

    it('scores 1 for evidence without URLs', () => {
      const candidate = makeCandidate({
        evidence_of_paid_work: [{ project: 'App', description: 'Thing' }],
      });
      const score = calculateQualityScore(candidate);
      expect(score.proof_strength).toBe(1);
    });

    it('boosts from verified dossier elements', () => {
      const candidate = makeCandidate({
        evidence_of_paid_work: [{ project: 'App', description: 'Thing' }],
      });
      const dossier = makeDossier();
      const score = calculateQualityScore(candidate, dossier);
      expect(score.proof_strength).toBe(2);
    });
  });

  // Reachability
  describe('reachability', () => {
    it('scores 2 for verified email', () => {
      const score = calculateQualityScore(makeCandidate());
      expect(score.reachability).toBe(2);
    });

    it('scores 1 for unverified email', () => {
      const score = calculateQualityScore(makeCandidate({ email_verified: false }));
      expect(score.reachability).toBe(1);
    });

    it('scores 1 for no email but has LinkedIn', () => {
      const score = calculateQualityScore(
        makeCandidate({
          email: null,
          email_verified: false,
          platform_presence: { linkedin: 'https://linkedin.com/in/test' },
        })
      );
      expect(score.reachability).toBe(1);
    });

    it('scores 0 for no contact method', () => {
      const score = calculateQualityScore(
        makeCandidate({
          email: null,
          email_verified: false,
          platform_presence: {},
        })
      );
      expect(score.reachability).toBe(0);
    });
  });

  // Vibe Coding Fit
  describe('vibe_coding_fit', () => {
    it('scores 2 for multiple core tools', () => {
      const score = calculateQualityScore(makeCandidate());
      expect(score.vibe_coding_fit).toBe(2);
    });

    it('scores 1 for one core tool', () => {
      const score = calculateQualityScore(makeCandidate({ tools_used: ['Cursor'] }));
      expect(score.vibe_coding_fit).toBe(1);
    });

    it('scores 1 for AI tools but not core', () => {
      const score = calculateQualityScore(makeCandidate({ tools_used: ['ChatGPT', 'Midjourney'] }));
      expect(score.vibe_coding_fit).toBe(1);
    });

    it('scores 0 for no tool info', () => {
      const score = calculateQualityScore(makeCandidate({ tools_used: [] }));
      expect(score.vibe_coding_fit).toBe(0);
    });
  });

  // Content Richness
  describe('content_richness', () => {
    it('scores 2 for 4+ active platforms', () => {
      const score = calculateQualityScore(makeCandidate());
      expect(score.content_richness).toBe(2);
    });

    it('scores 1 for 2-3 platforms', () => {
      const score = calculateQualityScore(
        makeCandidate({
          platform_presence: {
            linkedin: 'https://linkedin.com/in/test',
            website: 'https://test.com',
          },
        })
      );
      expect(score.content_richness).toBe(1);
    });

    it('penalizes very large audiences', () => {
      const candidate = makeCandidate({
        estimated_reach: { twitter_followers: 100000 },
        platform_presence: {
          linkedin: 'l',
          twitter: 't',
          website: 'w',
          github: 'g',
        },
      });
      const score = calculateQualityScore(candidate);
      // Should be penalized from 2 to 1
      expect(score.content_richness).toBe(1);
    });
  });

  // Tier assignment
  describe('tier assignment', () => {
    it('assigns hot for score >= 7', () => {
      expect(calculateQualityScore(makeCandidate(), makeDossier()).tier).toBe('hot');
    });

    it('assigns cold for score <= 3', () => {
      const weak = makeCandidate({
        evidence_of_paid_work: [],
        email: null,
        email_verified: false,
        tools_used: [],
        platform_presence: {},
      });
      expect(calculateQualityScore(weak).tier).toBe('cold');
    });
  });

  // Reasons tracking
  it('provides descriptive reasons', () => {
    const score = calculateQualityScore(makeCandidate());
    expect(score.reasons.length).toBeGreaterThan(0);
    expect(score.reasons.every((r) => typeof r === 'string' && r.length > 0)).toBe(true);
  });

  // Works without dossier
  it('works without a dossier', () => {
    const score = calculateQualityScore(makeCandidate());
    expect(typeof score.total).toBe('number');
    expect(['hot', 'warm', 'cold']).toContain(score.tier);
  });

  // Works with null dossier
  it('works with null dossier', () => {
    const score = calculateQualityScore(makeCandidate(), null);
    expect(typeof score.total).toBe('number');
  });
});
