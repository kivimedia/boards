import 'dotenv/config';
import { config } from './config.js';
import { supabase } from './lib/supabase.js';
import { createRedisConnection } from './lib/redis.js';
import { Queue, Worker } from 'bullmq';
import { processSeoJob, type SeoJobData } from './workers/seo-pipeline.js';
import { startGateWatcher } from './watchers/gate-watcher.js';
import { PHASE_ORDER } from './shared/seo-pipeline.js';

// === BullMQ Setup ===

const connection = createRedisConnection();
const seoQueue = new Queue<SeoJobData>('seo-pipeline', { connection });

const seoWorker = new Worker<SeoJobData>('seo-pipeline', processSeoJob, {
  connection: createRedisConnection(),
  concurrency: config.workerConcurrency,
});

seoWorker.on('completed', (job) => {
  console.log(`[bullmq] Job ${job.id} completed`);
});

seoWorker.on('failed', (job, error) => {
  console.error(`[bullmq] Job ${job?.id} failed:`, error.message);
});

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

      // Only process pending SEO jobs
      if (job.status !== 'pending' || job.job_type !== 'pipeline:seo') return;

      console.log(`[realtime] New SEO job detected: ${job.id}`);

      // Find the linked seo_pipeline_run
      const { data: run } = await supabase
        .from('seo_pipeline_runs')
        .select('id')
        .eq('vps_job_id', job.id as string)
        .single();

      if (run) {
        await seoQueue.add('seo-run', {
          vps_job_id: job.id as string,
          pipeline_run_id: run.id,
          resume_from_phase: 0,
        }, {
          attempts: 2,
          backoff: { type: 'exponential', delay: 30000 },
        });

        // Mark as queued
        await supabase
          .from('vps_jobs')
          .update({ status: 'queued' })
          .eq('id', job.id as string);

        console.log(`[realtime] Enqueued seo job ${job.id} -> run ${run.id}`);
      } else {
        console.warn(`[realtime] No pipeline run found for job ${job.id}`);
      }
    }
  )
  .subscribe((status) => {
    console.log(`[realtime] Job watcher subscription: ${status}`);
  });

// === Gate Watcher ===

startGateWatcher(seoQueue);

// === Startup Recovery ===

async function recoverOrphanedJobs(): Promise<void> {
  // Recover pending/queued jobs
  const { data: pendingJobs } = await supabase
    .from('vps_jobs')
    .select('id, job_type')
    .in('status', ['pending', 'queued'])
    .eq('job_type', 'pipeline:seo');

  if (pendingJobs?.length) {
    console.log(`[recovery] Found ${pendingJobs.length} orphaned pending/queued jobs`);
    for (const job of pendingJobs) {
      const { data: run } = await supabase
        .from('seo_pipeline_runs')
        .select('id, current_phase')
        .eq('vps_job_id', job.id)
        .single();
      if (run) {
        await seoQueue.add('seo-recover', {
          vps_job_id: job.id,
          pipeline_run_id: run.id,
          resume_from_phase: run.current_phase || 0,
        });
        console.log(`[recovery] Re-enqueued job ${job.id}`);
      }
    }
  }

  // Recover paused jobs with gate decisions
  const { data: pausedJobs } = await supabase
    .from('vps_jobs')
    .select('id')
    .eq('status', 'paused')
    .eq('job_type', 'pipeline:seo');

  if (pausedJobs?.length) {
    for (const job of pausedJobs) {
      const { data: run } = await supabase
        .from('seo_pipeline_runs')
        .select('id, status, gate1_decision, gate2_decision, current_phase')
        .eq('vps_job_id', job.id)
        .single();

      if (!run) continue;

      // If paused at gate1 but gate1 has a decision, resume
      if (run.status === 'awaiting_approval_1' && run.gate1_decision === 'approve') {
        const nextPhase = PHASE_ORDER.indexOf('gate1') + 1;
        await seoQueue.add('seo-recover-gate', {
          vps_job_id: job.id,
          pipeline_run_id: run.id,
          resume_from_phase: nextPhase,
        });
        console.log(`[recovery] Resuming job ${job.id} after gate1 approval`);
      }

      if (run.status === 'awaiting_approval_2' && run.gate2_decision === 'approve') {
        console.log(`[recovery] Job ${job.id} gate2 approved - marking complete`);
        await supabase.from('vps_jobs').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        }).eq('id', job.id);
      }

      // Handle revise decisions
      if (run.gate1_decision === 'revise' && run.status === 'writing') {
        await seoQueue.add('seo-recover-revise', {
          vps_job_id: job.id,
          pipeline_run_id: run.id,
          resume_from_phase: PHASE_ORDER.indexOf('writing'),
        });
        console.log(`[recovery] Resuming job ${job.id} for gate1 revision`);
      }
    }
  }
}

recoverOrphanedJobs().catch((err) => {
  console.error('[recovery] Failed:', err.message);
});

// === Graceful Shutdown ===

async function shutdown(signal: string): Promise<void> {
  console.log(`[shutdown] ${signal} received, closing workers...`);
  await seoWorker.close();
  connection.disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// === Startup Banner ===

console.log('[km-worker] Started successfully');
console.log(`[km-worker] Redis: ${config.redisUrl}`);
console.log(`[km-worker] Supabase: ${config.supabaseUrl}`);
console.log(`[km-worker] SEO worker concurrency: ${config.workerConcurrency}`);
