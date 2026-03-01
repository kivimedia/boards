import 'dotenv/config';
import { config } from './config.js';
import { supabase } from './lib/supabase.js';
import { createRedisConnection } from './lib/redis.js';
import { Queue, Worker } from 'bullmq';
import { processSeoJob, type SeoJobData } from './workers/seo-pipeline.js';
import { processAgentStandaloneJob, type AgentStandaloneJobData } from './workers/agent-standalone.js';
import { processAgentChainJob, type AgentChainJobData } from './workers/agent-chain.js';
import { processAgentTeamJob, type AgentTeamJobData } from './workers/agent-team.js';
import { processPageForgeJob, type PageForgeJobData } from './workers/worker-pageforge.js';
import { startGateWatcher } from './watchers/gate-watcher.js';
import { startPageForgeGateWatcher } from './watchers/pageforge-gate-watcher.js';
import { startAgentConfirmationWatcher } from './watchers/agent-confirmation-watcher.js';
import { PHASE_ORDER } from './shared/seo-pipeline.js';
import { PAGEFORGE_PHASE_ORDER } from './shared/pageforge-pipeline.js';

// === BullMQ Setup ===

const connection = createRedisConnection();

// SEO Pipeline
const seoQueue = new Queue<SeoJobData>('seo-pipeline', { connection });
const seoWorker = new Worker<SeoJobData>('seo-pipeline', processSeoJob, {
  connection: createRedisConnection(),
  concurrency: config.workerConcurrency,
});

// Agent Standalone
const agentQueue = new Queue<AgentStandaloneJobData>('agent-standalone', { connection });
const agentWorker = new Worker<AgentStandaloneJobData>('agent-standalone', processAgentStandaloneJob, {
  connection: createRedisConnection(),
  concurrency: 2,
});

// Agent Chain
const chainQueue = new Queue<AgentChainJobData>('agent-chain', { connection });
const chainWorker = new Worker<AgentChainJobData>('agent-chain', processAgentChainJob, {
  connection: createRedisConnection(),
  concurrency: 1,
});

// Agent Team
const teamQueue = new Queue<AgentTeamJobData>('agent-team', { connection });
const teamWorker = new Worker<AgentTeamJobData>('agent-team', processAgentTeamJob, {
  connection: createRedisConnection(),
  concurrency: 2,
});

// PageForge
const pageforgeQueue = new Queue<PageForgeJobData>('pageforge', { connection });
const pageforgeWorker = new Worker<PageForgeJobData>('pageforge', processPageForgeJob, {
  connection: createRedisConnection(),
  concurrency: 1,
});

// Worker event handlers
seoWorker.on('completed', (job) => console.log(`[bullmq] SEO job ${job.id} completed`));
seoWorker.on('failed', (job, error) => console.error(`[bullmq] SEO job ${job?.id} failed:`, error.message));

agentWorker.on('completed', (job) => console.log(`[bullmq] Agent job ${job.id} completed`));
agentWorker.on('failed', (job, error) => console.error(`[bullmq] Agent job ${job?.id} failed:`, error.message));

chainWorker.on('completed', (job) => console.log(`[bullmq] Chain job ${job.id} completed`));
chainWorker.on('failed', (job, error) => console.error(`[bullmq] Chain job ${job?.id} failed:`, error.message));

teamWorker.on('completed', (job) => console.log(`[bullmq] Team job ${job.id} completed`));
teamWorker.on('failed', (job, error) => console.error(`[bullmq] Team job ${job?.id} failed:`, error.message));

pageforgeWorker.on('completed', (job) => console.log(`[bullmq] PageForge job ${job.id} completed`));
pageforgeWorker.on('failed', (job, error) => console.error(`[bullmq] PageForge job ${job?.id} failed:`, error.message));

// === Supabase Realtime: New job detection ===

