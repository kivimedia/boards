import { Queue } from 'bullmq';
import { supabase } from '../lib/supabase.js';
import { updateJobProgress } from '../lib/job-reporter.js';
import { PHASE_ORDER } from '../shared/seo-pipeline.js';
import type { SeoJobData } from '../workers/seo-pipeline.js';

// Dedup set to prevent double-enqueue from multiple Realtime events
const processedGates = new Set<string>();

export function startGateWatcher(seoQueue: Queue<SeoJobData>): void {
  console.log('[gate-watcher] Starting gate decision watcher...');

  supabase
    .channel('seo-gate-decisions')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'seo_pipeline_runs',
      },
      async (payload) => {
        const newRow = payload.new as Record<string, unknown>;
        const oldRow = payload.old as Record<string, unknown>;

        const runId = newRow.id as string;

        // Detect gate1 decision change
        if (!oldRow.gate1_decision && newRow.gate1_decision) {
          const key = `${runId}:gate1:${newRow.gate1_decision}`;
          if (processedGates.has(key)) return;
          processedGates.add(key);
          await handleGateDecision(seoQueue, newRow, 'gate1', newRow.gate1_decision as string);
        }

        // Detect gate2 decision change
        if (!oldRow.gate2_decision && newRow.gate2_decision) {
          const key = `${runId}:gate2:${newRow.gate2_decision}`;
          if (processedGates.has(key)) return;
          processedGates.add(key);
          await handleGateDecision(seoQueue, newRow, 'gate2', newRow.gate2_decision as string);
        }
      }
    )
    .subscribe((status) => {
      console.log(`[gate-watcher] Subscription status: ${status}`);
    });
}

async function handleGateDecision(
  seoQueue: Queue<SeoJobData>,
  run: Record<string, unknown>,
  gate: 'gate1' | 'gate2',
  decision: string
): Promise<void> {
  const runId = run.id as string;
  const vpsJobId = run.vps_job_id as string;

  console.log(`[gate-watcher] ${gate} decision: ${decision} for run ${runId}`);

  if (!vpsJobId) {
    console.warn(`[gate-watcher] No vps_job_id for run ${runId}, skipping`);
    return;
  }

  if (decision === 'approve') {
    const gateIndex = PHASE_ORDER.indexOf(gate);
    const nextPhaseIndex = gateIndex + 1;

    if (nextPhaseIndex >= PHASE_ORDER.length) {
      // gate2 approve means done - mark job complete
      await updateJobProgress(vpsJobId, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress_message: 'Pipeline published successfully',
      });
      console.log(`[gate-watcher] Run ${runId} published (gate2 approved)`);
      return;
    }

    // Re-enqueue for next phase
    await seoQueue.add('seo-resume', {
      vps_job_id: vpsJobId,
      pipeline_run_id: runId,
      resume_from_phase: nextPhaseIndex,
    }, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 30000 },
    });

    await updateJobProgress(vpsJobId, {
      status: 'running',
      progress_message: `Resuming after ${gate} approval`,
    });

    console.log(`[gate-watcher] Re-enqueued run ${runId} from phase ${nextPhaseIndex}`);

  } else if (decision === 'revise') {
    // Send back to earlier phase
    const revisePhase = gate === 'gate1' ? 'writing' : 'visual_qa';
    const reviseIndex = PHASE_ORDER.indexOf(revisePhase);

    await seoQueue.add('seo-revise', {
      vps_job_id: vpsJobId,
      pipeline_run_id: runId,
      resume_from_phase: reviseIndex,
    }, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 30000 },
    });

    await updateJobProgress(vpsJobId, {
      status: 'running',
      progress_message: `Revision requested at ${gate}, restarting from ${revisePhase}`,
    });

    console.log(`[gate-watcher] Revision: run ${runId} back to ${revisePhase}`);

  } else if (decision === 'scrap') {
    await updateJobProgress(vpsJobId, {
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      progress_message: `Scrapped at ${gate}`,
    });

    console.log(`[gate-watcher] Run ${runId} scrapped at ${gate}`);
  }
}
