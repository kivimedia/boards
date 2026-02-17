import { SupabaseClient } from '@supabase/supabase-js';
import type { WikiPage, WikiPageVersion, BoardWikiPin, BoardType } from './types';

// ============================================================================
// SLUG GENERATION
// ============================================================================

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

// ============================================================================
// WIKI PAGE CRUD
// ============================================================================

export async function createWikiPage(
  supabase: SupabaseClient,
  data: {
    title: string;
    content?: string;
    department?: BoardType | 'general';
    ownerId: string;
    tags?: string[];
    parentPageId?: string;
    reviewCadenceDays?: number;
  }
): Promise<WikiPage | null> {
  const slug = generateSlug(data.title);

  const { data: page, error } = await supabase
    .from('wiki_pages')
    .insert({
      title: data.title,
      slug,
      content: data.content ?? '',
      department: data.department ?? null,
      owner_id: data.ownerId,
      tags: data.tags ?? [],
      parent_page_id: data.parentPageId ?? null,
      review_cadence_days: data.reviewCadenceDays ?? null,
      is_published: false,
    })
    .select()
    .single();

  if (error) return null;

  // Create initial version
  await supabase.from('wiki_page_versions').insert({
    page_id: page.id,
    version_number: 1,
    title: data.title,
    content: data.content ?? '',
    change_summary: 'Initial version',
    edited_by: data.ownerId,
  });

  return page as WikiPage;
}

export async function getWikiPages(
  supabase: SupabaseClient,
  filters?: {
    department?: string;
    published?: boolean;
    search?: string;
    tags?: string[];
    parentPageId?: string | null;
  }
): Promise<WikiPage[]> {
  let query = supabase
    .from('wiki_pages')
    .select('*')
    .order('position', { ascending: true });

  if (filters?.department) query = query.eq('department', filters.department);
  if (filters?.published !== undefined) query = query.eq('is_published', filters.published);
  if (filters?.search) query = query.ilike('title', `%${filters.search}%`);
  if (filters?.tags && filters.tags.length > 0) query = query.overlaps('tags', filters.tags);
  if (filters?.parentPageId !== undefined) {
    if (filters.parentPageId === null) {
      query = query.is('parent_page_id', null);
    } else {
      query = query.eq('parent_page_id', filters.parentPageId);
    }
  }

  const { data } = await query;
  return (data as WikiPage[]) ?? [];
}

export async function getWikiPage(
  supabase: SupabaseClient,
  slugOrId: string
): Promise<WikiPage | null> {
  // Try by slug first, then by ID
  let { data } = await supabase
    .from('wiki_pages')
    .select('*')
    .eq('slug', slugOrId)
    .single();

  if (!data) {
    const result = await supabase
      .from('wiki_pages')
      .select('*')
      .eq('id', slugOrId)
      .single();
    data = result.data;
  }

  return data as WikiPage | null;
}

export async function updateWikiPage(
  supabase: SupabaseClient,
  pageId: string,
  updates: {
    title?: string;
    content?: string;
    department?: string | null;
    is_published?: boolean;
    tags?: string[];
    review_cadence_days?: number | null;
    changeSummary?: string;
    editedBy: string;
  }
): Promise<WikiPage | null> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.content !== undefined) dbUpdates.content = updates.content;
  if (updates.department !== undefined) dbUpdates.department = updates.department;
  if (updates.is_published !== undefined) dbUpdates.is_published = updates.is_published;
  if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
  if (updates.review_cadence_days !== undefined) dbUpdates.review_cadence_days = updates.review_cadence_days;

  const { data: page, error } = await supabase
    .from('wiki_pages')
    .update(dbUpdates)
    .eq('id', pageId)
    .select()
    .single();

  if (error) return null;

  // Create new version if content or title changed
  if (updates.content !== undefined || updates.title !== undefined) {
    // Get latest version number
    const { data: versions } = await supabase
      .from('wiki_page_versions')
      .select('version_number')
      .eq('page_id', pageId)
      .order('version_number', { ascending: false })
      .limit(1);

    const nextVersion = versions && versions.length > 0 ? versions[0].version_number + 1 : 1;

    await supabase.from('wiki_page_versions').insert({
      page_id: pageId,
      version_number: nextVersion,
      title: page.title,
      content: page.content,
      change_summary: updates.changeSummary ?? null,
      edited_by: updates.editedBy,
    });
  }

  return page as WikiPage;
}

export async function deleteWikiPage(
  supabase: SupabaseClient,
  pageId: string
): Promise<void> {
  await supabase.from('wiki_pages').delete().eq('id', pageId);
}

// ============================================================================
// VERSIONS
// ============================================================================

export async function getPageVersions(
  supabase: SupabaseClient,
  pageId: string
): Promise<WikiPageVersion[]> {
  const { data } = await supabase
    .from('wiki_page_versions')
    .select('*')
    .eq('page_id', pageId)
    .order('version_number', { ascending: false });

  return (data as WikiPageVersion[]) ?? [];
}

// ============================================================================
// BOARD PINS
// ============================================================================

export async function pinPageToBoard(
  supabase: SupabaseClient,
  boardId: string,
  pageId: string,
  userId: string
): Promise<BoardWikiPin | null> {
  const { data, error } = await supabase
    .from('board_wiki_pins')
    .upsert({ board_id: boardId, page_id: pageId, pinned_by: userId })
    .select()
    .single();

  if (error) return null;
  return data as BoardWikiPin;
}

export async function getBoardPins(
  supabase: SupabaseClient,
  boardId: string
): Promise<BoardWikiPin[]> {
  const { data } = await supabase
    .from('board_wiki_pins')
    .select('*')
    .eq('board_id', boardId)
    .order('position', { ascending: true });

  return (data as BoardWikiPin[]) ?? [];
}

export async function unpinPage(
  supabase: SupabaseClient,
  boardId: string,
  pageId: string
): Promise<void> {
  await supabase
    .from('board_wiki_pins')
    .delete()
    .eq('board_id', boardId)
    .eq('page_id', pageId);
}
