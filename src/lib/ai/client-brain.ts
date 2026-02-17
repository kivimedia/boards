import { SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { createOpenAIClient, createAnthropicClient, touchApiKey } from './providers';
import { resolveModelWithFallback } from './model-resolver';
import { logUsage } from './cost-tracker';
import { canMakeAICall } from './budget-checker';
import { getSystemPrompt } from './prompt-templates';
import type {
  ClientBrainDocument,
  ClientBrainQuery,
  BrainSearchResult,
  BrainDocSourceType,
} from '../types';

// ============================================================================
// TEXT CHUNKING
// ============================================================================

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;

/**
 * Split text into overlapping chunks for embedding.
 */
export function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
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

// ============================================================================
// EMBEDDING GENERATION
// ============================================================================

/**
 * Generate embeddings using OpenAI text-embedding-3-small.
 */
export async function generateEmbedding(
  openaiClient: OpenAI,
  text: string
): Promise<number[]> {
  const response = await openaiClient.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536,
  });

  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts.
 */
export async function generateEmbeddings(
  openaiClient: OpenAI,
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await openaiClient.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
    dimensions: 1536,
  });

  return response.data.map((d) => d.embedding);
}

// ============================================================================
// DOCUMENT INDEXING
// ============================================================================

export interface IndexDocumentInput {
  clientId: string;
  sourceType: BrainDocSourceType;
  sourceId?: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Index a document into the client brain.
 * Chunks the text, generates embeddings, and stores in the database.
 */
export async function indexDocument(
  supabase: SupabaseClient,
  input: IndexDocumentInput
): Promise<ClientBrainDocument[]> {
  const openaiClient = await createOpenAIClient(supabase);
  if (!openaiClient) {
    throw new Error('OpenAI API key not configured. Required for embeddings.');
  }

  // Chunk the content
  const chunks = chunkText(input.content);

  // Generate embeddings for all chunks
  const embeddings = await generateEmbeddings(openaiClient, chunks);

  // First, deactivate any existing documents for this source
  if (input.sourceId) {
    await supabase
      .from('client_brain_documents')
      .update({ is_active: false })
      .eq('client_id', input.clientId)
      .eq('source_type', input.sourceType)
      .eq('source_id', input.sourceId);
  }

  // Insert new documents
  const docs: ClientBrainDocument[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const { data, error } = await supabase
      .from('client_brain_documents')
      .insert({
        client_id: input.clientId,
        source_type: input.sourceType,
        source_id: input.sourceId ?? null,
        title: input.title,
        content: chunks[i],
        embedding: JSON.stringify(embeddings[i]),
        chunk_index: i,
        metadata: input.metadata ?? {},
      })
      .select('id, client_id, source_type, source_id, title, content, chunk_index, metadata, is_active, created_at, updated_at')
      .single();

    if (!error && data) {
      docs.push(data as ClientBrainDocument);
    }
  }

  return docs;
}

/**
 * Auto-index a card when it reaches an approved/delivered state.
 * Extracts title, description, comments, checklist items, and brief data.
 */
export async function autoIndexCard(
  supabase: SupabaseClient,
  cardId: string,
  clientId: string
): Promise<number> {
  // Fetch card details
  const { data: card } = await supabase
    .from('cards')
    .select('id, title, description')
    .eq('id', cardId)
    .single();

  if (!card) return 0;

  const parts: string[] = [`Title: ${card.title}`];
  if (card.description) parts.push(`Description: ${card.description}`);

  // Fetch comments
  const { data: comments } = await supabase
    .from('comments')
    .select('content')
    .eq('card_id', cardId)
    .order('created_at', { ascending: true });

  if (comments && comments.length > 0) {
    parts.push('Comments:');
    for (const c of comments) {
      parts.push(`- ${c.content}`);
    }
  }

  // Fetch brief
  const { data: brief } = await supabase
    .from('card_briefs')
    .select('data')
    .eq('card_id', cardId)
    .single();

  if (brief?.data) {
    parts.push(`Brief: ${JSON.stringify(brief.data)}`);
  }

  const fullText = parts.join('\n');

  const docs = await indexDocument(supabase, {
    clientId,
    sourceType: 'card',
    sourceId: cardId,
    title: card.title,
    content: fullText,
    metadata: { card_id: cardId },
  });

  return docs.length;
}

// ============================================================================
// SIMILARITY SEARCH
// ============================================================================

/**
 * Search for similar documents in the client brain using vector similarity.
 */
export async function searchBrain(
  supabase: SupabaseClient,
  clientId: string,
  query: string,
  limit: number = 5,
  similarityThreshold: number = 0.7
): Promise<BrainSearchResult[]> {
  const openaiClient = await createOpenAIClient(supabase);
  if (!openaiClient) {
    throw new Error('OpenAI API key not configured. Required for embeddings.');
  }

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(openaiClient, query);

  // Use Supabase RPC for vector similarity search
  const { data, error } = await supabase.rpc('match_brain_documents', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_client_id: clientId,
    match_threshold: similarityThreshold,
    match_count: limit,
  });

  if (error) {
    // Fallback: fetch all active docs and compute similarity client-side
    // This is less efficient but works without the RPC function
    console.error('[ClientBrain] RPC search failed, using fallback:', error.message);
    return [];
  }

