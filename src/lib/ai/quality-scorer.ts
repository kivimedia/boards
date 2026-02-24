/**
 * Quality Scorer - Calculates a 0-10 quality score and Hot/Warm/Cold tier
 * for podcast guest candidates.
 *
 * Ported from the local podcast outreach agent's quality scoring system.
 * Scoring criteria:
 *   1. Revenue Magnitude (0-2): Evidence of paid work / revenue
 *   2. Proof Strength (0-2): Verifiable evidence (URLs, portfolios, etc.)
 *   3. Reachability (0-2): Email verified, social presence
 *   4. Vibe Coding Fit (0-2): Tools match, AI coding focus
 *   5. Content Richness (0-2): Active content creator, easy to research
 *
 * Tier thresholds:
 *   - Hot: 7-10 (strong match, prioritize outreach)
 *   - Warm: 4-6 (decent match, include in batch)
 *   - Cold: 0-3 (weak match, skip or deprioritize)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { PGACandidate } from '../types';
import type { ResearchDossier, PersonalizationElement } from './research-dossier';

// ============================================================================
// TYPES
// ============================================================================

export type QualityTier = 'hot' | 'warm' | 'cold';

export interface QualityScoreBreakdown {
  total: number; // 0-10
  tier: QualityTier;
  revenue_magnitude: number; // 0-2
  proof_strength: number; // 0-2
  reachability: number; // 0-2
  vibe_coding_fit: number; // 0-2
  content_richness: number; // 0-2
  reasons: string[];
}

// ============================================================================
// SCORING
// ============================================================================

/**
 * Calculate quality score for a candidate.
 * Can work with just candidate data, or with a dossier for deeper analysis.
 */
export function calculateQualityScore(
  candidate: PGACandidate,
  dossier?: ResearchDossier | null
): QualityScoreBreakdown {
  const reasons: string[] = [];

  // 1. Revenue Magnitude (0-2)
  const revenueMagnitude = scoreRevenue(candidate, dossier, reasons);

  // 2. Proof Strength (0-2)
  const proofStrength = scoreProof(candidate, dossier, reasons);

  // 3. Reachability (0-2)
  const reachability = scoreReachability(candidate, reasons);

  // 4. Vibe Coding Fit (0-2)
  const vibeCodingFit = scoreVibeCodingFit(candidate, reasons);

  // 5. Content Richness (0-2)
  const contentRichness = scoreContentRichness(candidate, dossier, reasons);

  const total = revenueMagnitude + proofStrength + reachability + vibeCodingFit + contentRichness;

  return {
    total,
    tier: total >= 7 ? 'hot' : total >= 4 ? 'warm' : 'cold',
    revenue_magnitude: revenueMagnitude,
    proof_strength: proofStrength,
    reachability,
    vibe_coding_fit: vibeCodingFit,
    content_richness: contentRichness,
    reasons,
  };
}

// ============================================================================
// INDIVIDUAL SCORING FUNCTIONS
// ============================================================================

function scoreRevenue(
  candidate: PGACandidate,
  dossier: ResearchDossier | null | undefined,
  reasons: string[]
): number {
  let score = 0;
  const evidence = candidate.evidence_of_paid_work || [];

  // Has evidence of paid work at all?
  if (evidence.length >= 3) {
    score = 2;
    reasons.push(`Strong revenue evidence: ${evidence.length} paid projects`);
  } else if (evidence.length >= 1) {
    score = 1;
    reasons.push(`Some revenue evidence: ${evidence.length} paid project(s)`);
  } else {
    reasons.push('No evidence of paid work found');
  }

  // Bonus: Check dossier for revenue mentions
  if (dossier && score < 2) {
    const revenueKeywords = ['revenue', 'mrr', 'arr', 'client', 'customer', 'paid', 'invoice', 'freelance'];
    const hasRevenueRef = dossier.personalization_elements.some((e) =>
      revenueKeywords.some((kw) => e.fact.toLowerCase().includes(kw) || e.screenshot_or_quote.toLowerCase().includes(kw))
    );
    if (hasRevenueRef) {
      score = Math.min(score + 1, 2);
      reasons.push('Dossier contains revenue-related references');
    }
  }

  return score;
}

function scoreProof(
  candidate: PGACandidate,
  dossier: ResearchDossier | null | undefined,
  reasons: string[]
): number {
  let score = 0;
  const evidence = candidate.evidence_of_paid_work || [];

  // Count evidence items with URLs
  const withUrls = evidence.filter((e) => e.url).length;

  if (withUrls >= 2) {
    score = 2;
    reasons.push(`Strong proof: ${withUrls} evidence items with URLs`);
  } else if (withUrls >= 1 || evidence.length >= 1) {
    score = 1;
    reasons.push('Some proof available');
  } else {
    reasons.push('No verifiable proof found');
  }

  // Dossier validation bonus
  if (dossier && score < 2) {
    const verifiedCount = dossier.personalization_elements.filter(
      (e) => e.verification_status === 'verified'
    ).length;
    if (verifiedCount >= 3) {
      score = Math.min(score + 1, 2);
      reasons.push(`${verifiedCount} verified dossier elements`);
    }
  }

  return score;
}