supabase
  .channel('vps-new-jobs')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'vps_jobs',
    },
    async (payload) => {
      const job = payload.new as Record<string, unknown>;
      if (job.status !== 'pending') return;

      const jobType = job.job_type as string;
      const jobPayload = job.payload as Record<string, unknown> | null;
      const jobId = job.id as string;

      if (jobType === 'seo') {
        // SEO pipeline job
        const pipelineRunId = jobPayload?.pipeline_run_id as string | undefined;
        if (pipelineRunId) {
          await seoQueue.add('seo-run', {
            vps_job_id: jobId,
            pipeline_run_id: pipelineRunId,
            resume_from_phase: (jobPayload?.resume_from_phase as number) || 0,
          }, {
            attempts: 2,
            backoff: { type: 'exponential', delay: 30000 },
          });
          console.log(`[realtime] Enqueued seo job ${jobId} -> run ${pipelineRunId}`);
        } else {
          console.warn(`[realtime] No pipeline_run_id in payload for seo job ${jobId}`);
        }
      } else if (jobType === 'agent') {
        // Standalone agent job
        const skillId = jobPayload?.skill_id as string | undefined;
        if (skillId) {
          await agentQueue.add('agent-run', {
            vps_job_id: jobId,
            skill_id: skillId,
            board_id: jobPayload?.board_id as string | undefined,
            user_id: jobPayload?.user_id as string || '',
            input_message: jobPayload?.input_message as string || '',
            max_iterations: jobPayload?.max_iterations as number | undefined,
          }, {
            attempts: 2,
            backoff: { type: 'exponential', delay: 30000 },
          });
          console.log(`[realtime] Enqueued agent job ${jobId}, skill ${skillId}`);
        } else {
          console.warn(`[realtime] No skill_id in payload for agent job ${jobId}`);
        }
      } else if (jobType === 'agent_chain') {
        // Chain agent job
        const targetSlug = jobPayload?.target_skill_slug as string | undefined;
        if (targetSlug) {
          await chainQueue.add('chain-run', {
            vps_job_id: jobId,
            target_skill_slug: targetSlug,
            board_id: jobPayload?.board_id as string | undefined,
            user_id: jobPayload?.user_id as string || '',
            input_prompt: jobPayload?.input_prompt as string || '',
          }, {
            attempts: 2,
            backoff: { type: 'exponential', delay: 30000 },
          });
          console.log(`[realtime] Enqueued chain job ${jobId}, target ${targetSlug}`);
        } else {
          console.warn(`[realtime] No target_skill_slug in payload for chain job ${jobId}`);
        }
      } else if (jobType === 'agent_team') {
        // Team pipeline job
        const teamRunId = jobPayload?.team_run_id as string | undefined;
        if (teamRunId) {
          await teamQueue.add('team-run', {
            vps_job_id: jobId,
            team_run_id: teamRunId,
            resume_from_phase: (jobPayload?.resume_from_phase as number) || 0,
          }, {
            attempts: 2,
            backoff: { type: 'exponential', delay: 30000 },
          });
          console.log(`[realtime] Enqueued team job ${jobId}, run ${teamRunId}`);
        } else {
          console.warn(`[realtime] No team_run_id in payload for team job ${jobId}`);
        }
      } else if (jobType === 'pipeline:pageforge') {
        const buildId = jobPayload?.build_id as string | undefined;
        if (buildId) {
          await pageforgeQueue.add('pageforge-run', {
            vps_job_id: jobId,
            build_id: buildId,
            resume_from_phase: (jobPayload?.resume_from_phase as number) || 0,
          }, {
            attempts: 2,
            backoff: { type: 'exponential', delay: 30000 },
          });
          console.log(`[realtime] Enqueued pageforge job ${jobId} -> build ${buildId}`);
        } else {
          console.warn(`[realtime] No build_id in payload for pageforge job ${jobId}`);
        }
      }

      // Mark as queued
      await supabase
        .from('vps_jobs')
        .update({ status: 'queued' })
        .eq('id', jobId);
    }
  )
  .subscribe((status) => {
    console.log(`[realtime] Job watcher subscription: ${status}`);
  });

// === Watchers ===

startGateWatcher(seoQueue);
startPageForgeGateWatcher(pageforgeQueue);
startAgentConfirmationWatcher(agentQueue);

// === Startup Recovery ===

