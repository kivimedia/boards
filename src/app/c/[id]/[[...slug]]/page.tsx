import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { redirect, notFound } from 'next/navigation';
import { slugify, isUUID } from '@/lib/slugify';

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
 * New format:  /c/[board-slug]/[person-slug]/[card-slug]
 *   e.g.       /c/daily-cookie-copywriters/riza/spark-david
 *
 * Legacy:      /c/[cardId]/[title-slug]   (UUID in first segment)
 *   e.g.       /c/9933419a-.../spark-david
 */
export default async function CardDeepLinkPage({ params }: Props) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const db = getAdminClient() ?? supabase;
  const segments = [params.id, ...(params.slug ?? [])];

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

  // ── New format: /c/[board-slug]/[person-slug]/[card-slug] ───────────────
  if (segments.length === 3) {
    const [boardSlug, personSlug, cardSlug] = segments;

    // 1. Find board by slug
    const { data: allBoards } = await db.from('boards').select('id, name');
    const board = (allBoards ?? []).find((b: any) => slugify(b.name) === boardSlug);
    if (!board) notFound();

    // 2. Get list IDs for this board
    const { data: lists } = await db
      .from('lists')
      .select('id')
      .eq('board_id', board.id);

    const listIds = (lists ?? []).map((l: any) => l.id);
    if (!listIds.length) notFound();

    // 3. Search for cards matching the slug (targeted query to avoid 1000-row limit)
    //    Convert slug back to a search pattern: "sara-march-18-flyer" -> "%sara%march%18%flyer%"
    const titlePattern = cardSlug.split('-').filter(Boolean).join('%');
    const { data: candidates } = await db
      .from('card_placements')
      .select('card_id, cards!inner(id, title)')
      .in('list_id', listIds)
      .ilike('cards.title', `%${titlePattern}%`)
      .limit(50);

    // Exact slug match from candidates
    const matches = (candidates ?? []).filter((p: any) =>
      p.cards && slugify(p.cards.title) === cardSlug
    );

    if (!matches.length) notFound();

    // 4. Try assignee match first
    for (const p of matches) {
      const c = (p as any).cards;
      const { data: assigneeRows } = await db
        .from('card_assignees')
        .select('profiles(display_name)')
        .eq('card_id', c.id);

      const assigneeMatches = (assigneeRows ?? []).some((row: any) => {
        const name = row.profiles?.display_name ?? '';
        return slugify(name.split(' ')[0]) === personSlug;
      });

      const noAssignees = !assigneeRows || assigneeRows.length === 0;
      if (assigneeMatches || (noAssignees && personSlug === 'unassigned')) {
        redirect(`/board/${boardSlug}?card=${c.id}`);
      }
    }

    // 5. Fallback: match by card slug alone (ignore person segment)
    const firstMatch = (matches[0] as any).cards;
    redirect(`/board/${boardSlug}?card=${firstMatch.id}`);
  }

  // ── Single segment (board slug only or unknown) ──────────────────────────
  notFound();
}
