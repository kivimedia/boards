import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getClientDocuments, indexDocument } from '@/lib/ai/client-brain';
import type { BrainDocSourceType } from '@/lib/types';

interface Params {
  params: { clientId: string };
}

/**
 * GET /api/clients/[clientId]/brain/documents
 * Get all indexed documents for a client.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { clientId } = params;

  try {
    const documents = await getClientDocuments(supabase, clientId);
    return successResponse(documents);
  } catch (err) {
    return errorResponse(
      `Failed to fetch client documents: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

interface IndexDocumentBody {
  sourceType: BrainDocSourceType;
  sourceId?: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * POST /api/clients/[clientId]/brain/documents
 * Index a new document into the client brain.
 *
 * Body:
 *   sourceType: BrainDocSourceType (required)
 *   sourceId?: string
 *   title: string (required)
 *   content: string (required)
 *   metadata?: Record<string, unknown>
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<IndexDocumentBody>(request);
  if (!body.ok) return body.response;

  const { sourceType, sourceId, title, content, metadata } = body.body;
  const { supabase } = auth.ctx;
  const { clientId } = params;

  if (!sourceType) {
    return errorResponse('sourceType is required');
  }

  if (!title) {
    return errorResponse('title is required');
  }

  if (!content) {
    return errorResponse('content is required');
  }

  try {
    const documents = await indexDocument(supabase, {
      clientId,
      sourceType,
      sourceId,
      title,
      content,
      metadata,
    });

    return successResponse(documents, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('not configured') || message.includes('API key')) {
      return errorResponse(message, 422);
    }

    return errorResponse(`Failed to index document: ${message}`, 500);
  }
}