async function recoverOrphanedJobs(): Promise<void> {
  // Recover pending/queued SEO jobs
  const { data: pendingSeoJobs } = await supabase
    .from('vps_jobs')
    .select('id, job_type, payload')
    .in('status', ['pending', 'queued'])
    .eq('job_type', 'seo');

  if (pendingSeoJobs?.length) {
    console.log(`[recovery] Found ${pendingSeoJobs.length} orphaned SEO jobs`);
    for (const job of pendingSeoJobs) {
      const jobPayload = job.payload as Record<string, unknown> | null;
      const pipelineRunId = jobPayload?.pipeline_run_id as string | undefined;
      if (pipelineRunId) {
        await seoQueue.add('seo-recover', {
          vps_job_id: job.id,
          pipeline_run_id: pipelineRunId,
          resume_from_phase: (jobPayload?.resume_from_phase as number) || 0,
        });
        console.log(`[recovery] Re-enqueued SEO job ${job.id}`);
      }
    }
  }

  // Recover pending/queued agent jobs
  const { data: pendingAgentJobs } = await supabase
    .from('vps_jobs')
    .select('id, job_type, payload')
    .in('status', ['pending', 'queued'])
    .in('job_type', ['agent', 'agent_chain']);

  if (pendingAgentJobs?.length) {
    console.log(`[recovery] Found ${pendingAgentJobs.length} orphaned agent jobs`);
    for (const job of pendingAgentJobs) {
      const jobPayload = job.payload as Record<string, unknown> | null;
      if (job.job_type === 'agent') {
        const skillId = jobPayload?.skill_id as string;
        if (skillId) {
          await agentQueue.add('agent-recover', {
            vps_job_id: job.id,
            skill_id: skillId,
            board_id: jobPayload?.board_id as string | undefined,
            user_id: jobPayload?.user_id as string || '',
            input_message: jobPayload?.input_message as string || '',
          });
          console.log(`[recovery] Re-enqueued agent job ${job.id}`);
        }
      } else if (job.job_type === 'agent_chain') {
        const targetSlug = jobPayload?.target_skill_slug as string;
        if (targetSlug) {
          await chainQueue.add('chain-recover', {
            vps_job_id: job.id,
            target_skill_slug: targetSlug,
            board_id: jobPayload?.board_id as string | undefined,
            user_id: jobPayload?.user_id as string || '',
            input_prompt: jobPayload?.input_prompt as string || '',
          });
          console.log(`[recovery] Re-enqueued chain job ${job.id}`);
        }
      }
    }
  }

  // Recover paused SEO jobs with gate decisions
  const { data: pausedSeoJobs } = await supabase
    .from('vps_jobs')
    .select('id, payload')
    .eq('status', 'paused')
    .eq('job_type', 'seo');

  if (pausedSeoJobs?.length) {
    for (const job of pausedSeoJobs) {
      const jobPayload = job.payload as Record<string, unknown> | null;
      const pipelineRunId = jobPayload?.pipeline_run_id as string | undefined;
      if (!pipelineRunId) continue;

      const { data: run } = await supabase
        .from('seo_pipeline_runs')
        .select('id, status, gate1_decision, gate2_decision, current_phase')
        .eq('id', pipelineRunId)
        .single();

      if (!run) continue;

      if (run.status === 'awaiting_approval_1' && run.gate1_decision === 'approve') {
        const nextPhase = PHASE_ORDER.indexOf('gate1') + 1;
        await seoQueue.add('seo-recover-gate', {
          vps_job_id: job.id,
          pipeline_run_id: run.id,
          resume_from_phase: nextPhase,
        });
        console.log(`[recovery] Resuming SEO job ${job.id} after gate1 approval`);
      }

      if (run.status === 'awaiting_approval_2' && run.gate2_decision === 'approve') {
        await supabase.from('vps_jobs').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        }).eq('id', job.id);
        console.log(`[recovery] SEO job ${job.id} gate2 approved - marked complete`);
      }

      if (run.gate1_decision === 'revise' && run.status === 'writing') {
        await seoQueue.add('seo-recover-revise', {
          vps_job_id: job.id,
          pipeline_run_id: run.id,
          resume_from_phase: PHASE_ORDER.indexOf('writing'),
        });
        console.log(`[recovery] Resuming SEO job ${job.id} for gate1 revision`);
      }
    }
  }

  // Recover pending/queued PageForge jobs
  const { data: pendingPageforgeJobs } = await supabase
    .from('vps_jobs')
    .select('id, job_type, payload')
    .in('status', ['pending', 'queued'])
    .eq('job_type', 'pipeline:pageforge');

  if (pendingPageforgeJobs?.length) {
    console.log(`[recovery] Found ${pendingPageforgeJobs.length} orphaned PageForge jobs`);
    for (const job of pendingPageforgeJobs) {
      const jobPayload = job.payload as Record<string, unknown> | null;
      const buildId = jobPayload?.build_id as string | undefined;
      if (buildId) {
        await pageforgeQueue.add('pageforge-recover', {
          vps_job_id: job.id,
          build_id: buildId,
          resume_from_phase: (jobPayload?.resume_from_phase as number) || 0,
        });
        console.log(`[recovery] Re-enqueued PageForge job ${job.id}`);
      }
    }
  }

  // Recover paused PageForge jobs with gate decisions
  const { data: pausedPageforgeJobs } = await supabase
    .from('vps_jobs')
    .select('id, payload')
    .eq('status', 'paused')
    .eq('job_type', 'pipeline:pageforge');

  if (pausedPageforgeJobs?.length) {
    for (const job of pausedPageforgeJobs) {
      const jobPayload = job.payload as Record<string, unknown> | null;
      const buildId = jobPayload?.build_id as string | undefined;
      if (!buildId) continue;

      const { data: build } = await supabase
        .from('pageforge_builds')
        .select('id, status, dev_gate_decision, am_gate_decision, current_phase')
        .eq('id', buildId)
        .single();

      if (!build) continue;

      // Dev gate approved - resume from next phase
      if (build.status === 'developer_review_gate' && build.dev_gate_decision === 'approve') {
        const nextPhase = PAGEFORGE_PHASE_ORDER.indexOf('developer_review_gate') + 1;
        await pageforgeQueue.add('pageforge-recover-gate', {
          vps_job_id: job.id,
          build_id: buildId,
          resume_from_phase: nextPhase,
        });
        console.log(`[recovery] Resuming PageForge job ${job.id} after dev gate approval`);
      }

      // AM gate approved - mark complete
      if (build.status === 'am_signoff_gate' && build.am_gate_decision === 'approve') {
        await supabase.from('vps_jobs').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        }).eq('id', job.id);
        console.log(`[recovery] PageForge job ${job.id} AM approved - marked complete`);
      }

      // Dev gate revision - restart from markup_generation
      if (build.dev_gate_decision === 'revise') {
        await pageforgeQueue.add('pageforge-recover-revise', {
          vps_job_id: job.id,
          build_id: buildId,
          resume_from_phase: PAGEFORGE_PHASE_ORDER.indexOf('markup_generation'),
        });
        console.log(`[recovery] Resuming PageForge job ${job.id} for dev gate revision`);
      }
    }
  }
}

