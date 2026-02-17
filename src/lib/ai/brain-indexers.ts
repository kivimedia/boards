import { SupabaseClient } from '@supabase/supabase-js';
import { indexDocument } from './client-brain';

// ============================================================================
// MULTI-SOURCE BRAIN INDEXERS
// Index map board, wiki, asset, and comment data into the Client Brain
// ============================================================================

/**
 * Index a client's Map Board data (doors, keys, training, sections)
 * into the Client Brain for RAG retrieval.
 */
export async function indexMapBoard(
  supabase: SupabaseClient,
  clientId: string
): Promise<{ indexed: number; errors: number }> {
  let indexed = 0;
  let errors = 0;

  // Index doors + keys
  const { data: doors } = await supabase
    .from('doors')
    .select('id, door_number, title, description, status')
    .eq('client_id', clientId)
    .order('door_number');

  if (doors && doors.length > 0) {
    const doorIds = doors.map((d: { id: string }) => d.id);
    const { data: allKeys } = await supabase
      .from('door_keys')
      .select('id, door_id, key_number, title, is_completed')
      .in('door_id', doorIds);

    for (const door of doors as { id: string; door_number: number; title: string; description: string | null; status: string }[]) {
      const keys = (allKeys || []).filter((k: { door_id: string }) => k.door_id === door.id) as {
        key_number: number;
        title: string;
        is_completed: boolean;
      }[];

      const parts = [
        `Door ${door.door_number}: ${door.title}`,
        `Status: ${door.status}`,
      ];
      if (door.description) parts.push(`Description: ${door.description}`);
      if (keys.length > 0) {
        parts.push('Keys:');
        for (const key of keys) {
          parts.push(`  - Key ${key.key_number}: ${key.title} [${key.is_completed ? 'completed' : 'pending'}]`);
        }
      }

      try {
        await indexDocument(supabase, {
          clientId,
          sourceType: 'map_board',
          sourceId: door.id,
          title: `Door ${door.door_number}: ${door.title}`,
          content: parts.join('\n'),
          metadata: { door_number: door.door_number, status: door.status, key_count: keys.length },
        });
        indexed++;
      } catch {
        errors++;
      }
    }
  }

  // Index training assignments
  const { data: training } = await supabase
    .from('training_assignments')
    .select('id, title, status, assigned_to, due_date, description')
    .eq('client_id', clientId);

  for (const t of (training || []) as { id: string; title: string; status: string; assigned_to: string | null; due_date: string | null; description: string | null }[]) {
    const parts = [
      `Training: ${t.title}`,
      `Status: ${t.status}`,
    ];
    if (t.due_date) parts.push(`Due: ${t.due_date}`);
    if (t.description) parts.push(t.description);

    try {
      await indexDocument(supabase, {
        clientId,
        sourceType: 'map_board',
        sourceId: t.id,
        title: `Training: ${t.title}`,
        content: parts.join('\n'),
        metadata: { type: 'training', status: t.status },
      });
      indexed++;
    } catch {
      errors++;
    }
  }

  // Index map sections
  const { data: sections } = await supabase
    .from('map_sections')
    .select('id, section_type, title, content')
    .eq('client_id', clientId);

  for (const s of (sections || []) as { id: string; section_type: string; title: string; content: Record<string, unknown> | null }[]) {
    const contentStr = s.content ? JSON.stringify(s.content, null, 2) : '';
    if (!contentStr || contentStr.length < 20) continue;

    try {
      await indexDocument(supabase, {
        clientId,
        sourceType: 'map_board',
        sourceId: s.id,
        title: `Section: ${s.title} (${s.section_type})`,
        content: contentStr.slice(0, 5000),
        metadata: { section_type: s.section_type },
      });
      indexed++;
    } catch {
      errors++;
    }
  }

  return { indexed, errors };
}

/**
 * Index a published wiki page into the Client Brain.
 * Note: Wiki pages may not be client-specific. If clientId is provided,
 * the page is indexed under that client.
 */
export async function indexWikiPage(
  supabase: SupabaseClient,
  pageId: string,
  clientId: string
): Promise<{ success: boolean; error?: string }> {
  const { data: page } = await supabase
    .from('wiki_pages')
    .select('id, title, content, tags, department, is_published')
    .eq('id', pageId)
    .single();

  if (!page) return { success: false, error: 'Page not found' };
  if (!page.is_published) return { success: false, error: 'Page is not published' };

  const content = [
    `Wiki: ${page.title}`,
    page.department ? `Department: ${page.department}` : '',
    page.tags && (page.tags as string[]).length > 0 ? `Tags: ${(page.tags as string[]).join(', ')}` : '',
    '',
    page.content,
  ].filter(Boolean).join('\n');

  try {
    await indexDocument(supabase, {
      clientId,
      sourceType: 'wiki',
      sourceId: pageId,
      title: page.title,
      content: content.slice(0, 10000),
      metadata: {
        department: page.department,
        tags: page.tags,
      },
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Index an asset's metadata into the Client Brain.
 */
export async function indexAsset(
  supabase: SupabaseClient,
  assetId: string,
  clientId: string
): Promise<{ success: boolean; error?: string }> {
  const { data: asset } = await supabase
    .from('assets')
    .select('id, name, description, tags, asset_type, file_name')
    .eq('id', assetId)
    .single();

  if (!asset) return { success: false, error: 'Asset not found' };

  const parts = [
    `Asset: ${asset.name}`,
    asset.asset_type ? `Type: ${asset.asset_type}` : '',
    asset.file_name ? `File: ${asset.file_name}` : '',
    asset.description || '',
    asset.tags && (asset.tags as string[]).length > 0 ? `Tags: ${(asset.tags as string[]).join(', ')}` : '',
  ].filter(Boolean).join('\n');

  if (parts.length < 20) return { success: false, error: 'Asset has insufficient content' };

  try {
    await indexDocument(supabase, {
      clientId,
      sourceType: 'asset',
      sourceId: assetId,
      title: `Asset: ${asset.name}`,
      content: parts,
      metadata: { asset_type: asset.asset_type, tags: asset.tags },
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Index a comment into the Client Brain.
 * Only indexes substantive comments (>50 chars, non-system).
 */
export async function indexComment(
  supabase: SupabaseClient,
  commentId: string,
  clientId: string
): Promise<{ success: boolean; error?: string }> {
  const { data: comment } = await supabase
    .from('comments')
    .select('id, content, card_id, created_at, cards(title)')
    .eq('id', commentId)
    .single();

  if (!comment) return { success: false, error: 'Comment not found' };
  if (!comment.content || comment.content.length < 50) {
    return { success: false, error: 'Comment too short for indexing' };
  }

  const cardTitle = (comment.cards as unknown as { title: string } | null)?.title ?? 'Unknown card';

  const content = [
    `Comment on "${cardTitle}"`,
    `Date: ${comment.created_at}`,
    '',
    comment.content,
  ].join('\n');

  try {
    await indexDocument(supabase, {
      clientId,
      sourceType: 'comment',
      sourceId: commentId,
      title: `Comment on ${cardTitle}`,
      content,
      metadata: { card_id: comment.card_id },
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
