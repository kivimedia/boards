import { SupabaseClient } from '@supabase/supabase-js';
import { createOpenAIClient, createAnthropicClient } from './providers';
import { chunkText, generateEmbedding, generateEmbeddings } from './client-brain';
import crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface CardToIndex {
  id: string;
  updated_at: string;
}

export interface IndexBatchResult {
  processed: number;
  embedded: number;
  skipped: number;
  errors: number;
}

export interface KnowledgeSearchResult {
  id: string;
  source_type: string;
  source_id: string;
  board_id: string | null;
  title: string;
  content: string;
  chunk_index: number;
  total_chunks: number;
  metadata: Record<string, unknown>;
  similarity: number;
}

export interface BoardSummaryResult {
  board_id: string;
  summary_text: string;
  stats: Record<string, unknown>;
  key_themes: string[];
  input_tokens: number;
  output_tokens: number;
}

// ============================================================================
// CHANGE DETECTION - Find cards that need re-indexing
// ============================================================================

/**
 * Find cards that have been created/updated/commented since last index.
 * Returns up to `limit` cards, prioritizing the most recently updated.
 */
export async function findCardsNeedingReindex(
  supabase: SupabaseClient,
  limit = 50
): Promise<CardToIndex[]> {
  // Query: cards with no index state, or updated since last index,
  // or with comments newer than last index
  const { data, error } = await supabase.rpc('find_cards_needing_reindex', { p_limit: limit });

  if (error || !data) {
    // Fallback: simple query for cards not yet indexed
    const { data: fallback } = await supabase
      .from('cards')
      .select('id, updated_at')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (!fallback) return [];

    // Filter to cards not in knowledge_index_state
    const cardIds = fallback.map((c: any) => c.id);
    const { data: indexed } = await supabase
      .from('knowledge_index_state')
      .select('entity_id')
      .eq('entity_type', 'card')
      .in('entity_id', cardIds);

    const indexedSet = new Set((indexed || []).map((i: any) => i.entity_id));
    const unindexed = fallback.filter((c: any) => !indexedSet.has(c.id));

    // Also check for cards updated after their last index
    const needsUpdate: CardToIndex[] = [];
    if (indexed && indexed.length > 0) {
      const { data: stale } = await supabase
        .from('knowledge_index_state')
        .select('entity_id, last_indexed_at')
        .eq('entity_type', 'card')
        .in('entity_id', cardIds);

      if (stale) {
        const staleMap = new Map(stale.map((s: any) => [s.entity_id, s.last_indexed_at]));
        for (const c of fallback) {
          const lastIndexed = staleMap.get(c.id);
          if (lastIndexed && new Date(c.updated_at) > new Date(lastIndexed)) {
            needsUpdate.push(c);
          }
        }
      }
    }

    return [...unindexed, ...needsUpdate].slice(0, limit);
  }

  return data;
}

// ============================================================================
// CARD DOCUMENT ASSEMBLY - Build rich text for a card
// ============================================================================

/**
 * Assembles full text for a card: title, description, ALL comments, checklists, etc.
 * Returns the text and a SHA-256 content hash for change detection.
 */
