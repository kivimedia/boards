import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { buildResearchDossier, saveDossier, loadDossier } from '@/lib/ai/research-dossier';
import { validateDossier } from '@/lib/ai/dossier-validator';
import type { PGACandidate } from '@/lib/types';
import type { StepCallbacks } from '@/lib/ai/scout-pipeline';

export const maxDuration = 300; // 5 minutes for deep research

type Params = { params: { id: string } };

/**
 * GET /api/podcast/candidates/[id]/dossier
 * Load the existing research dossier for a candidate.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const dossier = await loadDossier(supabase, params.id);
  if (!dossier) {
    return successResponse({ dossier: null });
  }

  return successResponse({ dossier });
}

/**
 * POST /api/podcast/candidates/[id]/dossier
 * Generate a new research dossier for a candidate using AI deep research.
 * Returns SSE stream with progress updates.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // Load candidate
  const { data: candidate, error: candidateError } = await supabase
    .from('pga_candidates')
    .select('*')
    .eq('id', params.id)
    .single();

  if (candidateError || !candidate) {
    return errorResponse('Candidate not found', 404);
  }

  const body = await request.json().catch(() => ({}));
  const { run_id } = body as { run_id?: string };

  // SSE streaming
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: string) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          // Stream closed
        }
      };

      const heartbeat = setInterval(() => {
        send('heartbeat', JSON.stringify({ ts: Date.now() }));
      }, 15000);

      const callbacks: StepCallbacks = {
        onToken: (text) => send('token', JSON.stringify({ text })),
        onProgress: (message) => send('progress', JSON.stringify({ message })),
        onStepData: (data) => send('step_data', JSON.stringify(data)),
        onComplete: (result) => send('complete', JSON.stringify(result)),
        onError: (error) => send('error', JSON.stringify({ error })),
      };

      try {
        // Build dossier
        const dossier = await buildResearchDossier(
          supabase,
          candidate as PGACandidate,
          callbacks,
          { runId: run_id, userId }
        );

        // Validate all elements
        const validation = validateDossier(dossier.personalization_elements);

        // Save to database
        const dossierId = await saveDossier(supabase, dossier, run_id);

        // Update validation summary
        if (dossierId) {
          await supabase
            .from('pga_research_dossiers')
            .update({ validation_summary: validation })
            .eq('id', dossierId);
        }

        send('complete', JSON.stringify({
          dossier_id: dossierId,
          elements: dossier.personalization_elements.length,
          verified: validation.verified,
          usable_for_copy: validation.usable_for_copy,
          cost_usd: dossier.cost_usd,
          tokens_used: dossier.tokens_used,
          duration_ms: dossier.research_duration_ms,
        }));
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
