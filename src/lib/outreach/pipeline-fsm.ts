/**
 * Pipeline FSM - State machine for LinkedIn outreach pipeline stages
 *
 * Defines allowed transitions between pipeline stages and logs all
 * transitions to the li_pipeline_events table for audit.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { LIPipelineStage } from '../types';

// ============================================================================
// TRANSITION RULES
// ============================================================================

// Allowed transitions: from_stage -> [to_stages]
const TRANSITIONS: Record<LIPipelineStage, LIPipelineStage[]> = {
  TO_ENRICH: ['ENRICHING'],
  ENRICHING: ['TO_QUALIFY', 'TO_ENRICH'], // Back to TO_ENRICH on failure
  TO_QUALIFY: ['QUALIFYING'],
  QUALIFYING: ['TO_SEND_CONNECTION', 'NOT_INTERESTED'], // Disqualified leads go to NOT_INTERESTED
  TO_SEND_CONNECTION: ['CONNECTION_SENT'],
  CONNECTION_SENT: ['CONNECTED', 'COLD_CONNECTION'],
  CONNECTED: ['MESSAGE_SENT'],
  MESSAGE_SENT: ['NUDGE_SENT', 'LOOM_PERMISSION', 'REPLIED', 'NOT_INTERESTED'],
  NUDGE_SENT: ['LOOM_PERMISSION', 'REPLIED', 'NOT_INTERESTED'],
  LOOM_PERMISSION: ['LOOM_SENT'],
  LOOM_SENT: ['REPLIED', 'NOT_INTERESTED'],
  REPLIED: ['BOOKED', 'NOT_INTERESTED'],
  BOOKED: ['NOT_INTERESTED'], // No-show or cancelled
  NOT_INTERESTED: ['FROZEN', 'TO_SEND_CONNECTION'], // Re-engagement after 90 days
  COLD_CONNECTION: ['FROZEN'],
  FROZEN: ['NOT_INTERESTED', 'PERMANENTLY_COLD'], // After 90 days, try re-engagement or give up
  PERMANENTLY_COLD: [], // Terminal state
};

// Stages that allow manual override transitions (Ziv can force these)
const MANUAL_OVERRIDE_TRANSITIONS: Record<string, LIPipelineStage[]> = {
  // Any active stage can be manually moved to NOT_INTERESTED
  '*': ['NOT_INTERESTED'],
  // Specific manual overrides
  CONNECTION_SENT: ['CONNECTED'], // Manual confirmation of acceptance
  CONNECTED: ['LOOM_PERMISSION'], // Skip message step
  MESSAGE_SENT: ['LOOM_PERMISSION', 'REPLIED'],
  NUDGE_SENT: ['LOOM_PERMISSION', 'REPLIED'],
  LOOM_SENT: ['REPLIED'],
  REPLIED: ['BOOKED'],
  NOT_INTERESTED: ['TO_SEND_CONNECTION'], // Manual re-engagement approval
};

// ============================================================================
// VALIDATION
// ============================================================================

export function isValidTransition(
  from: LIPipelineStage,
  to: LIPipelineStage,
  isManual: boolean = false
): boolean {
  // Check standard transitions
  const allowed = TRANSITIONS[from] || [];
  if (allowed.includes(to)) return true;

  // Check manual overrides
  if (isManual) {
    const globalOverrides = MANUAL_OVERRIDE_TRANSITIONS['*'] || [];
    if (globalOverrides.includes(to)) return true;

    const stageOverrides = MANUAL_OVERRIDE_TRANSITIONS[from] || [];
    if (stageOverrides.includes(to)) return true;
  }

  return false;
}

export function getNextStages(
  from: LIPipelineStage,
  isManual: boolean = false
): LIPipelineStage[] {
  const standard = TRANSITIONS[from] || [];

  if (!isManual) return standard;

  const globalOverrides = MANUAL_OVERRIDE_TRANSITIONS['*'] || [];
  const stageOverrides = MANUAL_OVERRIDE_TRANSITIONS[from] || [];

  return Array.from(new Set([...standard, ...globalOverrides, ...stageOverrides]));
}

// ============================================================================
// STAGE TRANSITION
// ============================================================================

export async function transitionStage(
  supabase: SupabaseClient,
  leadId: string,
  fromStage: LIPipelineStage,
  toStage: LIPipelineStage,
  triggeredBy: 'scout' | 'qualifier' | 'outreach' | 'orchestrator' | 'manual' | 'browser',
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  const isManual = triggeredBy === 'manual';

  if (!isValidTransition(fromStage, toStage, isManual)) {
    return {
      success: false,
      error: `Invalid transition: ${fromStage} -> ${toStage}${isManual ? ' (manual)' : ''}`,
    };
  }

  // Update the lead's pipeline_stage
  const updateData: Record<string, unknown> = {
    pipeline_stage: toStage,
  };

  // Set previously_engaged flag if they accepted connection or replied
  if (['CONNECTED', 'REPLIED', 'BOOKED', 'LOOM_PERMISSION'].includes(toStage)) {
    updateData.previously_engaged = true;
  }

  // Reset followup count when entering a new stage
  if (fromStage !== toStage) {
    updateData.followup_count_at_stage = 0;
  }

  // Handle stage-specific updates
  if (toStage === 'FROZEN') {
    // Set 90-day freeze
    const freezeUntil = new Date();
    freezeUntil.setDate(freezeUntil.getDate() + 90);
    updateData.next_followup_at = freezeUntil.toISOString();
  }

  if (toStage === 'NOT_INTERESTED' && fromStage === 'FROZEN') {
    // Re-engagement attempt
    updateData.re_engagement_count = 1; // Will be incremented via SQL if needed
  }

  const { error: updateError } = await supabase
    .from('li_leads')
    .update(updateData)
    .eq('id', leadId);

  if (updateError) {
    return { success: false, error: `Failed to update lead: ${updateError.message}` };
  }

  // Log the transition
  const { error: logError } = await supabase
    .from('li_pipeline_events')
    .insert({
      lead_id: leadId,
      from_stage: fromStage,
      to_stage: toStage,
      triggered_by: triggeredBy,
      notes,
    });

  if (logError) {
    console.error('Failed to log pipeline event:', logError);
  }

  return { success: true };
}

// ============================================================================
// BATCH TRANSITION
// ============================================================================

export async function batchTransitionStage(
  supabase: SupabaseClient,
  leadIds: string[],
  fromStage: LIPipelineStage,
  toStage: LIPipelineStage,
  triggeredBy: 'scout' | 'qualifier' | 'outreach' | 'orchestrator' | 'manual' | 'browser',
  notes?: string
): Promise<{ succeeded: number; failed: number; errors: string[] }> {
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const leadId of leadIds) {
    const result = await transitionStage(supabase, leadId, fromStage, toStage, triggeredBy, notes);
    if (result.success) {
      succeeded++;
    } else {
      failed++;
      errors.push(`Lead ${leadId}: ${result.error}`);
    }
  }

  return { succeeded, failed, errors };
}

// ============================================================================
// PIPELINE STATS
// ============================================================================

export async function getPipelineStats(
  supabase: SupabaseClient,
  userId: string
): Promise<Record<LIPipelineStage, number>> {
  const { data, error } = await supabase
    .from('li_leads')
    .select('pipeline_stage')
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (error || !data) {
    return {} as Record<LIPipelineStage, number>;
  }

  const stats: Record<string, number> = {};
  for (const lead of data) {
    const stage = lead.pipeline_stage as LIPipelineStage;
    stats[stage] = (stats[stage] || 0) + 1;
  }

  return stats as Record<LIPipelineStage, number>;
}
