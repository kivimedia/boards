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
 * Supports auto-resume: if the migration hits the Vercel timeout deadline,
 * it saves progress and returns `needs_resume: true`. The client detects
 * this and automatically fires another /run call.
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

  // Deadline: 270s from now (leaving 30s buffer before Vercel's 300s hard limit)
  const deadline = Date.now() + 270_000;

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
        const result = await runMigration(supabase, jobId, job.config, userId, deadline);
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

// Vercel Pro max is 300s. We use 270s deadline with 30s buffer.
export const maxDuration = 300;
