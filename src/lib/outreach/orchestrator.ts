/**
 * Orchestrator - central job queue processor for LinkedIn outreach pipeline
 *
 * Polls li_jobs table, acquires locks, dispatches to existing modules,
 * and stores results. Designed to run within Vercel's 300s serverless limit.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { enrichBatch, getApiKeys } from './enrichment-cascade';
import { qualifyBatch } from './qualifier';
import { generateDailyBatch } from './batch-scheduler';
import { getSafetyStatus } from './safety-monitor';
import { analyzeOverrides } from './feedback-loop';
import { evaluateAllTests } from './ab-test-engine';
import { notifySafetyTrigger } from './slack-notify';
import { transitionStage } from './pipeline-fsm';
import { processRecoveryQueue } from './recovery-processor';
import { researchLeadBatch } from './web-researcher';
import { personalizeMessageBatch } from './message-personalizer';
import type { LIJob, LIJobType, LIJobStatus, OrchestratorCallbacks } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface OrchestratorConfig {
  workerId: string;
  maxJobs: number;
  deadlineMs: number;
  dryRun?: boolean;
}

export interface JobExecutionResult {
  jobId: string;
  jobType: LIJobType;
  status: 'COMPLETED' | 'FAILED';
  result: Record<string, unknown>;
  durationMs: number;
  error?: string;
}

export interface QueueProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
  results: JobExecutionResult[];
  needs_resume: boolean;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function processJobQueue(
  supabase: SupabaseClient,
  config: OrchestratorConfig,
  callbacks?: OrchestratorCallbacks
): Promise<QueueProcessResult> {
  const startTime = Date.now();
  const deadline = startTime + config.deadlineMs;
  const results: JobExecutionResult[] = [];
  let succeeded = 0;
  let failed = 0;

  callbacks?.onProgress?.(`Orchestrator ${config.workerId} starting - max ${config.maxJobs} jobs, ${config.deadlineMs / 1000}s deadline`);

  for (let i = 0; i < config.maxJobs; i++) {
    // Check deadline - leave 30s buffer for cleanup
    if (Date.now() > deadline - 30_000) {
      callbacks?.onProgress?.('Deadline approaching - stopping job processing');
      return {
        processed: results.length,
        succeeded,
        failed,
        results,
        needs_resume: true,
      };
    }

    // Acquire next job
    const job = await acquireJob(supabase, config.workerId);
    if (!job) {
      callbacks?.onProgress?.('No more pending jobs in queue');
      break;
    }

    callbacks?.onProgress?.(`Processing job ${job.id} (${job.job_type}) - attempt ${job.attempts}/${job.max_attempts}`);

    const jobStart = Date.now();

    // Safety check before processing
    const safetyOk = await checkSafety(supabase, job.user_id, job.job_type);
    if (!safetyOk) {
      const result = {
        jobId: job.id,
        jobType: job.job_type as LIJobType,
        status: 'FAILED' as const,
        result: { reason: 'safety_block' },
        durationMs: Date.now() - jobStart,
        error: 'Outreach paused or safety check failed',
      };
      await releaseJob(supabase, job.id, 'FAILED', result.result, result.error);
      results.push(result);
      failed++;
      continue;
    }

    try {
      const jobResult = await executeJob(supabase, job, {
        ...callbacks,
        onProgress: (msg) => callbacks?.onProgress?.(`[${job.job_type}] ${msg}`),
      });

      await releaseJob(supabase, job.id, 'COMPLETED', jobResult);

      results.push({
        jobId: job.id,
        jobType: job.job_type as LIJobType,
        status: 'COMPLETED',
        result: jobResult,
        durationMs: Date.now() - jobStart,
      });
      succeeded++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';

      await releaseJob(supabase, job.id, 'FAILED', {}, errorMsg);

      results.push({
        jobId: job.id,
        jobType: job.job_type as LIJobType,
        status: 'FAILED',
        result: {},
        durationMs: Date.now() - jobStart,
        error: errorMsg,
      });
      failed++;
    }
  }

  callbacks?.onProgress?.(`Orchestrator done: ${succeeded} succeeded, ${failed} failed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  return {
    processed: results.length,
    succeeded,
    failed,
    results,
    needs_resume: false,
  };
}

// ============================================================================
// JOB ACQUISITION & RELEASE
// ============================================================================

export async function acquireJob(
  supabase: SupabaseClient,
  workerId: string
): Promise<LIJob | null> {
  const { data, error } = await supabase.rpc('acquire_next_li_job', {
    p_worker_id: workerId,
    p_lock_duration: '5 minutes',
  });

  if (error || !data?.length) return null;
  return data[0] as LIJob;
}

export async function releaseJob(
  supabase: SupabaseClient,
  jobId: string,
  status: LIJobStatus,
  result: Record<string, unknown>,
  error?: string
): Promise<void> {
  await supabase
    .from('li_jobs')
    .update({
      status,
      result,
      error_message: error || null,
      locked_by: null,
      lock_expires_at: null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

export async function cleanupStaleLocks(
  supabase: SupabaseClient
): Promise<number> {
  const { data, error } = await supabase.rpc('cleanup_stale_li_locks');
  if (error) return 0;
  return typeof data === 'number' ? data : 0;
}

// ============================================================================
// JOB CREATION HELPER
// ============================================================================

export async function enqueueJob(
  supabase: SupabaseClient,
  userId: string,
  jobType: LIJobType,
  payload: Record<string, unknown>,
  priority: number = 3
): Promise<string> {
  const { data, error } = await supabase
    .from('li_jobs')
    .insert({
      user_id: userId,
      job_type: jobType,
      payload,
      priority,
      status: 'PENDING',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to enqueue job: ${error.message}`);
  return data.id;
}

// ============================================================================
// JOB DISPATCH
// ============================================================================

async function executeJob(
  supabase: SupabaseClient,
  job: LIJob,
  callbacks?: OrchestratorCallbacks
): Promise<Record<string, unknown>> {
  const payload = (job.payload || {}) as Record<string, unknown>;

  switch (job.job_type) {
    case 'SCOUT_ENRICH': {
      const leadIds = payload.lead_ids as string[];
      if (!leadIds?.length) throw new Error('No lead_ids in payload');
      const apiKeys = await getApiKeys(supabase);
      const result = await enrichBatch(supabase, job.user_id, leadIds, apiKeys);
      return result as unknown as Record<string, unknown>;
    }

    case 'QUALIFY': {
      const leadIds = payload.lead_ids as string[];
      if (!leadIds?.length) throw new Error('No lead_ids in payload');
      return await qualifyBatch(supabase, job.user_id, leadIds);
    }

    case 'GENERATE_OUTREACH': {
      const targetDate = (payload.target_date as string) || new Date().toISOString().split('T')[0];
      const result = await generateDailyBatch(supabase, {
        userId: job.user_id,
        targetDate,
      });
      return {
        batch_id: result.batch?.id || null,
        generated: result.stats?.generated_count || 0,
        quality_passed: result.stats?.quality_passed || 0,
        quality_failed: result.stats?.quality_failed || 0,
      };
    }

    case 'WEB_RESEARCH': {
      const leadIds = payload.lead_ids as string[];
      if (!leadIds?.length) throw new Error('No lead_ids in payload');
      return await researchLeadBatch(supabase, job.user_id, {
        lead_ids: leadIds,
        deadline_ms: 240_000, // 4 min max per research batch
      }, callbacks);
    }

    case 'PERSONALIZE_MESSAGE': {
      const leadIds = payload.lead_ids as string[];
      if (!leadIds?.length) throw new Error('No lead_ids in payload');
      return await personalizeMessageBatch(supabase, job.user_id, {
        lead_ids: leadIds,
      }, callbacks);
    }

    case 'FOLLOW_UP_CHECK': {
      return await checkFollowUps(supabase, job.user_id);
    }

    case 'RECOVERY': {
      return await processRecoveryQueue(supabase, job.user_id);
    }

    case 'FEEDBACK_COLLECT': {
      const overrides = await analyzeOverrides(supabase, job.user_id);
      return { overrides_analyzed: overrides?.length || 0 };
    }

    case 'AB_EVALUATE': {
      const evaluations = await evaluateAllTests(supabase, job.user_id);
      return {
        tests_evaluated: evaluations?.length || 0,
        winners: evaluations?.filter((e: any) => e.status?.startsWith('winner')).length || 0,
      };
    }

    case 'PURGE_TRASH': {
      return await purgeExpiredTrash(supabase, job.user_id);
    }

    case 'SCOUT_IMPORT': {
      // Import is typically handled synchronously via API/SSE
      // This job type exists for scheduled/deferred imports
      return { message: 'Import jobs should use the streaming endpoint' };
    }

    default:
      throw new Error(`Unknown job type: ${job.job_type}`);
  }
}

// ============================================================================
// INLINE JOB HANDLERS
// ============================================================================

async function checkFollowUps(
  supabase: SupabaseClient,
  userId: string
): Promise<Record<string, unknown>> {
  const now = new Date().toISOString();
  let followedUp = 0;
  const errors: string[] = [];

  // Find leads where next_followup_at has passed
  const { data: leads } = await supabase
    .from('li_leads')
    .select('id, pipeline_stage, followup_count_at_stage, next_followup_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .lte('next_followup_at', now)
    .in('pipeline_stage', ['MESSAGE_SENT', 'NUDGE_SENT', 'LOOM_SENT', 'BOOKED'])
    .limit(50);

  if (!leads?.length) return { checked: 0, followups_needed: 0 };

  for (const lead of leads) {
    try {
      // Determine next stage based on current stage
      const stageMap: Record<string, string> = {
        'MESSAGE_SENT': 'NUDGE_SENT',
        'NUDGE_SENT': 'NOT_INTERESTED',
        'LOOM_SENT': 'NUDGE_SENT',
        'BOOKED': 'BOOKED', // Re-check for no-shows
      };

      const nextStage = stageMap[lead.pipeline_stage];
      if (!nextStage || nextStage === lead.pipeline_stage) continue;

      // Only advance if followup count is under threshold
      if ((lead.followup_count_at_stage || 0) >= 2) {
        // Max followups reached - move to cold
        await transitionStage(supabase, lead.id, lead.pipeline_stage, 'NOT_INTERESTED', 'orchestrator', 'Max follow-ups reached');
      } else {
        await transitionStage(supabase, lead.id, lead.pipeline_stage, nextStage, 'orchestrator', 'Auto follow-up triggered');
      }
      followedUp++;
    } catch (err) {
      errors.push(`Lead ${lead.id}: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }

  return { checked: leads.length, followups_needed: followedUp, errors };
}

async function purgeExpiredTrash(
  supabase: SupabaseClient,
  userId: string
): Promise<Record<string, unknown>> {
  const now = new Date().toISOString();

  // Hard-delete leads where purge_after has passed
  const { data: purged, error } = await supabase
    .from('li_leads')
    .delete()
    .eq('user_id', userId)
    .not('deleted_at', 'is', null)
    .lte('purge_after', now)
    .select('id');

  if (error) return { purged: 0, error: error.message };

  return { purged: purged?.length || 0 };
}

// ============================================================================
// SAFETY CHECK
// ============================================================================

async function checkSafety(
  supabase: SupabaseClient,
  userId: string,
  jobType: string
): Promise<boolean> {
  // Some jobs always run regardless of safety (admin/maintenance)
  const alwaysAllowed: string[] = ['PURGE_TRASH', 'FEEDBACK_COLLECT', 'AB_EVALUATE', 'RECOVERY'];
  if (alwaysAllowed.includes(jobType)) return true;

  try {
    const safety = await getSafetyStatus(supabase, userId);

    if (safety.pause_outreach) {
      return false;
    }

    if (safety.account_health === 'red') {
      await notifySafetyTrigger(supabase, userId, {
        trigger: 'orchestrator_block',
        message: `Job ${jobType} blocked - account health is RED`,
        severity: 'high',
      });
      return false;
    }

    return true;
  } catch {
    // If safety check itself fails, allow the job (fail open for queue processing)
    return true;
  }
}
