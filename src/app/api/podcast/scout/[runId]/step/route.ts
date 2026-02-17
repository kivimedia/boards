import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import {
  runStep1LinkedInDiscovery,
  runStep2Enrichment,
  runStep3DeepResearch,
  runStep4SaveCandidates,
} from '@/lib/ai/scout-pipeline';
import type { ScoutConfig } from '@/lib/types';

export const maxDuration = 300; // 5 minutes per step

type Params = { params: { runId: string } };

/**
 * POST /api/podcast/scout/[runId]/step
 * Execute a specific step of the scout pipeline with SSE streaming.
 *
 * Body: { step: 1|2|3|4, config?: ScoutConfig, selected_indices?: number[] }
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // Load the run
  const { data: run, error: runError } = await supabase
    .from('pga_agent_runs')
    .select('*')
    .eq('id', params.runId)
    .single();

  if (runError || !run) {
    return errorResponse('Run not found', 404);
  }

  const body = await request.json().catch(() => ({}));
  const { step, config, selected_indices } = body as {
    step: number;
    config?: ScoutConfig;
    selected_indices?: number[];
  };

  if (!step || step < 1 || step > 4) {
    return errorResponse('step must be 1, 2, 3, or 4');
  }

  // Validate run state
  if (step === 1 && run.status !== 'running') {
    return errorResponse(`Run is ${run.status}, expected running for step 1`, 409);
  }
  if (step > 1 && run.status !== 'awaiting_input') {
    return errorResponse(`Run is ${run.status}, expected awaiting_input for step ${step}`, 409);
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: string) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          // Stream may have been closed
        }
      };

      // Heartbeat to keep serverless alive
      const heartbeat = setInterval(() => {
        send('heartbeat', JSON.stringify({ ts: Date.now() }));
      }, 15000);

      const callbacks = {
        onToken: (text: string) => send('token', JSON.stringify({ text })),
        onProgress: (message: string) => send('progress', JSON.stringify({ message })),
        onStepData: (data: unknown) => send('step_data', JSON.stringify(data)),
        onComplete: (result: unknown) => send('complete', JSON.stringify(result)),
        onError: (error: string) => send('error', JSON.stringify({ error })),
      };

      try {
        switch (step) {
          case 1:
            if (!config) {
              send('error', JSON.stringify({ error: 'config is required for step 1' }));
              break;
            }
            await runStep1LinkedInDiscovery(supabase, { runId: params.runId, userId, config }, callbacks);
            break;

          case 2:
            if (!selected_indices || selected_indices.length === 0) {
              send('error', JSON.stringify({ error: 'selected_indices required for step 2' }));
              break;
            }
            await runStep2Enrichment(supabase, { runId: params.runId, userId, selectedIndices: selected_indices }, callbacks);
            break;

          case 3:
            if (!selected_indices || selected_indices.length === 0) {
              send('error', JSON.stringify({ error: 'selected_indices required for step 3' }));
              break;
            }
            await runStep3DeepResearch(supabase, { runId: params.runId, userId, selectedIndices: selected_indices }, callbacks);
            break;

          case 4:
            if (!selected_indices || selected_indices.length === 0) {
              send('error', JSON.stringify({ error: 'selected_indices required for step 4' }));
              break;
            }
            await runStep4SaveCandidates(supabase, { runId: params.runId, userId, selectedIndices: selected_indices }, callbacks);
            break;

          default:
            send('error', JSON.stringify({ error: `Invalid step: ${step}` }));
        }
      } catch (err: any) {
        send('error', JSON.stringify({ error: err.message }));
      } finally {
        clearInterval(heartbeat);
        send('done', '{}');
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
