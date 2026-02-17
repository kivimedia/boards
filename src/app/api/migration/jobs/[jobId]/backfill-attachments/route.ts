import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { backfillAttachments } from '@/lib/trello-migration';

interface Params {
  params: { jobId: string };
}

/**
 * POST /api/migration/jobs/[jobId]/backfill-attachments
 * Downloads and imports attachments for an already-completed migration job.
 * Uses a streaming response with heartbeats to keep the connection alive.
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

  if (!['completed', 'failed'].includes(job.status)) {
    return errorResponse(`Cannot backfill a job with status "${job.status}". Job must be completed or failed.`);
  }

  // Use a streaming response with heartbeats to prevent Vercel from killing it
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"started":true}\n\n'));

      // Send heartbeats every 25 seconds to keep the connection alive.
      // Vercel kills idle connections after ~30s, so this prevents that.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`data: {"heartbeat":true,"ts":${Date.now()}}\n\n`));
        } catch {
          // Controller may have closed
          clearInterval(heartbeat);
        }
      }, 25000);

      try {
        await backfillAttachments(supabase, jobId, job.config, userId);
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

// Vercel Pro max is 300s. Migration already complete; kept for reruns.
export const maxDuration = 300;
