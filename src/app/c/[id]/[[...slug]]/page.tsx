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

    // 2. Fetch all cards on this board with their assignees
    const { data: placements } = await db
      .from('card_placements')
      .select('card_id, cards(id, title), card_assignees(user_id, profiles(display_name))')
      .eq('lists.board_id', board.id)
      .eq('is_mirror', false);

    // Supabase join filtering — fetch via lists table instead
    const { data: lists } = await db
      .from('lists')
      .select('id')
      .eq('board_id', board.id);

    const listIds = (lists ?? []).map((l: any) => l.id);

    const { data: boardPlacements } = await db
      .from('card_placements')
      .select('card_id, cards(id, title)')
      .in('list_id', listIds.length > 0 ? listIds : ['none']);

    if (!boardPlacements?.length) notFound();

    // 3. For each placement, check if card slug + assignee slug match
    for (const p of boardPlacements) {
      const c = p.cards as any;
      if (!c || slugify(c.title) !== cardSlug) continue;

      // Fetch assignees for this card
      const { data: assigneeRows } = await db
        .from('card_assignees')
        .select('profiles(display_name)')
        .eq('card_id', c.id);

      const assigneeMatches = (assigneeRows ?? []).some((row: any) => {
        const name = row.profiles?.display_name ?? '';
        return slugify(name.split(' ')[0]) === personSlug;
      });

      // Also match 'unassigned' if no assignees
      const noAssignees = !assigneeRows || assigneeRows.length === 0;
      if (assigneeMatches || (noAssignees && personSlug === 'unassigned')) {
        redirect(`/board/${boardSlug}?card=${c.id}`);
      }
    }

    // 4. Fallback: match by card slug alone (ignore person segment)
    const cardBySlug = (boardPlacements ?? []).find((p: any) =>
      p.cards && slugify((p.cards as any).title) === cardSlug
    );
    if (cardBySlug) {
      redirect(`/board/${boardSlug}?card=${(cardBySlug.cards as any).id}`);
    }

    notFound();
  }

  // ── Single segment (board slug only or unknown) ──────────────────────────
  notFound();
}
