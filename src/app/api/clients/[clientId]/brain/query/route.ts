import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { queryClientBrain } from '@/lib/ai/client-brain';

interface Params {
  params: { clientId: string };
}

interface QueryBody {
  query: string;
}

/**
 * POST /api/clients/[clientId]/brain/query
 * Query the client brain using RAG.
 *
 * Body:
 *   query: string (required) - The question to ask
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<QueryBody>(request);
  if (!body.ok) return body.response;

  const { query } = body.body;
  const { supabase, userId } = auth.ctx;
  const { clientId } = params;

  if (!query) {
    return errorResponse('query is required');
  }

  // Permission check: verify user has access to this client via RLS
  const { data: clientCheck } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .single();

  if (!clientCheck) {
    return errorResponse('Client not found or access denied', 404);
  }

  try {
    const result = await queryClientBrain(supabase, {
      clientId,
      userId,
      query,
    });

    return successResponse(result, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('Budget exceeded')) {
      return errorResponse(message, 429);
    }

    if (message.includes('not configured') || message.includes('API key')) {
      return errorResponse(message, 422);
    }

    return errorResponse(`Brain query failed: ${message}`, 500);
  }
}
