import type { LILead, LITemplate, LIRotationVariant, LIPipelineStage } from '@/lib/types';

// ============================================================================
// VARIABLE INTERPOLATION
// ============================================================================

interface TemplateVariables {
  'First Name': string;
  'Last Name': string;
  'Full Name': string;
  'Position': string;
  'Company': string;
  'City': string;
  'State': string;
  'Website': string;
  'Loom Link': string;
  [key: string]: string;
}

export function extractVariables(lead: LILead, extras?: Record<string, string>): TemplateVariables {
  return {
    'First Name': lead.first_name || lead.full_name.split(' ')[0] || '',
    'Last Name': lead.last_name || lead.full_name.split(' ').slice(1).join(' ') || '',
    'Full Name': lead.full_name,
    'Position': lead.job_position || 'professional',
    'Company': lead.company_name || '',
    'City': lead.city || '',
    'State': lead.state || '',
    'Website': lead.website?.replace(/^https?:\/\//, '').replace(/\/$/, '') || '',
    'Loom Link': '[Insert Loom Link]',
    ...extras,
  };
}

export function interpolate(templateText: string, variables: TemplateVariables): string {
  return templateText.replace(/\{\{([^}]+)\}\}/g, (match, key: string) => {
    const trimmed = key.trim();
    return variables[trimmed] ?? match;
  });
}

// ============================================================================
// PREREQUISITE CHECKING
// ============================================================================

interface PrerequisiteCheck {
  met: boolean;
  reason?: string;
}

export function checkPrerequisites(
  template: LITemplate,
  lead: LILead,
  context?: {
    days_since_message?: number;
    days_since_nudge?: number;
    days_since_loom?: number;
    days_since_cold?: number;
    days_since_session?: number;
  }
): PrerequisiteCheck {
  const prereq = template.prerequisite as Record<string, unknown>;
  if (!prereq || Object.keys(prereq).length === 0) {
    return { met: true };
  }

  // Check each prerequisite
  if (prereq.loom_consent === true && !lead.loom_consent) {
    return { met: false, reason: 'Lead has not given Loom consent' };
  }

  if (prereq.loom_response_positive === true && lead.loom_response_positive !== true) {
    return { met: false, reason: 'Lead has not responded positively to Loom' };
  }

  if (prereq.session_attended === false && lead.session_attended !== false) {
    return { met: false, reason: 'Session was not missed (attended or not yet scheduled)' };
  }

  if (prereq.previously_engaged === true && !lead.previously_engaged) {
    return { met: false, reason: 'Lead was not previously engaged' };
  }

  if (typeof prereq.re_engagement_count === 'number' && lead.re_engagement_count > (prereq.re_engagement_count as number)) {
    return { met: false, reason: `Re-engagement count exceeds limit (${lead.re_engagement_count} > ${prereq.re_engagement_count})` };
  }

  if (typeof prereq.followup_count_lt === 'number' && lead.followup_count_at_stage >= (prereq.followup_count_lt as number)) {
    return { met: false, reason: `Follow-up count at limit (${lead.followup_count_at_stage} >= ${prereq.followup_count_lt})` };
  }

  // Time-based prerequisites
  if (context) {
    if (typeof prereq.days_since_message === 'number' && context.days_since_message !== undefined) {
      if (context.days_since_message < (prereq.days_since_message as number)) {
        return { met: false, reason: `Too soon since last message (${context.days_since_message}d < ${prereq.days_since_message}d)` };
      }
    }

    if (typeof prereq.days_since_nudge === 'number' && context.days_since_nudge !== undefined) {
      if (context.days_since_nudge < (prereq.days_since_nudge as number)) {
        return { met: false, reason: `Too soon since last nudge (${context.days_since_nudge}d < ${prereq.days_since_nudge}d)` };
      }
    }

    if (typeof prereq.days_since_loom === 'number' && context.days_since_loom !== undefined) {
      if (context.days_since_loom < (prereq.days_since_loom as number)) {
        return { met: false, reason: `Too soon since Loom was sent (${context.days_since_loom}d < ${prereq.days_since_loom}d)` };
      }
    }

    if (typeof prereq.days_since_cold === 'number' && context.days_since_cold !== undefined) {
      if (context.days_since_cold < (prereq.days_since_cold as number)) {
        return { met: false, reason: `Too soon since marked cold (${context.days_since_cold}d < ${prereq.days_since_cold}d)` };
      }
    }

    if (typeof prereq.days_since_session === 'number' && context.days_since_session !== undefined) {
      if (context.days_since_session < (prereq.days_since_session as number)) {
        return { met: false, reason: `Too soon since session (${context.days_since_session}d < ${prereq.days_since_session}d)` };
      }
    }
  }

  return { met: true };
}

// ============================================================================
// TEMPLATE SELECTION
// ============================================================================

