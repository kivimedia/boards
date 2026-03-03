import { NextRequest } from 'next/server';
import { getAuthContext } from '@/lib/api-helpers';
import { enrichBatch, getApiKeys } from '@/lib/outreach/enrichment-cascade';
import { qualifyBatch } from '@/lib/outreach/qualifier';
import { researchLeadBatch } from '@/lib/outreach/web-researcher';
import { personalizeMessageBatch } from '@/lib/outreach/message-personalizer';
import type { LIJobType, OrchestratorCallbacks } from '@/lib/types';

export const maxDuration = 300;

/**
 * POST /api/outreach/jobs/stream - SSE streaming for real-time job progress
 *
 * Used for user-initiated operations that need real-time feedback:
 * import, enrichment, research, message personalization
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: { job_type: LIJobType; payload: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Stream closed
        }
      };

      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        send('heartbeat', { ts: Date.now() });
      }, 15000);

      const callbacks: OrchestratorCallbacks = {
        onProgress: (message) => send('progress', { message }),
        onStepData: (data) => send('step_data', data),
        onCostEvent: (event) => send('cost', event),
      };

      try {
        send('progress', { message: `Starting ${body.job_type}...` });

        let result: Record<string, unknown> = {};

        switch (body.job_type) {
          case 'SCOUT_ENRICH': {
            const leadIds = body.payload.lead_ids as string[];
            if (!leadIds?.length) throw new Error('No lead_ids in payload');
            const apiKeys = await getApiKeys(supabase);
            result = await enrichBatch(supabase, userId, leadIds, apiKeys) as unknown as Record<string, unknown>;
            break;
          }

          case 'QUALIFY': {
            const leadIds = body.payload.lead_ids as string[];
            if (!leadIds?.length) throw new Error('No lead_ids in payload');
            result = await qualifyBatch(supabase, userId, leadIds);
            break;
          }

          case 'WEB_RESEARCH': {
            const leadIds = body.payload.lead_ids as string[];
            if (!leadIds?.length) throw new Error('No lead_ids in payload');
            result = await researchLeadBatch(supabase, userId, {
              lead_ids: leadIds,
              deadline_ms: 270_000,
            }, callbacks);
            break;
          }

          case 'PERSONALIZE_MESSAGE': {
            const leadIds = body.payload.lead_ids as string[];
            if (!leadIds?.length) throw new Error('No lead_ids in payload');
            result = await personalizeMessageBatch(supabase, userId, {
              lead_ids: leadIds,
            }, callbacks);
            break;
          }

          default:
            throw new Error(`Job type ${body.job_type} does not support streaming. Use the jobs API instead.`);
        }

        send('complete', result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        send('error', { error: msg });
      } finally {
        clearInterval(heartbeat);
        send('done', {});
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
