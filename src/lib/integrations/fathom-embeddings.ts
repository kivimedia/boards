import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FathomTranscriptEntry } from './fathom';
import { transcriptToText } from './fathom';
import { logUsage } from '@/lib/ai/cost-tracker';

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;
const EMBEDDING_BATCH_SIZE = 10;
const MIN_TEXT_LENGTH = 100;

/**
 * Split text into overlapping chunks for embedding.
 */
function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  if (text.length <= chunkSize) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
    if (start + overlap >= text.length) break;
  }

  return chunks;
}

/**
 * Index a Fathom transcript into the knowledge_embeddings table for semantic search.
 *
 * 1. Converts transcript entries to plain text via transcriptToText()
 * 2. Skips if text is empty or too short (< 100 chars)
 * 3. Deletes existing embeddings for this source_id (handles re-indexing)
 * 4. Chunks text (1500 chars, 200 overlap)
 * 5. Generates embeddings in batches of 10 (OpenAI batch input)
 * 6. Inserts all chunks into knowledge_embeddings with source_type='fathom_transcript'
 * 7. Returns count of chunks indexed
 */
export async function indexTranscriptEmbeddings(params: {
  recordingId: string;
  transcript: FathomTranscriptEntry[];
  title: string;
  supabase: SupabaseClient;
}): Promise<{ chunksIndexed: number }> {
  const { recordingId, transcript, title, supabase } = params;

  // 1. Convert transcript to plain text
  const text = transcriptToText(transcript);

  // 2. Skip if too short
  if (!text || text.length < MIN_TEXT_LENGTH) {
    return { chunksIndexed: 0 };
  }

  // 3. Delete existing embeddings for this recording (re-index support)
  await supabase
    .from('knowledge_embeddings')
    .delete()
    .eq('source_type', 'fathom_transcript')
    .eq('source_id', recordingId);

  // 4. Chunk the text
  const chunks = chunkText(text);
  const totalChunks = chunks.length;

  // 5. Generate embeddings in batches of 10
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
    const batchStart = Date.now();
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
      dimensions: 1536,
    });
    for (const item of response.data) {
      allEmbeddings.push(item.embedding);
    }

    // Log embedding usage for cost tracking
    try {
      await logUsage(supabase, {
        activity: 'fathom_embedding',
        provider: 'openai',
        modelId: 'text-embedding-3-small',
        inputTokens: response.usage.total_tokens,
        outputTokens: 0,
        latencyMs: Date.now() - batchStart,
        status: 'success',
        metadata: { recording_id: recordingId, chunks_in_batch: batch.length },
      });
    } catch (logErr) {
      console.error('[fathom-embeddings] Failed to log usage:', logErr);
    }
  }

  // 6. Insert all chunks into knowledge_embeddings
  const rows = chunks.map((chunk, idx) => ({
    source_type: 'fathom_transcript',
    source_id: recordingId,
    title,
    content: chunk,
    chunk_index: idx,
    total_chunks: totalChunks,
    metadata: { recording_id: recordingId },
    embedding: JSON.stringify(allEmbeddings[idx]),
  }));

  const { error } = await supabase
    .from('knowledge_embeddings')
    .insert(rows);

  if (error) {
    throw new Error(`Failed to insert embeddings: ${error.message}`);
  }

  // 7. Return count
  return { chunksIndexed: totalChunks };
}
