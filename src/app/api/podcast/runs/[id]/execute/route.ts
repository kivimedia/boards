import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { runScoutAgent } from '@/lib/ai/podcast-scout';
import { runOutreachAgent } from '@/lib/ai/podcast-outreach';

export const maxDuration = 300; // 5 minutes for agent runs

type Params = { params: { id: string } };

/**
 * POST /api/podcast/runs/[id]/execute
 * Execute a podcast agent run (scout or outreach) with SSE streaming.
 *
 * The run must already exist (created via POST /api/podcast/runs).
 * This endpoint triggers the actual LLM execution and streams progress.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // Load the run
  const { data: run, error: runError } = await supabase
    .from('pga_agent_runs')
    .select('*')
    .eq('id', params.id)
    .single();

  if (runError || !run) {
    return errorResponse('Run not found', 404);
  }

  if (run.status !== 'running') {
    return errorResponse(`Run is ${run.status}, not running`, 409);
  }

  // Parse optional body params
  const body = await request.json().catch(() => ({}));

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: string) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          // Stream may have been closed by client
        }
      };

      // Heartbeat to keep serverless alive
      const heartbeat = setInterval(() => {
        send('heartbeat', JSON.stringify({ ts: Date.now() }));
      }, 15000);

      try {
        if (run.agent_type === 'scout') {
          await runScoutAgent(
            supabase,
            {
              runId: params.id,
              userId,
              query: body.query,
              maxCandidates: body.max_candidates,
            },
            {
              onToken: (text) => {
                send('token', JSON.stringify({ text }));
              },
              onCandidateFound: (candidate) => {
                send('candidate', JSON.stringify({
                  name: candidate.name,
                  one_liner: candidate.one_liner,
                  confidence: candidate.scout_confidence,
                  tools: candidate.tools_used,
                }));
              },
              onProgress: (message) => {
                send('progress', JSON.stringify({ message }));
              },
              onComplete: (result) => {
                send('complete', JSON.stringify(result));
              },
              onError: (error) => {
                send('error', JSON.stringify({ error }));
              },
            }
          );
        } else if (run.agent_type === 'outreach') {
          await runOutreachAgent(
            supabase,
            {
              runId: params.id,
              userId,
              candidateIds: body.candidate_ids,
              maxCandidates: body.max_candidates,
            },
            {
              onToken: (text) => {
                send('token', JSON.stringify({ text }));
              },
              onSequenceCreated: (candidateName, emailCount) => {
                send('sequence', JSON.stringify({
                  candidate_name: candidateName,
                  email_count: emailCount,
                }));
              },
              onProgress: (message) => {
                send('progress', JSON.stringify({ message }));
              },
              onComplete: (result) => {
                send('complete', JSON.stringify(result));
              },
              onError: (error) => {
                send('error', JSON.stringify({ error }));
              },
            }
          );
        } else {
          send('error', JSON.stringify({ error: `Unknown agent type: ${run.agent_type}` }));
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