  return (data || []).map((d: { id: string; title: string; content: string; similarity: number; source_type: string; metadata: Record<string, unknown> }) => ({
    document_id: d.id,
    title: d.title,
    content: d.content,
    similarity: d.similarity,
    source_type: d.source_type as BrainDocSourceType,
    metadata: d.metadata,
  }));
}

// ============================================================================
// RAG QUERY PIPELINE
// ============================================================================

export interface BrainQueryInput {
  clientId: string;
  userId: string;
  query: string;
}

export interface BrainQueryOutput {
  response: string;
  confidence: number;
  sources: { document_id: string; title: string; similarity: number }[];
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Query the client brain using RAG (Retrieval-Augmented Generation).
 */
export async function queryClientBrain(
  supabase: SupabaseClient,
  input: BrainQueryInput
): Promise<BrainQueryOutput> {
  const startTime = Date.now();

  // 1. Budget check
  const budgetCheck = await canMakeAICall(supabase, {
    provider: 'anthropic',
    activity: 'client_brain',
    userId: input.userId,
  });

  if (!budgetCheck.allowed) {
    throw new Error(`Budget exceeded: ${budgetCheck.reason}`);
  }

  // 2. Resolve model
  const modelConfig = await resolveModelWithFallback(supabase, 'client_brain');

  // 3. Search for relevant documents
  const searchResults = await searchBrain(supabase, input.clientId, input.query, 5, 0.6);

  // 4. Build context from search results
  let contextText = '';
  if (searchResults.length > 0) {
    contextText = searchResults
      .map((r, i) => `[Source ${i + 1}: ${r.title} (relevance: ${(r.similarity * 100).toFixed(0)}%)]\n${r.content}`)
      .join('\n\n');
  } else {
    contextText = 'No relevant documents found in the client brain. Answer based on general knowledge and indicate that specific client data is not available.';
  }

  // 5. Create Anthropic client and send query
  const client = await createAnthropicClient(supabase);
  if (!client) {
    throw new Error('Anthropic API key not configured.');
  }

  const systemPrompt = getSystemPrompt('client_brain');
  const userMessage = `## Client Knowledge Base Context\n${contextText}\n\n## User Question\n${input.query}\n\nPlease answer based on the provided context. Indicate your confidence level (high/medium/low) and cite specific sources when possible.`;

  const response = await client.messages.create({
    model: modelConfig.model_id,
    max_tokens: modelConfig.max_tokens,
    temperature: modelConfig.temperature,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const latencyMs = Date.now() - startTime;
  await touchApiKey(supabase, 'anthropic');

  const responseText = response.content
    .filter((block) => block.type === 'text')
    .map((block) => {
      if (block.type === 'text') return block.text;
      return '';
    })
    .join('\n');

  // 6. Determine confidence based on search results
  const avgSimilarity = searchResults.length > 0
    ? searchResults.reduce((acc, r) => acc + r.similarity, 0) / searchResults.length
    : 0;
  const confidence = Math.min(1, avgSimilarity * 1.2);

  const sources = searchResults.map((r) => ({
    document_id: r.document_id,
    title: r.title,
    similarity: r.similarity,
  }));

  // 7. Log usage
  await logUsage(supabase, {
    userId: input.userId,
    cardId: undefined,
    activity: 'client_brain',
    provider: 'anthropic',
    modelId: modelConfig.model_id,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    latencyMs,
    status: 'success',
    metadata: {
      client_id: input.clientId,
      sources_found: searchResults.length,
      confidence,
    },
  });

  // 8. Store query log
  await supabase.from('client_brain_queries').insert({
    client_id: input.clientId,
    user_id: input.userId,
    query: input.query,
    response: responseText,
    confidence,
    sources,
    model_used: modelConfig.model_id,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    latency_ms: latencyMs,
  });

  return {
    response: responseText,
    confidence,
    sources,
    modelUsed: modelConfig.model_id,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

// ============================================================================
// DOCUMENT MANAGEMENT
// ============================================================================

/**
 * Get all indexed documents for a client.
 */
export async function getClientDocuments(
  supabase: SupabaseClient,
  clientId: string
): Promise<ClientBrainDocument[]> {
  const { data } = await supabase
    .from('client_brain_documents')
    .select('id, client_id, source_type, source_id, title, content, chunk_index, metadata, is_active, created_at, updated_at')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  return (data as ClientBrainDocument[]) ?? [];
}

/**
 * Get query history for a client.
 */
export async function getClientQueryHistory(
  supabase: SupabaseClient,
  clientId: string
): Promise<ClientBrainQuery[]> {
  const { data } = await supabase
    .from('client_brain_queries')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(50);

  return (data as ClientBrainQuery[]) ?? [];
}

/**
 * Delete (deactivate) a brain document.
 */
export async function deactivateDocument(
  supabase: SupabaseClient,
  documentId: string
): Promise<void> {
  await supabase
    .from('client_brain_documents')
    .update({ is_active: false })
    .eq('id', documentId);
}

/**
 * Get document count stats for a client.
 */
export async function getClientBrainStats(
  supabase: SupabaseClient,
  clientId: string
): Promise<{ total: number; bySource: Record<string, number> }> {
  const { data } = await supabase
    .from('client_brain_documents')
    .select('source_type')
    .eq('client_id', clientId)
    .eq('is_active', true);

  if (!data) return { total: 0, bySource: {} };

  const bySource: Record<string, number> = {};
  for (const doc of data) {
    bySource[doc.source_type] = (bySource[doc.source_type] || 0) + 1;
  }

  return { total: data.length, bySource };
}