function scoreReachability(
  candidate: PGACandidate,
  reasons: string[]
): number {
  let score = 0;

  // Email verification
  if (candidate.email && candidate.email_verified) {
    score = 2;
    reasons.push('Verified email available');
  } else if (candidate.email) {
    score = 1;
    reasons.push('Email found but not verified');
  } else {
    // Check if we have other contact methods
    const presence = candidate.platform_presence || {};
    const hasLinkedIn = !!presence.linkedin;
    const hasTwitter = !!presence.twitter;

    if (hasLinkedIn || hasTwitter) {
      score = 1;
      reasons.push(`No email, but reachable via ${hasLinkedIn ? 'LinkedIn' : 'Twitter'}`);
    } else {
      reasons.push('No verified contact method');
    }
  }

  return score;
}

function scoreVibeCodingFit(
  candidate: PGACandidate,
  reasons: string[]
): number {
  let score = 0;
  const tools = (candidate.tools_used || []).map((t) => t.toLowerCase());

  // Core vibe coding tools
  const coreTools = ['cursor', 'lovable', 'bolt', 'replit', 'v0', 'windsurf', 'claude', 'copilot'];
  const matchedCore = coreTools.filter((t) => tools.some((ut) => ut.includes(t)));

  if (matchedCore.length >= 2) {
    score = 2;
    reasons.push(`Strong vibe coding fit: uses ${matchedCore.join(', ')}`);
  } else if (matchedCore.length >= 1) {
    score = 1;
    reasons.push(`Partial fit: uses ${matchedCore[0]}`);
  } else if (tools.length > 0) {
    // Any AI-related tools
    const aiTools = ['ai', 'gpt', 'chatgpt', 'openai', 'anthropic', 'gemini', 'midjourney', 'stable diffusion'];
    const hasAi = aiTools.some((t) => tools.some((ut) => ut.includes(t)));
    if (hasAi) {
      score = 1;
      reasons.push('Uses AI tools but not core vibe coding tools');
    } else {
      reasons.push('Tools do not match vibe coding focus');
    }
  } else {
    reasons.push('No tool information available');
  }

  return score;
}

function scoreContentRichness(
  candidate: PGACandidate,
  dossier: ResearchDossier | null | undefined,
  reasons: string[]
): number {
  let score = 0;
  const presence = candidate.platform_presence || {};
  const reach = candidate.estimated_reach || {};

  // Count active platforms
  const activePlatforms = Object.entries(presence).filter(
    ([, url]) => url && url.length > 0
  ).length;

  if (activePlatforms >= 4) {
    score = 2;
    reasons.push(`Very active: ${activePlatforms} platforms`);
  } else if (activePlatforms >= 2) {
    score = 1;
    reasons.push(`Moderately active: ${activePlatforms} platforms`);
  } else {
    reasons.push('Limited online presence');
  }

  // Dossier elements bonus
  if (dossier && score < 2) {
    const elementCount = dossier.personalization_elements.length;
    if (elementCount >= 5) {
      score = Math.min(score + 1, 2);
      reasons.push(`Rich research: ${elementCount} personalization elements`);
    }
  }

  // Audience size consideration (prefer < 50K, as per local agent spec)
  const totalReach = Object.values(reach).reduce((sum, v) => sum + (v || 0), 0);
  if (totalReach > 50000) {
    // Slightly penalize very large accounts (they're harder to reach)
    if (score === 2) {
      score = 1;
      reasons.push(`Large audience (${totalReach.toLocaleString()}) - may be harder to reach`);
    }
  }

  return score;
}

// ============================================================================
// BATCH SCORING
// ============================================================================

/**
 * Score and tier a batch of candidates.
 * Optionally saves results to the database.
 */
export async function scoreCandidates(
  supabase: SupabaseClient,
  candidates: PGACandidate[],
  options?: { saveToDB?: boolean }
): Promise<Array<{ candidate: PGACandidate; score: QualityScoreBreakdown }>> {
  const results: Array<{ candidate: PGACandidate; score: QualityScoreBreakdown }> = [];

  for (const candidate of candidates) {
    // Try to load existing dossier
    const { data: dossier } = await supabase
      .from('pga_research_dossiers')
      .select('*')
      .eq('candidate_id', candidate.id)
      .single();

    const dossierData: ResearchDossier | null = dossier
      ? {
          candidate_id: dossier.candidate_id,
          personalization_elements: dossier.personalization_elements || [],
          tone_profile: dossier.tone_profile || {},
          story_angle: dossier.story_angle || '',
          potential_hooks: dossier.potential_hooks || [],
          red_flags: dossier.red_flags || [],
          sources_checked: dossier.sources_checked || 0,
          sources_found: dossier.sources_found || 0,
          research_duration_ms: dossier.research_duration_ms || 0,
          tokens_used: dossier.tokens_used || 0,
          cost_usd: Number(dossier.cost_usd) || 0,
        }
      : null;

    const score = calculateQualityScore(candidate, dossierData);
    results.push({ candidate, score });

    if (options?.saveToDB) {
      await supabase
        .from('pga_candidates')
        .update({
          quality_score: score.total,
          tier: score.tier,
          updated_at: new Date().toISOString(),
        })
        .eq('id', candidate.id);
    }
  }

  return results;
}
