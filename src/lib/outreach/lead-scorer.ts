/**
 * Lead Scorer - 0-100 weighted scoring for LinkedIn outreach leads
 *
 * Scoring factors (from PRD):
 *   Growth Stage:          30% (early=10, growing=30, established=20)
 *   Website Quality:       25% (no custom domain=5, custom domain=15, professional=25)
 *   Website Recency:       15% (current year=15, last year=10, 2+ years=5)
 *   Connection Count:      10% (50-200=5, 200-500=8, 500+=10)
 *   Enrichment Confidence: 10% (HIGH=10, MEDIUM=6, LOW=2)
 *   Historical Conversion: 10% (adjusted by feedback loop)
 */

import type { LILead, LIGrowthStage, LIWebsiteConfidence, LIScoreBreakdown } from '../types';

// ============================================================================
// SCORING WEIGHTS (out of 100)
// ============================================================================

const WEIGHTS = {
  growth_stage: 30,
  website_quality: 25,
  website_recency: 15,
  connection_count: 10,
  enrichment_confidence: 10,
  historical_conversion: 10,
};

// ============================================================================
// INDIVIDUAL FACTOR SCORES
// ============================================================================

function scoreGrowthStage(stage: LIGrowthStage | null): number {
  switch (stage) {
    case 'growing': return 30;    // High priority
    case 'established': return 20; // Medium priority (harder sell but higher value)
    case 'early': return 10;       // Lower priority (may not be ready to invest)
    default: return 5;             // Unknown stage
  }
}

function scoreWebsiteQuality(lead: LILead): number {
  if (!lead.website) return 0;
  if (!lead.website_validated) return 3;

  // Check for professional indicators from enrichment data
  const enrichment = lead.enrichment_data || {};
  const hasCustomDomain = !isFreeDomain(lead.website);
  const isProfessional = enrichment.website_professional === true;

  if (isProfessional) return 25;
  if (hasCustomDomain) return 15;
  return 5; // Free site builder or no custom domain
}

function scoreWebsiteRecency(lead: LILead): number {
  if (!lead.website_copyright_year) return 5;

  const currentYear = new Date().getFullYear();
  const diff = currentYear - lead.website_copyright_year;

  if (diff === 0) return 15;     // Current year
  if (diff === 1) return 10;     // Last year
  return 5;                       // 2+ years old
}

function scoreConnectionCount(count: number | null): number {
  if (!count || count < 50) return 0; // Below minimum threshold
  if (count >= 500) return 10;
  if (count >= 200) return 8;
  return 5; // 50-200
}

function scoreEnrichmentConfidence(confidence: LIWebsiteConfidence | null, tier: number): number {
  // Use both website confidence and enrichment tier
  switch (confidence) {
    case 'HIGH': return 10;
    case 'MEDIUM': return 6;
    case 'LOW': return 2;
    default:
      // Fallback based on enrichment tier depth
      if (tier >= 3) return 4; // Made it through SerpAPI
      if (tier >= 2) return 6; // Snov.io found data
      if (tier >= 1) return 8; // Hunter found data easily
      return 1;
  }
}

function scoreHistoricalConversion(): number {
  // Base value - will be adjusted by feedback loop in Phase 3
  return 5;
}

// ============================================================================
// MAIN SCORER
// ============================================================================

export function calculateLeadScore(lead: LILead): LIScoreBreakdown {
  const growth_stage = scoreGrowthStage(lead.growth_stage);
  const website_quality = scoreWebsiteQuality(lead);
  const website_recency = scoreWebsiteRecency(lead);
  const connection_count = scoreConnectionCount(lead.connections_count);
  const enrichment_confidence = scoreEnrichmentConfidence(lead.website_confidence, lead.enrichment_tier);
  const historical_conversion = scoreHistoricalConversion();

  const total = Math.min(100, Math.max(0,
    growth_stage + website_quality + website_recency +
    connection_count + enrichment_confidence + historical_conversion
  ));

  return {
    growth_stage,
    website_quality,
    website_recency,
    connection_count,
    enrichment_confidence,
    historical_conversion,
    total,
  };
}

// ============================================================================
// GROWTH STAGE DETECTION
// ============================================================================

export function detectGrowthStage(lead: LILead): LIGrowthStage {
  const signals = {
    freeBuilder: false,
    customDomain: false,
    professionalDesign: false,
    hasBookingForm: false,
    hasTestimonials: false,
    hasVideoDemo: false,
    hasPressSection: false,
    hasCorporateClients: false,
    hasMultiplePackages: false,
  };

  // Check website for signals
  if (lead.website) {
    signals.freeBuilder = isFreeDomain(lead.website);
    signals.customDomain = !signals.freeBuilder;
  }

  // Pull signals from enrichment data
  const enrichment = lead.enrichment_data || {};
  if (enrichment.website_professional) signals.professionalDesign = true;
  if (enrichment.has_booking) signals.hasBookingForm = true;
  if (enrichment.has_testimonials) signals.hasTestimonials = true;
  if (enrichment.has_video) signals.hasVideoDemo = true;
  if (enrichment.has_press) signals.hasPressSection = true;
  if (enrichment.has_corporate_clients) signals.hasCorporateClients = true;
  if (enrichment.has_packages) signals.hasMultiplePackages = true;

  // Count professional signals
  const proSignals = [
    signals.professionalDesign,
    signals.hasVideoDemo,
    signals.hasPressSection,
    signals.hasCorporateClients,
    signals.hasMultiplePackages,
  ].filter(Boolean).length;

  // Established: professional design + multiple pro signals
  if (signals.customDomain && proSignals >= 3) return 'established';

  // Growing: custom domain + some presence
  const growingSignals = [
    signals.customDomain,
    signals.hasBookingForm,
    signals.hasTestimonials,
  ].filter(Boolean).length;
  if (growingSignals >= 2) return 'growing';

  // Early: everything else
  return 'early';
}

// ============================================================================
// HELPERS
// ============================================================================

const FREE_DOMAINS = [
  'wix.com', 'weebly.com', 'squarespace.com',
  'wordpress.com', 'blogspot.com', 'tumblr.com',
  'sites.google.com', 'godaddysites.com',
  'carrd.co', 'webflow.io', 'netlify.app',
  'vercel.app', 'herokuapp.com',
];

function isFreeDomain(url: string): boolean {
  try {
    const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.toLowerCase();
    return FREE_DOMAINS.some(d => hostname.endsWith(d));
  } catch {
    return false;
  }
}