recoverOrphanedJobs().catch((err) => {
  console.error('[recovery] Failed:', err.message);
});

// === Periodic Orphan Recovery ===
// Catches jobs that realtime missed (race conditions, dropped subscriptions)
// Scaling schedule: 60s for first 10m, 5m until 6h, 15m until 24h, then hourly

const ORPHAN_POLL_START = Date.now();
let orphanPollTimer: ReturnType<typeof setTimeout> | null = null;

function getOrphanPollInterval(): number {
  const elapsedMs = Date.now() - ORPHAN_POLL_START;
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  if (elapsedHours >= 24) return 60 * 60 * 1000;   // hourly
  if (elapsedHours >= 6) return 15 * 60 * 1000;     // every 15m
  const elapsedMin = elapsedMs / (1000 * 60);
  if (elapsedMin >= 10) return 5 * 60 * 1000;       // every 5m
  return 60 * 1000;                                  // every 60s
}

async function pollOrphanedJobs(): Promise<void> {
  try {
    // Find jobs stuck in pending/queued that aren't in BullMQ
    const { data: stuckJobs } = await supabase
      .from('vps_jobs')
      .select('id, job_type, payload, status, created_at')
      .in('status', ['pending', 'queued'])
      .order('created_at', { ascending: true })
      .limit(20);

    if (!stuckJobs?.length) return;

    // Only recover jobs older than 30 seconds (give realtime a chance first)
    const cutoff = new Date(Date.now() - 30_000).toISOString();
    const orphans = stuckJobs.filter((j) => j.created_at < cutoff);
    if (!orphans.length) return;

    console.log(`[orphan-poll] Found ${orphans.length} stuck jobs, re-enqueuing...`);

    for (const job of orphans) {
      const p = job.payload as Record<string, unknown> | null;

      if (job.job_type === 'pipeline:pageforge') {
        const buildId = p?.build_id as string | undefined;
        if (buildId) {
          await pageforgeQueue.add('pageforge-orphan-recover', {
            vps_job_id: job.id,
            build_id: buildId,
            resume_from_phase: (p?.resume_from_phase as number) || 0,
          }, { attempts: 2, backoff: { type: 'exponential', delay: 30000 } });
          console.log(`[orphan-poll] Re-enqueued PageForge ${job.id}`);
        }
      } else if (job.job_type === 'seo') {
        const runId = p?.pipeline_run_id as string | undefined;
        if (runId) {
          await seoQueue.add('seo-orphan-recover', {
            vps_job_id: job.id,
            pipeline_run_id: runId,
            resume_from_phase: (p?.resume_from_phase as number) || 0,
          });
          console.log(`[orphan-poll] Re-enqueued SEO ${job.id}`);
        }
      } else if (job.job_type === 'agent') {
        const skillId = p?.skill_id as string | undefined;
        if (skillId) {
          await agentQueue.add('agent-orphan-recover', {
            vps_job_id: job.id,
            skill_id: skillId,
            board_id: p?.board_id as string | undefined,
            user_id: (p?.user_id as string) || '',
            input_message: (p?.input_message as string) || '',
          });
          console.log(`[orphan-poll] Re-enqueued agent ${job.id}`);
        }
      } else if (job.job_type === 'agent_chain') {
        const slug = p?.target_skill_slug as string | undefined;
        if (slug) {
          await chainQueue.add('chain-orphan-recover', {
            vps_job_id: job.id,
            target_skill_slug: slug,
            board_id: p?.board_id as string | undefined,
            user_id: (p?.user_id as string) || '',
            input_prompt: (p?.input_prompt as string) || '',
          });
          console.log(`[orphan-poll] Re-enqueued chain ${job.id}`);
        }
      } else if (job.job_type === 'agent_team') {
        const teamRunId = p?.team_run_id as string | undefined;
        if (teamRunId) {
          await teamQueue.add('team-orphan-recover', {
            vps_job_id: job.id,
            team_run_id: teamRunId,
            resume_from_phase: (p?.resume_from_phase as number) || 0,
          });
          console.log(`[orphan-poll] Re-enqueued team ${job.id}`);
        }
      }

      // Mark as queued so we don't re-enqueue next poll
      await supabase
        .from('vps_jobs')
        .update({ status: 'queued' })
        .eq('id', job.id);
    }
  } catch (err: any) {
    console.error('[orphan-poll] Error:', err.message);
  }

  // Schedule next poll with adaptive interval
  orphanPollTimer = setTimeout(pollOrphanedJobs, getOrphanPollInterval());
}

// Start first poll after 30s (let startup recovery finish first)
orphanPollTimer = setTimeout(pollOrphanedJobs, 30_000);

// === Graceful Shutdown ===

async function shutdown(signal: string): Promise<void> {
  console.log(`[shutdown] ${signal} received, closing workers...`);
  if (orphanPollTimer) clearTimeout(orphanPollTimer);
  await Promise.all([
    seoWorker.close(),
    agentWorker.close(),
    chainWorker.close(),
    teamWorker.close(),
    pageforgeWorker.close(),
  ]);
  connection.disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// === Startup Banner ===

console.log('[km-worker] Started successfully');
console.log(`[km-worker] Redis: ${config.redisUrl}`);
console.log(`[km-worker] Supabase: ${config.supabaseUrl}`);
console.log(`[km-worker] Workers: SEO (${config.workerConcurrency}), Agent (2), Chain (1), Team (2), PageForge (1)`);