export async function buildCardDocument(
  supabase: SupabaseClient,
  cardId: string
): Promise<{ text: string; hash: string; metadata: Record<string, unknown>; boardId: string | null } | null> {
  // Fetch card + placement + board info in parallel
  const [cardRes, placementRes, labelsRes, assigneesRes, commentsRes, checklistsRes] = await Promise.all([
    supabase
      .from('cards')
      .select('id, title, description, priority, due_date, start_date, created_at, updated_at')
      .eq('id', cardId)
      .single(),
    supabase
      .from('card_placements')
      .select('list_id, lists(name, board_id, boards(name))')
      .eq('card_id', cardId)
      .eq('is_mirror', false)
      .limit(1)
      .single(),
    supabase
      .from('card_labels')
      .select('label:labels(name)')
      .eq('card_id', cardId),
    supabase
      .from('card_assignees')
      .select('user:profiles(display_name)')
      .eq('card_id', cardId),
    supabase
      .from('comments')
      .select('content, created_at, user:profiles(display_name)')
      .eq('card_id', cardId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('checklists')
      .select('title, checklist_items(content, is_completed)')
      .eq('card_id', cardId),
  ]);

  const card = cardRes.data;
  if (!card) return null;

  const placement = placementRes.data as any;
  const listName = placement?.lists?.name || 'Unknown';
  const boardName = (placement?.lists as any)?.boards?.name || 'Unknown';
  const boardId = (placement?.lists as any)?.board_id || null;

  const labelNames = (labelsRes.data || []).map((l: any) => l.label?.name).filter(Boolean);
  const assigneeNames = (assigneesRes.data || []).map((a: any) => a.user?.display_name).filter(Boolean);

  // Build text
  const parts: string[] = [];
  parts.push(`Title: ${card.title}`);
  parts.push(`Board: ${boardName} | List: ${listName}`);
  if (card.priority && card.priority !== 'none') parts.push(`Priority: ${card.priority}`);
  if (card.due_date) parts.push(`Due: ${card.due_date}`);
  if (assigneeNames.length > 0) parts.push(`Assigned to: ${assigneeNames.join(', ')}`);
  if (labelNames.length > 0) parts.push(`Labels: ${labelNames.join(', ')}`);

  if (card.description) {
    parts.push(`\nDescription:\n${card.description}`);
  }

  // Checklists
  const checklists = (checklistsRes.data || []) as any[];
  if (checklists.length > 0) {
    parts.push('\nChecklists:');
    for (const cl of checklists) {
      const items = cl.checklist_items || [];
      const done = items.filter((i: any) => i.is_completed).length;
      parts.push(`  ${cl.title} (${done}/${items.length} done):`);
      for (const item of items.slice(0, 30)) {
        parts.push(`    ${item.is_completed ? '[x]' : '[ ]'} ${item.content}`);
      }
    }
  }

  // Comments - ALL of them, not truncated
  const comments = (commentsRes.data || []) as any[];
  if (comments.length > 0) {
    parts.push(`\nComments (${comments.length} most recent):`);
    for (const c of comments) {
      const author = c.user?.display_name || 'Unknown';
      const date = c.created_at?.slice(0, 10) || '';
      parts.push(`  - ${author} (${date}): ${c.content || ''}`);
    }
  }

  const text = parts.join('\n');
  const hash = crypto.createHash('sha256').update(text).digest('hex');

  return {
    text,
    hash,
    metadata: {
      board_name: boardName,
      list_name: listName,
      priority: card.priority || 'none',
      due_date: card.due_date,
      assignees: assigneeNames,
      labels: labelNames,
      comment_count: comments.length,
      has_checklists: checklists.length > 0,
    },
    boardId,
  };
}

// ============================================================================
// BATCH INDEXING - Embed and store card documents
// ============================================================================

/**
 * Index a batch of cards: build documents, check hashes, embed, store.
 */
export async function indexCardBatch(
  supabase: SupabaseClient,
  cards: CardToIndex[]
): Promise<IndexBatchResult> {
  const result: IndexBatchResult = { processed: 0, embedded: 0, skipped: 0, errors: 0 };

  const openaiClient = await createOpenAIClient(supabase);
  if (!openaiClient) {
    console.error('[knowledge-indexer] OpenAI not configured, cannot generate embeddings');
    return result;
  }

  for (const card of cards) {
    result.processed++;
    try {
      const doc = await buildCardDocument(supabase, card.id);
      if (!doc) {
        result.errors++;
        continue;
      }

      // Check if content hash matches - skip if unchanged
      const { data: existing } = await supabase
        .from('knowledge_index_state')
        .select('last_content_hash')
        .eq('entity_type', 'card')
        .eq('entity_id', card.id)
        .single();

      if (existing?.last_content_hash === doc.hash) {
        result.skipped++;
        // Update last_indexed_at even if skipped
        await supabase
          .from('knowledge_index_state')
          .upsert({
            entity_type: 'card',
            entity_id: card.id,
            last_indexed_at: new Date().toISOString(),
            last_content_hash: doc.hash,
            status: 'indexed',
          }, { onConflict: 'entity_type,entity_id' });
        continue;
      }

      // Chunk and embed
      const chunks = chunkText(doc.text);
      const embeddings = await generateEmbeddings(openaiClient, chunks);

      // Deactivate old embeddings for this card
      await supabase
        .from('knowledge_embeddings')
        .update({ is_active: false })
        .eq('source_type', 'card')
        .eq('source_id', card.id);

      // Insert new embeddings
      for (let i = 0; i < chunks.length; i++) {
        await supabase
          .from('knowledge_embeddings')
          .insert({
            source_type: 'card',
            source_id: card.id,
            board_id: doc.boardId,
            title: doc.text.split('\n')[0]?.replace('Title: ', '') || 'Untitled',
            content: chunks[i],
            embedding: JSON.stringify(embeddings[i]),
            chunk_index: i,
            total_chunks: chunks.length,
            content_hash: doc.hash,
            metadata: doc.metadata,
            source_updated_at: card.updated_at,
          });
      }

      // Update index state
      await supabase
        .from('knowledge_index_state')
        .upsert({
          entity_type: 'card',
          entity_id: card.id,
          last_indexed_at: new Date().toISOString(),
          last_content_hash: doc.hash,
          status: 'indexed',
        }, { onConflict: 'entity_type,entity_id' });

      result.embedded++;
    } catch (err) {
      console.error(`[knowledge-indexer] Error indexing card ${card.id}:`, err);
      result.errors++;

      // Mark as error in index state
      await supabase
        .from('knowledge_index_state')
        .upsert({
          entity_type: 'card',
          entity_id: card.id,
          last_indexed_at: new Date().toISOString(),
          status: 'error',
          error_message: err instanceof Error ? err.message : 'Unknown error',
        }, { onConflict: 'entity_type,entity_id' });
    }
  }

  return result;
}

// ============================================================================
// SEMANTIC SEARCH - Query knowledge at runtime
// ============================================================================

export interface SearchKnowledgeOptions {
  boardId?: string;
  limit?: number;
  threshold?: number;
  sourceTypes?: string[];
  excludeSourceId?: string;
}

/**
 * Search the knowledge base using semantic similarity.
 * Generates an embedding for the query, then calls match_knowledge_embeddings RPC.
 */
export async function searchKnowledge(
  supabase: SupabaseClient,
  query: string,
  options: SearchKnowledgeOptions = {}
): Promise<KnowledgeSearchResult[]> {
  const { boardId, limit = 10, threshold = 0.65, sourceTypes, excludeSourceId } = options;

  const openaiClient = await createOpenAIClient(supabase);
  if (!openaiClient) return [];

  try {
    const queryEmbedding = await generateEmbedding(openaiClient, query);

    const { data, error } = await supabase.rpc('match_knowledge_embeddings', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: threshold,
      match_count: excludeSourceId ? limit + 5 : limit,
      p_board_id: boardId || null,
      p_source_types: sourceTypes || null,
    });

    if (error || !data) return [];

    let results = data as KnowledgeSearchResult[];

    // Filter out excluded source
    if (excludeSourceId) {
      results = results.filter((r) => r.source_id !== excludeSourceId);
    }

    return results.slice(0, limit);
  } catch (err) {
    console.error('[knowledge-indexer] Search error:', err);
    return [];
  }
}

