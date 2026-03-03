/**
 * Recovery Processor - retries failed enrichments with exponential backoff
 *
 * Processes the li_failed_leads table, retrying from the failed tier.
 * Gives up after 3 attempts and moves the lead to PERMANENTLY_COLD.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { enrichLead, getApiKeys } from './enrichment-cascade';
import { transitionStage } from './pipeline-fsm';
import type { LILead } from '../types';

const MAX_RETRIES = 3;

// Exponential backoff: 6h, 24h, 72h
const BACKOFF_HOURS = [6, 24, 72];

interface RecoveryResult {
  retried: number;
  resolved: number;
  exhausted: number;
  errors: string[];
}

export async function processRecoveryQueue(
  supabase: SupabaseClient,
  userId: string
): Promise<RecoveryResult> {
  const result: RecoveryResult = { retried: 0, resolved: 0, exhausted: 0, errors: [] };

  // Get failed leads ready for retry
  const { data: failedLeads, error } = await supabase
    .from('li_failed_leads')
    .select('*, lead:li_leads(*)')
    .eq('user_id', userId)
    .eq('status', 'PENDING_RETRY')
    .lte('next_retry_at', new Date().toISOString())
    .order('next_retry_at', { ascending: true })
    .limit(20);

  if (error || !failedLeads?.length) return result;

  const apiKeys = await getApiKeys(supabase);

  for (const failed of failedLeads) {
    const lead = failed.lead as LILead | null;
    if (!lead) continue;

    result.retried++;

    // Check if we've exhausted retries
    if (failed.retry_count >= MAX_RETRIES) {
      await supabase
        .from('li_failed_leads')
        .update({ status: 'EXHAUSTED', resolved_at: new Date().toISOString() })
        .eq('id', failed.id);

      // Move lead to permanently cold
      await transitionStage(
        supabase,
        lead.id,
        lead.pipeline_stage,
        'PERMANENTLY_COLD',
        'orchestrator',
        `Recovery exhausted after ${MAX_RETRIES} retries: ${failed.error_type}`
      );

      result.exhausted++;
      continue;
    }

    try {
      // Retry enrichment from the failed tier
      const startTier = failed.failed_tier || 1;
      const enrichResult = await enrichLead(supabase, lead, apiKeys, startTier);

      // Log cost events
      for (const cost of enrichResult.cost_events) {
        await supabase.from('li_cost_events').insert({
          user_id: userId,
          lead_id: lead.id,
          service_name: cost.service_name,
          operation: `recovery_${cost.operation}`,
          credits_used: cost.credits_used,
          cost_usd: cost.cost_usd,
          success: cost.success,
          error_message: cost.error_message,
        });
      }

      if (enrichResult.website || enrichResult.email) {
        // Success - update lead and resolve
        await supabase
          .from('li_leads')
          .update({
            website: enrichResult.website || lead.website,
            website_source: enrichResult.website_source || lead.website_source,
            email: enrichResult.email || lead.email,
            email_source: enrichResult.email_source || lead.email_source,
            email_verified: enrichResult.email_verified || lead.email_verified,
            enrichment_tier: enrichResult.enrichment_tier,
            enrichment_data: enrichResult.enrichment_data,
            updated_at: new Date().toISOString(),
          })
          .eq('id', lead.id);

        await supabase
          .from('li_failed_leads')
          .update({ status: 'RESOLVED', resolved_at: new Date().toISOString() })
          .eq('id', failed.id);

        // Advance to qualification
        await transitionStage(supabase, lead.id, lead.pipeline_stage, 'TO_QUALIFY', 'orchestrator', 'Recovery succeeded');

        result.resolved++;
      } else {
        // Still failing - schedule next retry
        const backoffHours = BACKOFF_HOURS[Math.min(failed.retry_count, BACKOFF_HOURS.length - 1)];
        const nextRetry = new Date(Date.now() + backoffHours * 60 * 60 * 1000).toISOString();

        await supabase
          .from('li_failed_leads')
          .update({
            retry_count: failed.retry_count + 1,
            recovery_attempts: (failed.recovery_attempts || 0) + 1,
            next_retry_at: nextRetry,
            error_message: enrichResult.errors.join('; ') || 'No data returned',
          })
          .eq('id', failed.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(`Lead ${lead.id}: ${msg}`);

      // Schedule retry on unexpected errors too
      const backoffHours = BACKOFF_HOURS[Math.min(failed.retry_count, BACKOFF_HOURS.length - 1)];
      const nextRetry = new Date(Date.now() + backoffHours * 60 * 60 * 1000).toISOString();

      await supabase
        .from('li_failed_leads')
        .update({
          retry_count: failed.retry_count + 1,
          next_retry_at: nextRetry,
          error_message: msg,
        })
        .eq('id', failed.id);
    }
  }

  return result;
}
