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
import {
  executeBatchSend as browserSendBatch,
  checkInbox,
  checkPendingConnections,
  getSessionHealth,
  isLinkedInServiceAvailable,
} from './linkedin-browser';
import type { LIJob, LIJobType, LIJobStatus, OrchestratorCallbacks, LIPipelineStage } from '../types';

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
      return await processRecoveryQueue(supabase, job.user_id) as unknown as Record<string, unknown>;
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

    case 'SEND_BATCH': {
      const batchId = payload.batch_id as string;
      if (!batchId) throw new Error('No batch_id in payload');
      return await executeSendBatch(supabase, job.user_id, batchId, callbacks);
    }

    case 'CHECK_RESPONSES': {
      return await executeCheckResponses(supabase, job.user_id, callbacks);
    }

    case 'SESSION_HEALTH': {
      return await executeSessionHealthCheck(supabase, job.user_id);
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
      const stageMap: Record<string, LIPipelineStage> = {
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
// BROWSER AUTOMATION HANDLERS
// ============================================================================

async function executeSendBatch(
  supabase: SupabaseClient,
  userId: string,
  batchId: string,
  callbacks?: OrchestratorCallbacks
): Promise<Record<string, unknown>> {
  callbacks?.onProgress?.('Checking LinkedIn service availability...');

  const available = await isLinkedInServiceAvailable();
  if (!available) {
    throw new Error('LinkedIn browser service is not available');
  }

  // Get settings for delay config
  const { data: settings } = await supabase
    .from('li_settings')
    .select('browser_session_id, min_delay_between_actions_ms, max_delay_between_actions_ms')
    .eq('user_id', userId)
    .single();

  // Get the active browser session
  const sessionId = settings?.browser_session_id;
  if (sessionId) {
    const { data: session } = await supabase
      .from('li_browser_sessions')
      .select('id, status, health_status')
      .eq('id', sessionId)
      .single();
    if (!session || session.status !== 'active' || session.health_status === 'logged_out') {
      throw new Error('Browser session is not active or healthy');
    }
  }

  // Mark batch as sending
  await supabase
    .from('li_daily_batches')
    .update({ send_started_at: new Date().toISOString() })
    .eq('id', batchId);

  // Fetch approved messages for this batch
  const { data: messages } = await supabase
    .from('li_outreach_messages')
    .select(`
      id, lead_id, message_text, template_number, status,
      li_leads!inner(id, linkedin_url, pipeline_stage, full_name)
    `)
    .eq('status', 'approved')
    .in('lead_id', (
      await supabase
        .from('li_daily_batches')
        .select('lead_ids')
        .eq('id', batchId)
        .single()
    ).data?.lead_ids || []);

  if (!messages?.length) {
    return { sent: 0, failed: 0, message: 'No approved messages found for batch' };
  }

  callbacks?.onProgress?.(`Sending ${messages.length} messages via LinkedIn browser...`);

  // Build batch messages for the VPS service
  const batchMessages = messages.map((msg: any) => ({
    lead_id: msg.lead_id,
    message_id: msg.id,
    linkedin_url: msg.li_leads?.linkedin_url || '',
    message_text: msg.message_text,
    action_type: (msg.li_leads?.pipeline_stage === 'TO_SEND_CONNECTION'
      ? 'connect_with_note' : 'send_message') as 'connect_with_note' | 'send_message',
    pipeline_stage: msg.li_leads?.pipeline_stage || '',
  }));

  // Call VPS service to execute batch
  const result = await browserSendBatch(batchId, batchMessages, {
    sessionId: 'default',
    minDelayMs: settings?.min_delay_between_actions_ms || 45000,
    maxDelayMs: settings?.max_delay_between_actions_ms || 120000,
  });

  // Process results - update messages and pipeline stages
  let sent = 0;
  let failed = 0;

  for (const actionResult of result.results) {
    if (actionResult.success) {
      // Mark message as sent
      await supabase
        .from('li_outreach_messages')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', actionResult.message_id);

      // Find the lead's current stage and transition
      const msg = messages.find((m: any) => m.id === actionResult.message_id);
      if (msg?.li_leads) {
        const lead = msg.li_leads as any;
        const fromStage = lead.pipeline_stage as LIPipelineStage;
        let toStage: LIPipelineStage = fromStage;

        if (fromStage === 'TO_SEND_CONNECTION') toStage = 'CONNECTION_SENT';
        else if (fromStage === 'CONNECTED') toStage = 'MESSAGE_SENT';
        else if (fromStage === 'LOOM_PERMISSION') toStage = 'LOOM_SENT';

        if (toStage !== fromStage) {
          await transitionStage(supabase, lead.id, fromStage, toStage, 'browser', 'Sent via browser automation');
        }

        // Update last_contacted_at
        await supabase
          .from('li_leads')
          .update({ last_contacted_at: new Date().toISOString() })
          .eq('id', lead.id);
      }

      sent++;
    } else {
      // Mark message as failed
      await supabase
        .from('li_outreach_messages')
        .update({
          send_error: actionResult.error || 'Unknown error',
        })
        .eq('id', actionResult.message_id);
      failed++;
    }

    // Log browser action
    await supabase.from('li_browser_actions').insert({
      session_id: sessionId || '00000000-0000-0000-0000-000000000000',
      user_id: userId,
      lead_id: actionResult.lead_id,
      message_id: actionResult.message_id,
      batch_id: batchId,
      action_type: batchMessages.find(m => m.message_id === actionResult.message_id)?.action_type || 'send_message',
      status: actionResult.success ? 'completed' : 'failed',
      input_data: { linkedin_url: batchMessages.find(m => m.message_id === actionResult.message_id)?.linkedin_url },
      result_data: actionResult.data || {},
      error_message: actionResult.error || null,
      duration_ms: actionResult.duration_ms,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });

    callbacks?.onProgress?.(`Sent ${sent}/${messages.length} (${failed} failed)`);
  }

  // Update batch status
  await supabase
    .from('li_daily_batches')
    .update({
      status: 'sent',
      send_completed_at: new Date().toISOString(),
      send_result: { sent, failed, total: messages.length },
    })
    .eq('id', batchId);

  // Update session daily count
  if (sessionId) {
    const { error: rpcError } = await supabase.rpc('increment_li_browser_daily_actions', {
      p_session_id: sessionId,
      p_count: sent,
    });
    if (rpcError) {
      // Non-critical: just increment manually
      await supabase
        .from('li_browser_sessions')
        .update({
          daily_actions_count: sent,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', sessionId);
    }
  }

  return { sent, failed, total: messages.length, batch_id: batchId };
}

async function executeCheckResponses(
  supabase: SupabaseClient,
  userId: string,
  callbacks?: OrchestratorCallbacks
): Promise<Record<string, unknown>> {
  const available = await isLinkedInServiceAvailable();
  if (!available) {
    throw new Error('LinkedIn browser service is not available');
  }

  let connectionsAccepted = 0;
  let repliesDetected = 0;

  // 1. Check pending connections
  callbacks?.onProgress?.('Checking pending connection requests...');
  const pendingResult = await checkPendingConnections();
  const pendingUrls = new Set(pendingResult.pending.map(p => p.linkedin_url).filter(Boolean));

  // Find leads at CONNECTION_SENT stage
  const { data: connectionSentLeads } = await supabase
    .from('li_leads')
    .select('id, linkedin_url, pipeline_stage')
    .eq('user_id', userId)
    .eq('pipeline_stage', 'CONNECTION_SENT')
    .is('deleted_at', null);

  if (connectionSentLeads?.length) {
    for (const lead of connectionSentLeads) {
      if (!lead.linkedin_url) continue;
      // If NOT in pending list anymore, they accepted (or declined)
      const normalizedUrl = lead.linkedin_url.replace(/\/$/, '');
      const stillPending = Array.from(pendingUrls).some(url =>
        url.includes(normalizedUrl) || normalizedUrl.includes(url)
      );

      if (!stillPending) {
        // Assume accepted (we can't easily distinguish accepted vs withdrawn)
        await transitionStage(supabase, lead.id, 'CONNECTION_SENT', 'CONNECTED', 'browser', 'Connection accepted (detected via browser)');
        connectionsAccepted++;
      }
    }
  }

  // 2. Check inbox for replies
  callbacks?.onProgress?.('Checking inbox for replies...');
  const inboxResult = await checkInbox();
  const unreadConvos = inboxResult.conversations.filter(c => c.unread);

  if (unreadConvos.length) {
    // Try to match unread conversations to leads
    const { data: activeLeads } = await supabase
      .from('li_leads')
      .select('id, full_name, pipeline_stage')
      .eq('user_id', userId)
      .in('pipeline_stage', ['CONNECTION_SENT', 'CONNECTED', 'MESSAGE_SENT', 'NUDGE_SENT', 'LOOM_SENT'])
      .is('deleted_at', null);

    if (activeLeads?.length) {
      for (const convo of unreadConvos) {
        const matchedLead = activeLeads.find(lead => {
          const leadName = (lead.full_name || '').toLowerCase();
          const convoName = (convo.name || '').toLowerCase();
          return leadName && convoName && (
            convoName.includes(leadName) || leadName.includes(convoName)
          );
        });

        if (matchedLead) {
          const currentStage = matchedLead.pipeline_stage as LIPipelineStage;
          if (['MESSAGE_SENT', 'NUDGE_SENT', 'LOOM_SENT'].includes(currentStage)) {
            await transitionStage(supabase, matchedLead.id, currentStage, 'REPLIED', 'browser', `Reply detected: "${convo.snippet?.substring(0, 100)}"`);
            repliesDetected++;
          }
        }
      }
    }
  }

  return {
    connections_accepted: connectionsAccepted,
    replies_detected: repliesDetected,
    total_pending: pendingResult.total_pending,
    unread_conversations: unreadConvos.length,
  };
}

async function executeSessionHealthCheck(
  supabase: SupabaseClient,
  userId: string
): Promise<Record<string, unknown>> {
  const available = await isLinkedInServiceAvailable();
  if (!available) {
    return { status: 'service_unavailable' };
  }

  const health = await getSessionHealth();

  // Update browser session in DB
  const { data: session } = await supabase
    .from('li_browser_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (session) {
    await supabase
      .from('li_browser_sessions')
      .update({
        health_status: health.health === 'inactive' ? 'unknown' : health.health,
        last_health_check_at: new Date().toISOString(),
      })
      .eq('id', session.id);

    // Auto-pause if logged out or blocked
    if (health.health === 'logged_out' || health.health === 'blocked') {
      await supabase
        .from('li_settings')
        .update({
          pause_outreach: true,
          pause_reason: `Browser session ${health.health} - re-authentication required`,
        })
        .eq('user_id', userId);

      await notifySafetyTrigger(supabase, userId, {
        name: 'browser_session_unhealthy',
        reason: `LinkedIn session is ${health.health}. Outreach auto-paused.`,
        severity: 'critical',
      });
    }
  }

  return {
    health: health.health,
    logged_in: health.logged_in,
    session_id: session?.id || null,
  };
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

    if (safety.isPaused) {
      return false;
    }

    if (safety.accountHealth === 'red') {
      await notifySafetyTrigger(supabase, userId, {
        name: 'orchestrator_block',
        reason: `Job ${jobType} blocked - account health is RED`,
        severity: 'critical',
      });
      return false;
    }

    return true;
  } catch {
    // If safety check itself fails, allow the job (fail open for queue processing)
    return true;
  }
}
