import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { runLearningPipeline } from '@/lib/ai/proposal-learner';

export const maxDuration = 300;

export async function POST() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // Stream progress events via SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const progress of runLearningPipeline(supabase, userId)) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(progress)}\n\n`),
          );
        }
        controller.close();
      } catch (err) {
        console.error('[ProposalLearn] Pipeline error:', err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              step: 'error',
              current: 0,
              total: 0,
              message: err instanceof Error ? err.message : 'Pipeline failed',
            })}\n\n`,
          ),
        );
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
