import { Queue } from 'bullmq';
import { supabase } from '../lib/supabase.js';
import { updateJobProgress } from '../lib/job-reporter.js';
import { PAGEFORGE_PHASE_ORDER } from '../shared/pageforge-pipeline.js';
import type { PageForgeJobData } from '../workers/worker-pageforge.js';

// Dedup set to prevent double-enqueue from multiple Realtime events
const processedGates = new Set<string>();

export function startPageForgeGateWatcher(pageforgeQueue: Queue<PageForgeJobData>): void {
  console.log('[pageforge-gate-watcher] Starting gate decision watcher...');

  supabase
    .channel('pageforge-gate-decisions')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'pageforge_builds',
      },
      async (payload) => {
        const newRow = payload.new as Record<string, unknown>;
        const oldRow = payload.old as Record<string, unknown>;

        const buildId = newRow.id as string;

        // Detect dev gate decision change
        if (!oldRow.dev_gate_decision && newRow.dev_gate_decision) {
          const key = `${buildId}:dev:${newRow.dev_gate_decision}`;
          if (processedGates.has(key)) return;
          processedGates.add(key);
          await handleGateDecision(
            pageforgeQueue, newRow, 'developer_review_gate',
            newRow.dev_gate_decision as string
          );
        }

        // Detect AM gate decision change
        if (!oldRow.am_gate_decision && newRow.am_gate_decision) {
          const key = `${buildId}:am:${newRow.am_gate_decision}`;
          if (processedGates.has(key)) return;
          processedGates.add(key);
          await handleGateDecision(
            pageforgeQueue, newRow, 'am_signoff_gate',
            newRow.am_gate_decision as string
          );
        }
      }
    )
    .subscribe((status) => {
      console.log(`[pageforge-gate-watcher] Subscription status: ${status}`);
    });
}

async function handleGateDecision(
  pageforgeQueue: Queue<PageForgeJobData>,
  build: Record<string, unknown>,
  gate: string,
  decision: string
): Promise<void> {
  const buildId = build.id as string;

  console.log(`[pageforge-gate-watcher] ${gate} decision: ${decision} for build ${buildId}`);

  // Look up the vps_job
  const { data: vpsJob } = await supabase
    .from('vps_jobs')
    .select('id')
    .eq('job_type', 'pipeline:pageforge')
    .filter('payload->>build_id', 'eq', buildId)
    .single();

  const vpsJobId = vpsJob?.id as string | undefined;

  if (!vpsJobId) {
    console.warn(`[pageforge-gate-watcher] No vps_job found for build ${buildId}`);
    return;
  }

  if (decision === 'approve') {
    const gateIndex = PAGEFORGE_PHASE_ORDER.indexOf(gate);
    const nextPhaseIndex = gateIndex + 1;

    if (nextPhaseIndex >= PAGEFORGE_PHASE_ORDER.length) {
      // AM gate approve = done
      await updateJobProgress(vpsJobId, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress_message: 'Build published successfully',
      });
      console.log(`[pageforge-gate-watcher] Build ${buildId} published (AM approved)`);
      return;
    }

    // Re-enqueue for next phase
    await pageforgeQueue.add('pageforge-resume', {
      vps_job_id: vpsJobId,
      build_id: buildId,
      resume_from_phase: nextPhaseIndex,
    }, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 30000 },
    });

    await updateJobProgress(vpsJobId, {
      status: 'running',
      progress_message: `Resuming after ${gate.replace(/_/g, ' ')} approval`,
    });

    console.log(`[pageforge-gate-watcher] Re-enqueued build ${buildId} from phase ${nextPhaseIndex}`);

  } else if (decision === 'revise') {
    const revisePhase = gate === 'developer_review_gate' ? 'markup_generation' : 'vqa_capture';
    const reviseIndex = PAGEFORGE_PHASE_ORDER.indexOf(revisePhase);

    await pageforgeQueue.add('pageforge-revise', {
      vps_job_id: vpsJobId,
      build_id: buildId,
      resume_from_phase: reviseIndex,
    }, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 30000 },
    });

    await updateJobProgress(vpsJobId, {
      status: 'running',
      progress_message: `Revision requested at ${gate.replace(/_/g, ' ')}, restarting from ${revisePhase}`,
    });

    console.log(`[pageforge-gate-watcher] Revision: build ${buildId} back to ${revisePhase}`);

  } else if (decision === 'cancel') {
    await updateJobProgress(vpsJobId, {
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      progress_message: `Cancelled at ${gate.replace(/_/g, ' ')}`,
    });

    console.log(`[pageforge-gate-watcher] Build ${buildId} cancelled at ${gate}`);
  }
}
