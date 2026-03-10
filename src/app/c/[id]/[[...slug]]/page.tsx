import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { redirect, notFound } from 'next/navigation';
import { slugify, isUUID, isShortId, toShortId } from '@/lib/slugify';

interface Props {
  params: { id: string; slug?: string[] };
}

function getAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

/**
 * Deep-link routes for cards:
 *
 * Current:  /c/[8hexchars]   (first 8 hex chars of card UUID)
 *   e.g.    /c/9933419a
 *
 * Legacy (slug):  /c/[board-slug]/[list-slug]/[card-slug]
 * Legacy (UUID):  /c/[full-UUID]/[anything]
 */
export default async function CardDeepLinkPage({ params }: Props) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const db = getAdminClient() ?? supabase;
  const segments = [params.id, ...(params.slug ?? [])];

  // ── Short ID: /c/[8hexchars] ─────────────────────────────────────────────
  if (isShortId(segments[0])) {
    const shortId = segments[0].toLowerCase();
    // UUIDs are stored with hyphens; prefix-match on the hex digits
    const { data: cards } = await db
      .from('cards')
      .select('id')
      .ilike('id', `${shortId.slice(0, 8)}%`)
      .limit(5);

    // Find the card whose UUID starts with shortId (after stripping hyphens)
    const matched = (cards ?? []).find((c: any) => toShortId(c.id) === shortId);
    if (!matched) notFound();

    const cardId = matched.id;
    const { data: placement } = await db
      .from('card_placements')
      .select('list_id, lists(board_id, boards(id, name))')
      .eq('card_id', cardId)
      .limit(1)
      .single();

    const boardData = (placement?.lists as any)?.boards;
    if (!boardData?.id) notFound();
    redirect(`/board/${slugify(boardData.name)}?card=${cardId}`);
  }

  // ── Legacy: /c/[UUID]/[anything] ────────────────────────────────────────
  if (isUUID(segments[0])) {
    const cardId = segments[0];
    const { data: placement } = await db
      .from('card_placements')
      .select('list_id, lists(board_id, boards(id, name))')
      .eq('card_id', cardId)
      .limit(1)
      .single();

    const boardData = (placement?.lists as any)?.boards;
    if (!boardData?.id) notFound();
    redirect(`/board/${slugify(boardData.name)}?card=${cardId}`);
  }

  // ── New format: /c/[board-slug]/[list-slug]/[card-slug] ───────────────
  if (segments.length === 3) {
    const [boardSlug, listSlug, cardSlug] = segments;

    // 1. Find board by slug
    const { data: allBoards } = await db.from('boards').select('id, name');
    const board = (allBoards ?? []).find((b: any) => slugify(b.name) === boardSlug);
    if (!board) notFound();

    // 2. Get lists for this board
    const { data: lists } = await db
      .from('lists')
      .select('id, name')
      .eq('board_id', board.id);

    const allListIds = (lists ?? []).map((l: any) => l.id);
    if (!allListIds.length) notFound();

    // 3. Search for cards matching the card slug (targeted query to avoid 1000-row limit)
    //    Convert slug back to a search pattern: "sara-march-18-flyer" -> "%sara%march%18%flyer%"
    const titlePattern = cardSlug.split('-').filter(Boolean).join('%');
    const { data: candidates } = await db
      .from('card_placements')
      .select('card_id, list_id, cards!inner(id, title)')
      .in('list_id', allListIds)
      .ilike('cards.title', `%${titlePattern}%`)
      .limit(50);

    // Exact slug match from candidates
    const matches = (candidates ?? []).filter((p: any) =>
      p.cards && slugify(p.cards.title) === cardSlug
    );

    if (!matches.length) notFound();

    // 4. Try list slug match first
    const listMap = new Map((lists ?? []).map((l: any) => [l.id, l.name]));
    for (const p of matches) {
      const c = (p as any).cards;
      const matchedListName = listMap.get((p as any).list_id) ?? '';
      if (slugify(matchedListName) === listSlug) {
        redirect(`/board/${boardSlug}?card=${c.id}`);
      }
    }

    // 5. Fallback: match by card slug alone (ignore list segment)
    const firstMatch = (matches[0] as any).cards;
    redirect(`/board/${boardSlug}?card=${firstMatch.id}`);
  }

  // ── Single segment (board slug only or unknown) ──────────────────────────
  notFound();
}
