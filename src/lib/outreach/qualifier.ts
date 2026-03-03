/**
 * Qualifier Agent - Lead qualification for LinkedIn outreach
 *
 * Handles:
 * - Job title matching against approved entertainment titles
 * - IT/Tech false positive detection (2+ red flags = disqualify)
 * - Competitor detection (5 types: coaches, agencies, planners, web providers, retailers)
 * - Growth stage classification
 * - Integration with lead scorer for final scoring
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { LILead, LIQualificationStatus, LICompetitorType, LIGrowthStage, LIScoreBreakdown } from '../types';
import { LI_APPROVED_TITLES, LI_TECH_RED_FLAGS } from '../types';
import { calculateLeadScore, detectGrowthStage } from './lead-scorer';
import { transitionStage } from './pipeline-fsm';

const ZERO_SCORE: LIScoreBreakdown = {
  growth_stage: 0, website_quality: 0, website_recency: 0,
  connection_count: 0, enrichment_confidence: 0, historical_conversion: 0, total: 0,
};

// ============================================================================
// TYPES
// ============================================================================

export interface QualificationResult {
  status: LIQualificationStatus;
  reason: string | null;
  is_competitor: boolean;
  competitor_type: LICompetitorType | null;
  growth_stage: LIGrowthStage | null;
  lead_score: number;
  score_breakdown: LIScoreBreakdown;
  red_flags: string[];
}

// ============================================================================
// MAIN QUALIFIER
// ============================================================================

export function qualifyLead(lead: LILead): QualificationResult {
  const red_flags: string[] = [];

  // Step 1: Check location (must be US)
  if (lead.country && !isUSBased(lead.country)) {
    return {
      status: 'disqualified',
      reason: 'DISQUALIFIED_NOT_US',
      is_competitor: false,
      competitor_type: null,
      growth_stage: null,
      lead_score: 0,
      score_breakdown: ZERO_SCORE,
      red_flags: [],
    };
  }

  // Step 2: Check connection degree (must be 2nd or 3rd)
  if (lead.connection_degree === 1) {
    return {
      status: 'disqualified',
      reason: 'SKIP_ALREADY_CONNECTED',
      is_competitor: false,
      competitor_type: null,
      growth_stage: null,
      lead_score: 0,
      score_breakdown: ZERO_SCORE,
      red_flags: [],
    };
  }

  // Step 3: Check minimum connections
  if (lead.connections_count !== null && lead.connections_count < 50) {
    return {
      status: 'disqualified',
      reason: 'DISQUALIFIED_LOW_CONNECTIONS',
      is_competitor: false,
      competitor_type: null,
      growth_stage: null,
      lead_score: 0,
      score_breakdown: ZERO_SCORE,
      red_flags: [],
    };
  }

  // Step 4: Job title matching
  const titleMatch = checkJobTitle(lead.job_position, red_flags);
  if (titleMatch === 'disqualified') {
    return {
      status: 'disqualified',
      reason: 'DISQUALIFIED_NOT_ENTERTAINMENT',
      is_competitor: false,
      competitor_type: null,
      growth_stage: null,
      lead_score: 0,
      score_breakdown: ZERO_SCORE,
      red_flags,
    };
  }

  // Step 5: IT/Tech false positive detection
  const techFlags = detectTechFalsePositive(lead);
  red_flags.push(...techFlags);

  if (techFlags.length >= 2) {
    return {
      status: 'disqualified',
      reason: 'DISQUALIFIED_NOT_ENTERTAINMENT',
      is_competitor: false,
      competitor_type: null,
      growth_stage: null,
      lead_score: 0,
      score_breakdown: ZERO_SCORE,
      red_flags,
    };
  }

  // Step 6: Competitor detection
  const competitorResult = detectCompetitor(lead);
  if (competitorResult) {
    return {
      status: 'disqualified',
      reason: `DISQUALIFIED_COMPETITOR_${competitorResult.toUpperCase()}`,
      is_competitor: true,
      competitor_type: competitorResult,
      growth_stage: null,
      lead_score: 0,
      score_breakdown: ZERO_SCORE,
      red_flags,
    };
  }

  // Step 7: Check website requirement
  if (!lead.website && !lead.company_url) {
    // Not an immediate disqualify - they might get a website through enrichment
    if (lead.enrichment_tier >= 3) {
      // Already went through full enrichment and still no website
      return {
        status: 'disqualified',
        reason: 'DISQUALIFIED_NO_WEBSITE',
        is_competitor: false,
        competitor_type: null,
        growth_stage: null,
        lead_score: 0,
        score_breakdown: ZERO_SCORE,
        red_flags,
      };
    }
  }

  // Step 8: Growth stage detection
  const growth_stage = detectGrowthStage(lead);

  // Step 9: Lead scoring
  const leadWithStage = { ...lead, growth_stage };
  const scoreResult = calculateLeadScore(leadWithStage);

  // Step 10: Determine final status
  let status: LIQualificationStatus = 'qualified';
  let reason: string | null = null;

  if (titleMatch === 'needs_review' || techFlags.length === 1) {
    status = 'needs_review';
    reason = techFlags.length === 1
      ? `1 tech red flag: ${techFlags[0]}`
      : 'Title needs manual review';
  }

  return {
    status,
    reason,
    is_competitor: false,
    competitor_type: null,
    growth_stage,
    lead_score: scoreResult.total,
    score_breakdown: scoreResult,
    red_flags,
  };
}

// ============================================================================
// BATCH QUALIFICATION
// ============================================================================

export async function qualifyBatch(
  supabase: SupabaseClient,
  userId: string,
  leadIds: string[]
): Promise<{ qualified: number; disqualified: number; needs_review: number; errors: string[] }> {
  let qualified = 0;
  let disqualified = 0;
  let needs_review = 0;
  const errors: string[] = [];

  // Fetch leads
  const { data: leads, error } = await supabase
    .from('li_leads')
    .select('*')
    .eq('user_id', userId)
    .in('id', leadIds)
    .is('deleted_at', null);

  if (error || !leads) {
    return { qualified: 0, disqualified: 0, needs_review: 0, errors: [error?.message || 'Failed to fetch leads'] };
  }

  for (const lead of leads) {
    try {
      const result = qualifyLead(lead as LILead);

      // Update lead with qualification results
      const { error: updateError } = await supabase
        .from('li_leads')
        .update({
          qualification_status: result.status,
          disqualification_reason: result.reason,
          growth_stage: result.growth_stage,
          lead_score: result.lead_score,
          score_breakdown: result.score_breakdown,
          is_competitor: result.is_competitor,
          competitor_type: result.competitor_type,
        })
        .eq('id', lead.id);

      if (updateError) {
        errors.push(`Lead ${lead.id}: ${updateError.message}`);
        continue;
      }

      // Transition pipeline stage
      if (result.status === 'qualified') {
        await transitionStage(supabase, lead.id, lead.pipeline_stage, 'TO_SEND_CONNECTION', 'qualifier');
        qualified++;
      } else if (result.status === 'disqualified') {
        await transitionStage(supabase, lead.id, lead.pipeline_stage, 'NOT_INTERESTED', 'qualifier', result.reason || undefined);
        disqualified++;
      } else {
        needs_review++;
      }
    } catch (err) {
      errors.push(`Lead ${lead.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return { qualified, disqualified, needs_review, errors };
}

// ============================================================================
// JOB TITLE MATCHING
// ============================================================================

function checkJobTitle(
  title: string | null,
  red_flags: string[]
): 'qualified' | 'needs_review' | 'disqualified' {
  if (!title) return 'needs_review';

  const titleLower = title.toLowerCase();

  // Check for approved entertainment titles
  const isEntertainment = LI_APPROVED_TITLES.some(approved =>
    titleLower.includes(approved)
  );

  if (isEntertainment) {
    // Double-check it's not a metaphorical use
    const metaphorical = [
      'code magician', 'spreadsheet wizard', 'data sorcerer',
      'tech illusionist', 'marketing magician', 'growth magician',
      'sales magician', 'design magician', 'ux magician',
    ];
    if (metaphorical.some(m => titleLower.includes(m))) {
      red_flags.push(`Metaphorical title: "${title}"`);
      return 'needs_review';
    }
    return 'qualified';
  }

  // Check for obviously non-entertainment titles
  const nonEntertainment = [
    'software', 'developer', 'engineer', 'data', 'analyst',
    'consultant', 'accountant', 'lawyer', 'attorney', 'doctor',
    'nurse', 'teacher', 'professor', 'researcher', 'scientist',
  ];
  if (nonEntertainment.some(t => titleLower.includes(t))) {
    return 'disqualified';
  }

  return 'needs_review';
}

// ============================================================================
// IT/TECH FALSE POSITIVE DETECTION
// ============================================================================

function detectTechFalsePositive(lead: LILead): string[] {
  const flags: string[] = [];
  const enrichment = lead.enrichment_data || {};

  // Check industry
  const techIndustries = ['technology', 'software', 'it', 'data', 'finance', 'consulting'];
  if (enrichment.industry && techIndustries.some(i =>
    String(enrichment.industry).toLowerCase().includes(i)
  )) {
    flags.push(`Industry: ${enrichment.industry}`);
  }

  // Check for tech company experience
  const techCompanies = ['microsoft', 'google', 'amazon', 'meta', 'apple', 'netflix', 'saas'];
  if (lead.company_name && techCompanies.some(c =>
    lead.company_name!.toLowerCase().includes(c)
  )) {
    flags.push(`Tech company: ${lead.company_name}`);
  }

  // Check for tech skills in enrichment data
  const techSkills = ['programming', 'javascript', 'python', 'react', 'aws', 'cloud', 'devops', 'sql', 'machine learning'];
  if (enrichment.skills && Array.isArray(enrichment.skills)) {
    const techSkillsFound = enrichment.skills.filter((s: string) =>
      techSkills.some(ts => s.toLowerCase().includes(ts))
    );
    if (techSkillsFound.length > 0) {
      flags.push(`Tech skills: ${techSkillsFound.join(', ')}`);
    }
  }

  // Check for tech education
  const techEdu = ['computer science', 'engineering', 'information technology'];
  if (enrichment.education && Array.isArray(enrichment.education)) {
    const techEduFound = enrichment.education.filter((e: string) =>
      techEdu.some(te => e.toLowerCase().includes(te))
    );
    if (techEduFound.length > 0) {
      flags.push(`Tech education: ${techEduFound.join(', ')}`);
    }
  }

  // Check title for metaphorical terms
  if (lead.job_position) {
    const metaphorical = ['code magician', 'spreadsheet wizard', 'data sorcerer', 'tech illusionist'];
    if (metaphorical.some(m => lead.job_position!.toLowerCase().includes(m))) {
      flags.push(`Metaphorical title: ${lead.job_position}`);
    }
  }

  // Check for no entertainment-related content
  const entertainmentWords = ['show', 'perform', 'event', 'audience', 'booking', 'magic', 'entertain', 'birthday', 'party'];
  const hasEntertainmentSignals = [
    lead.job_position,
    lead.company_name,
    enrichment.bio,
    enrichment.headline,
  ].some(field =>
    field && entertainmentWords.some(w => String(field).toLowerCase().includes(w))
  );

  if (!hasEntertainmentSignals && lead.job_position) {
    flags.push('No entertainment-related content detected');
  }

  return flags;
}

// ============================================================================
// COMPETITOR DETECTION
// ============================================================================

function detectCompetitor(lead: LILead): LICompetitorType | null {
  const title = (lead.job_position || '').toLowerCase();
  const company = (lead.company_name || '').toLowerCase();
  const enrichment = lead.enrichment_data || {};
  const headline = String(enrichment.headline || '').toLowerCase();
  const bio = String(enrichment.bio || '').toLowerCase();
  const combined = `${title} ${company} ${headline} ${bio}`;

  // Coaches / Consultants
  const coachSignals = [
    'coaching', 'consulting', 'helping entertainers', 'marketing for magicians',
    'business coach', 'speaking coach', 'performance coach',
  ];
  if (coachSignals.some(s => combined.includes(s))) {
    return 'coach_consultant';
  }

  // Entertainment Agencies
  const agencySignals = ['talent agent', 'booking manager', 'entertainment director', 'talent agency', 'booking agency'];
  if (agencySignals.some(s => combined.includes(s))) {
    return 'entertainment_agency';
  }

  // Event Planners
  const plannerSignals = ['event planner', 'party planner', 'event coordinator', 'wedding planner'];
  if (plannerSignals.some(s => combined.includes(s))) {
    return 'event_planner';
  }

  // Web/Marketing Providers
  const webSignals = ['web design', 'seo', 'social media manager', 'websites for entertainers', 'marketing agency'];
  if (webSignals.some(s => combined.includes(s))) {
    return 'web_marketing_provider';
  }

  // Magic Retailers
  const retailSignals = ['magic shop', 'magic store', 'magic tricks', 'magic props', 'e-commerce'];
  if (retailSignals.some(s => combined.includes(s))) {
    return 'magic_retailer';
  }

  return null;
}

// ============================================================================
// LOCATION CHECK
// ============================================================================

function isUSBased(country: string): boolean {
  const usAliases = [
    'us', 'usa', 'united states', 'united states of america',
    'u.s.', 'u.s.a.', 'america',
  ];
  return usAliases.includes(country.toLowerCase().trim());
}