// Map pipeline stages to the template that should be used at that stage
const STAGE_TEMPLATE_MAP: Record<string, number> = {
  'TO_SEND_CONNECTION': 1,
  'CONNECTED': 2,
  'LOOM_PERMISSION': 3,
  'LOOM_SENT': 4,
  'REPLIED': 5,
  'MESSAGE_SENT': 6,
  'NUDGE_SENT': 7,
  'BOOKED': 9,
  'NOT_INTERESTED': 10,
};

// Follow-up template numbers
const FOLLOWUP_TEMPLATES = [4, 6, 7, 8, 9, 10];

export interface TemplateSelection {
  template: LITemplate;
  rotationVariant?: LIRotationVariant;
  variables: TemplateVariables;
  renderedMessage: string;
  prerequisitesMet: boolean;
  prerequisiteReason?: string;
}

export function selectTemplate(
  lead: LILead,
  templates: LITemplate[],
  rotationVariants: LIRotationVariant[],
  context?: {
    days_since_message?: number;
    days_since_nudge?: number;
    days_since_loom?: number;
    days_since_cold?: number;
    days_since_session?: number;
    forced_variant?: 'A' | 'B';
    extras?: Record<string, string>;
  }
): TemplateSelection | null {
  const stage = lead.pipeline_stage;
  const templateNumber = STAGE_TEMPLATE_MAP[stage];
  if (!templateNumber) return null;

  // Find matching template
  const variant = context?.forced_variant || lead.template_variant || 'A';
  let template = templates.find(t =>
    t.template_number === templateNumber &&
    t.variant === variant &&
    t.is_active
  );

  // Fallback to variant A if B not found
  if (!template && variant === 'B') {
    template = templates.find(t =>
      t.template_number === templateNumber &&
      t.variant === 'A' &&
      t.is_active
    );
  }

  if (!template) return null;

  // Check prerequisites
  const prereqCheck = checkPrerequisites(template, lead, context);

  // For T1 (connection note), select rotation variant
  let rotationVariant: LIRotationVariant | undefined;
  if (templateNumber === 1 && rotationVariants.length > 0) {
    const variantNum = lead.rotation_variant || (Math.floor(Math.random() * rotationVariants.length) + 1);
    rotationVariant = rotationVariants.find(rv => rv.variant_number === variantNum && rv.is_active);
  }

  // Generate variables and render
  const variables = extractVariables(lead, context?.extras);
  const textToRender = rotationVariant?.template_text || template.template_text;
  const renderedMessage = interpolate(textToRender, variables);

  return {
    template,
    rotationVariant,
    variables,
    renderedMessage,
    prerequisitesMet: prereqCheck.met,
    prerequisiteReason: prereqCheck.reason,
  };
}

// ============================================================================
// NEXT TEMPLATE INFO
// ============================================================================

export interface NextTemplateInfo {
  templateNumber: number;
  stage: string;
  label: string;
  isFollowup: boolean;
  prerequisiteSummary: string;
}

const TEMPLATE_LABELS: Record<number, string> = {
  1: 'Connection Note',
  2: 'Loom Permission',
  3: 'Loom Delivery',
  4: 'Loom Follow-up',
  5: 'Strategy Session',
  6: 'Follow-up Permission (1st)',
  7: 'Follow-up Permission (2nd)',
  8: 'Follow-up Loom (1st)',
  9: 'No-Show Reschedule',
  10: 'Re-engagement',
};

export function getNextTemplateForStage(stage: LIPipelineStage): NextTemplateInfo | null {
  const num = STAGE_TEMPLATE_MAP[stage];
  if (!num) return null;

  return {
    templateNumber: num,
    stage,
    label: TEMPLATE_LABELS[num] || `Template ${num}`,
    isFollowup: FOLLOWUP_TEMPLATES.includes(num),
    prerequisiteSummary: getPrerequisiteSummary(num),
  };
}

function getPrerequisiteSummary(templateNumber: number): string {
  switch (templateNumber) {
    case 1: return 'None';
    case 2: return 'Connected';
    case 3: return 'Loom consent given';
    case 4: return '2+ days since Loom sent';
    case 5: return 'Positive Loom response';
    case 6: return '4+ days since message, <2 follow-ups';
    case 7: return '4+ days since nudge, <2 follow-ups';
    case 8: return '4+ days since Loom, <2 follow-ups';
    case 9: return 'Session missed, 1+ day since';
    case 10: return '21+ days cold, previously engaged, 0 re-engagements';
    default: return 'Unknown';
  }
}

// ============================================================================
// SEQUENCE OVERVIEW
// ============================================================================

export function getSequenceOverview(): { number: number; label: string; stage: string; isFollowup: boolean }[] {
  return Object.entries(STAGE_TEMPLATE_MAP)
    .sort((a, b) => a[1] - b[1])
    .map(([stage, num]) => ({
      number: num,
      label: TEMPLATE_LABELS[num] || `T${num}`,
      stage,
      isFollowup: FOLLOWUP_TEMPLATES.includes(num),
    }));
}
