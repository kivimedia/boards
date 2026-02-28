import { Queue } from 'bullmq';
import { supabase } from '../lib/supabase.js';
import type { AgentStandaloneJobData } from '../workers/agent-standalone.js';

// ============================================================================
// AGENT CONFIRMATION WATCHER
// Mirrors gate-watcher.ts pattern for agent tool confirmations
// Watches vps_jobs for confirmation_decision set on paused agent jobs
// ============================================================================

const processedConfirmations = new Set<string>();

export function startAgentConfirmationWatcher(
  agentQueue: Queue<AgentStandaloneJobData>
): void {
  console.log('[agent-confirm-watcher] Starting agent confirmation watcher...');

  supabase
    .channel('agent-confirmation-decisions')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'vps_jobs',
      },
      async (payload) => {
        const newRow = payload.new as Record<string, unknown>;
        const oldRow = payload.old as Record<string, unknown>;

        // Only handle agent jobs that are paused
        if (newRow.job_type !== 'agent') return;
        if (newRow.status !== 'paused') return;

        const jobId = newRow.id as string;
        const progressData = newRow.progress_data as Record<string, unknown> | null;
        const oldProgressData = oldRow.progress_data as Record<string, unknown> | null;

        if (!progressData?.confirmation_needed) return;

        // Detect confirmation_decision being set
        const newDecision = progressData.confirmation_decision as string | undefined;
        const oldDecision = oldProgressData?.confirmation_decision as string | undefined;

        if (!newDecision || newDecision === oldDecision) return;

        const dedupeKey = `${jobId}:${newDecision}:${Date.now()}`;
        if (processedConfirmations.has(dedupeKey)) return;
        processedConfirmations.add(dedupeKey);

        // Clean up old entries from dedup set
        if (processedConfirmations.size > 100) {
          const entries = Array.from(processedConfirmations);
          for (let i = 0; i < entries.length - 50; i++) {
            processedConfirmations.delete(entries[i]);
          }
        }

        console.log(`[agent-confirm-watcher] Confirmation decision: ${newDecision} for job ${jobId}`);

        const pendingTool = progressData.pending_tool as { id: string; name: string; input: Record<string, unknown> } | undefined;
        const messageHistory = progressData.message_history as any[] | undefined;
        const jobPayload = newRow.payload as Record<string, unknown> | null;

        if (!pendingTool || !messageHistory || !jobPayload) {
          console.warn(`[agent-confirm-watcher] Missing resume data for job ${jobId}`);
          return;
        }

        // Re-enqueue with resume data
        await agentQueue.add('agent-resume', {
          vps_job_id: jobId,
          skill_id: jobPayload.skill_id as string,
          board_id: jobPayload.board_id as string | undefined,
          user_id: jobPayload.user_id as string,
          input_message: jobPayload.input_message as string,
          max_iterations: jobPayload.max_iterations as number | undefined,
          // Resume fields
          resume: true,
          message_history: messageHistory,
          pending_tool: pendingTool,
          confirmation_decision: newDecision as 'approve' | 'reject',
        }, {
          attempts: 2,
          backoff: { type: 'exponential', delay: 30000 },
        });

        // Clear the confirmation state so it doesn't re-trigger
        await supabase
          .from('vps_jobs')
          .update({
            status: 'queued',
            progress_data: {
              ...progressData,
              confirmation_needed: false,
              confirmation_decision: undefined,
            },
          })
          .eq('id', jobId);

        console.log(`[agent-confirm-watcher] Re-enqueued job ${jobId} for ${newDecision}`);
      }
    )
    .subscribe((status) => {
      console.log(`[agent-confirm-watcher] Subscription status: ${status}`);
    });
}
