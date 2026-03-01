import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';

/**
 * POST /api/meetings/search
 * Semantic search across meeting transcripts using embeddings.
 * Body: { query: string, threshold?: number, limit?: number }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  let body: {
    query: string;
    threshold?: number;
    limit?: number;
  };

  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.query || typeof body.query !== 'string' || !body.query.trim()) {
    return errorResponse('query is required', 400);
  }

  const matchThreshold = body.threshold ?? 0.6;
  const matchCount = body.limit ?? 10;

  // Generate embedding for the search query
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return errorResponse('OpenAI API key not configured', 500);
  }

  const openai = new OpenAI({ apiKey: openaiKey });

  let queryEmbedding: number[];
  try {
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: body.query.trim(),
      dimensions: 1536,
    });
    queryEmbedding = embeddingResponse.data[0].embedding;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[meetings/search] Embedding generation failed:', message);
    return errorResponse('Failed to generate search embedding', 500);
  }

  // Search knowledge embeddings for fathom transcript chunks
  const { data: matches, error: rpcError } = await supabase.rpc(
    'match_knowledge_embeddings',
    {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
      p_source_types: ['fathom_transcript'],
    }
  );

  if (rpcError) {
    console.error('[meetings/search] RPC error:', rpcError.message);
    return errorResponse(rpcError.message, 500);
  }

  if (!matches || matches.length === 0) {
    return NextResponse.json({ results: [] });
  }

  // Fetch parent recordings for each match
  const recordingIds = Array.from(
    new Set(matches.map((m: { source_id: string }) => m.source_id))
  ) as string[];

  const { data: recordings, error: recError } = await supabase
    .from('fathom_recordings')
    .select('id, title, share_url')
    .in('id', recordingIds);

  if (recError) {
    console.error('[meetings/search] Recordings fetch error:', recError.message);
    return errorResponse('Failed to fetch recording details', 500);
  }

  const recordingMap = new Map(
    (recordings || []).map((r: { id: string; title: string; share_url: string }) => [r.id, r])
  );

  // Build enriched results
  const results = matches.map(
    (match: { source_id: string; content: string; similarity: number }) => {
      const recording = recordingMap.get(match.source_id);
      return {
        recording_id: match.source_id,
        title: recording?.title || null,
        share_url: recording?.share_url || null,
        chunk_content: match.content,
        similarity: match.similarity,
      };
    }
  );

  return NextResponse.json({ results });
}