// ============================================================================
// BOARD SUMMARY GENERATION - Pre-computed board overviews via Haiku
// ============================================================================

/**
 * Generate and store a board summary using Claude Haiku.
 * Includes narrative summary, stats, and key themes.
 */
export async function generateBoardSummary(
  supabase: SupabaseClient,
  boardId: string
): Promise<BoardSummaryResult | null> {
  const anthropicClient = await createAnthropicClient(supabase);
  if (!anthropicClient) return null;

  // Fetch board + lists + cards + members
  const [boardRes, listsRes, membersRes] = await Promise.all([
    supabase.from('boards').select('id, name, type').eq('id', boardId).single(),
    supabase.from('lists').select('id, name, position').eq('board_id', boardId).order('position'),
    supabase.from('board_members').select('role, profile:profiles(display_name)').eq('board_id', boardId),
  ]);

  const board = boardRes.data;
  if (!board) return null;

  const lists = listsRes.data || [];
  const listIds = lists.map((l: any) => l.id);

  // Fetch card placements with key card data
  let placements: any[] = [];
  if (listIds.length > 0) {
    const { data } = await supabase
      .from('card_placements')
      .select('list_id, card:cards(id, title, priority, due_date, description)')
      .in('list_id', listIds)
      .order('position')
      .limit(500);
    placements = data || [];
  }

  // Fetch assignees for cards
  const cardIds = placements.map((p: any) => p.card?.id).filter(Boolean);
  const assigneeMap: Record<string, string[]> = {};
  if (cardIds.length > 0) {
    const { data: assignees } = await supabase
      .from('card_assignees')
      .select('card_id, user:profiles(display_name)')
      .in('card_id', cardIds.slice(0, 300));
    if (assignees) {
      for (const a of assignees as any[]) {
        const name = a.user?.display_name;
        if (name) {
          if (!assigneeMap[a.card_id]) assigneeMap[a.card_id] = [];
          assigneeMap[a.card_id].push(name);
        }
      }
    }
  }

  // Build stats
  const todayStr = new Date().toISOString().split('T')[0];
  const cardsByList: Record<string, number> = {};
  const cardsByPriority: Record<string, number> = {};
  let overdueCount = 0;
  const allCardTitles: string[] = [];

  for (const p of placements) {
    if (!p.card) continue;
    cardsByList[p.list_id] = (cardsByList[p.list_id] || 0) + 1;
    const pri = p.card.priority || 'none';
    cardsByPriority[pri] = (cardsByPriority[pri] || 0) + 1;
    if (p.card.due_date && p.card.due_date < todayStr) overdueCount++;
    allCardTitles.push(p.card.title);
  }

  const stats = {
    total_cards: placements.filter((p: any) => p.card).length,
    by_list: lists.map((l: any) => ({ name: l.name, count: cardsByList[l.id] || 0 })),
    by_priority: cardsByPriority,
    overdue_count: overdueCount,
    member_count: (membersRes.data || []).length,
  };

  // Build text for Haiku to summarize
  const memberNames = (membersRes.data || []).map((m: any) => m.profile?.display_name).filter(Boolean);
  const inputText = [
    `Board: ${board.name} (${board.type})`,
    `Lists: ${lists.map((l: any) => `${l.name} (${cardsByList[l.id] || 0} cards)`).join(', ')}`,
    `Total cards: ${stats.total_cards}`,
    `Overdue: ${overdueCount}`,
    `Team: ${memberNames.join(', ')}`,
    `Priority breakdown: ${Object.entries(cardsByPriority).map(([k, v]) => `${k}: ${v}`).join(', ')}`,
    `\nCard titles by list:`,
    ...lists.map((l: any) => {
      const listCards = placements
        .filter((p: any) => p.list_id === l.id && p.card)
        .map((p: any) => {
          const assignees = assigneeMap[p.card.id];
          const due = p.card.due_date ? ` (due: ${p.card.due_date})` : '';
          const assign = assignees ? ` [${assignees.join(', ')}]` : '';
          return `  - ${p.card.title}${due}${assign}`;
        });
      return `\n${l.name}:\n${listCards.join('\n') || '  (empty)'}`;
    }),
  ].join('\n');

  try {
    const response = await anthropicClient.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: `You are a project management analyst. Summarize the board data into a 200-300 word overview that covers: what this board is about, key themes/projects, current bottlenecks or overdue items, team workload distribution, and notable upcoming deadlines. Be factual and specific - reference actual card titles, people, and dates. End with 3-5 key themes as a comma-separated list on the last line prefixed with "Themes: ".`,
      messages: [{ role: 'user', content: inputText }],
    });

    const outputText = response.content[0]?.type === 'text' ? response.content[0].text : '';

    // Extract themes from last line
    const lines = outputText.trim().split('\n');
    let themes: string[] = [];
    let summaryText = outputText;
    const lastLine = lines[lines.length - 1];
    if (lastLine?.startsWith('Themes:')) {
      themes = lastLine.replace('Themes:', '').split(',').map((t) => t.trim()).filter(Boolean);
      summaryText = lines.slice(0, -1).join('\n').trim();
    }

    const result: BoardSummaryResult = {
      board_id: boardId,
      summary_text: summaryText,
      stats,
      key_themes: themes,
      input_tokens: response.usage?.input_tokens || 0,
      output_tokens: response.usage?.output_tokens || 0,
    };

    // Upsert board summary
    await supabase
      .from('board_summaries')
      .upsert({
        board_id: boardId,
        summary_text: result.summary_text,
        stats: result.stats,
        key_themes: result.key_themes,
        generated_by: 'haiku',
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        cost_usd: (result.input_tokens * 0.001 + result.output_tokens * 0.005) / 1000,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'board_id' });

    // Also create/update an embedding for the board summary
    const openaiClient = await createOpenAIClient(supabase);
    if (openaiClient) {
      const summaryForEmbed = `${board.name} board summary:\n${summaryText}`;
      const chunks = chunkText(summaryForEmbed);
      const embeddings = await generateEmbeddings(openaiClient, chunks);

      // Deactivate old board summary embeddings
      await supabase
        .from('knowledge_embeddings')
        .update({ is_active: false })
        .eq('source_type', 'board_summary')
        .eq('source_id', boardId);

      for (let i = 0; i < chunks.length; i++) {
        await supabase
          .from('knowledge_embeddings')
          .insert({
            source_type: 'board_summary',
            source_id: boardId,
            board_id: boardId,
            title: `${board.name} - Board Summary`,
            content: chunks[i],
            embedding: JSON.stringify(embeddings[i]),
            chunk_index: i,
            total_chunks: chunks.length,
            content_hash: crypto.createHash('sha256').update(summaryText).digest('hex'),
            metadata: { board_name: board.name, board_type: board.type, ...stats },
          });
      }
    }

    return result;
  } catch (err) {
    console.error(`[knowledge-indexer] Error generating summary for board ${boardId}:`, err);
    return null;
  }
}
