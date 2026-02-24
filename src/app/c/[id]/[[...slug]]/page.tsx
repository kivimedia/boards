import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { slugify } from '@/lib/slugify';

interface Props {
  params: { id: string; slug?: string[] };
}

/**
 * /c/[cardId]/[optional-title-slug]
 *
 * Deep-link to a specific card. Finds the card's board and redirects to
 * /board/[board-slug]?card=[cardId] which opens the card modal automatically.
 */
export default async function CardDeepLinkPage({ params }: Props) {
  const { id: cardId } = params;

  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Find the card's primary placement → list → board (with name for slug)
  const { data: placement } = await supabase
    .from('card_placements')
    .select('list_id, lists(board_id, boards(id, name))')
    .eq('card_id', cardId)
    .eq('is_mirror', false)
    .limit(1)
    .single();

  const boardData = (placement?.lists as any)?.boards;
  if (boardData?.id && boardData?.name) {
    redirect(`/board/${slugify(boardData.name)}?card=${cardId}`);
  }

  // Fallback: try any placement
  const { data: anyPlacement } = await supabase
    .from('card_placements')
    .select('list_id, lists(board_id, boards(id, name))')
    .eq('card_id', cardId)
    .limit(1)
    .single();

  const fallbackBoard = (anyPlacement?.lists as any)?.boards;
  if (!fallbackBoard?.id) notFound();
  redirect(`/board/${slugify(fallbackBoard.name)}?card=${cardId}`);
}
