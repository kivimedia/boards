import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { runBoardMigration } from '@/lib/trello-migration';

interface Params {
  params: { jobId: string };
}

/**
 * POST /api/migration/jobs/[jobId]/run-board
 * Run a single board migration (child job). SSE stream with heartbeat.
 * The jobId must be a child job (has parent_job_id).
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { jobId } = params;

  const { data: job, error: fetchError } = await supabase
    .from('migration_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (fetchError || !job) return errorResponse('Child job not found', 404);
  if (!job.parent_job_id) return errorResponse('This endpoint is only for child jobs (must have parent_job_id)');
  if (job.status !== 'pending') {
    return errorResponse(`Cannot start a job with status "${job.status}". Job must be pending.`);
  }
  if (!job.trello_board_id) return errorResponse('Child job missing trello_board_id');

  // 270s deadline (30s buffer before Vercel 300s limit)
  const deadline = Date.now() + 270_000;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"started":true}\n\n'));

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          // Stream already closed
        }
      }, 30000);

      try {
        const result = await runBoardMigration(
          supabase,
          jobId,
          job.parent_job_id,
          job.config,
          job.trello_board_id,
          userId,
          deadline
        );
        if (result.needs_resume) {
          controller.enqueue(encoder.encode('data: {"needs_resume":true}\n\n'));
        } else {
          controller.enqueue(encoder.encode('data: {"completed":true}\n\n'));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(`data: {"error":"${msg.replace(/"/g, '\\"')}"}\n\n`));
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

export const maxDuration = 300;
