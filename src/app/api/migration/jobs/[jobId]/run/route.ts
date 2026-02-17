import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { runMigration } from '@/lib/trello-migration';

interface Params {
  params: { jobId: string };
}

/**
 * POST /api/migration/jobs/[jobId]/run
 * Start executing a migration job.
 * Uses a streaming response to keep the connection alive for the duration.
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

  if (fetchError || !job) return errorResponse('Migration job not found', 404);

  if (job.status !== 'pending') {
    return errorResponse(`Cannot start a job with status "${job.status}". Job must be pending.`);
  }

  // Use a streaming response to keep the function alive for the entire migration
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial message
      controller.enqueue(encoder.encode('data: {"started":true}\n\n'));

      // Send heartbeat every 30 seconds to keep the connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          // Stream already closed
        }
      }, 30000);

      try {
        await runMigration(supabase, jobId, job.config, userId);
        controller.enqueue(encoder.encode('data: {"completed":true}\n\n'));
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

// Allow long-running requests (up to 15 minutes for large migrations)
export const maxDuration = 900;
