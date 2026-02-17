import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import BoardView from '@/components/board/BoardView';
import { canAccessBoardByRole } from '@/lib/permissions';
import { BoardWithLists } from '@/lib/types';
import type { BoardProfilingData } from '@/stores/profiling-store';

interface BoardPageProps {
  params: { id: string };
}

export default async function BoardPage({ params }: BoardPageProps) {
  const ssrStart = performance.now();

  const supabase = createServerSupabaseClient();
  const tAuth0 = performance.now();
  const { data: { user } } = await supabase.auth.getUser();
  const authMs = performance.now() - tAuth0;

  if (!user) {
    redirect('/login');
  }

  // Fetch board + role + lists + labels + sidebar in parallel (all lightweight)
  const tParallel0 = performance.now();
  const [
    { data: board },
    { data: profile },
    { data: allBoards },
  ] = await Promise.all([
    supabase.from('boards').select('*').eq('id', params.id).single(),
    supabase.from('profiles').select('agency_role').eq('id', user.id).single(),
    supabase.from('boards').select('*').order('created_at', { ascending: true }),
  ]);
  const parallelMs = performance.now() - tParallel0;

  if (!board) {
    notFound();
  }

  if (profile?.agency_role && !canAccessBoardByRole(profile.agency_role, board.type)) {
    redirect('/');
  }

  // Fetch lists + labels (lightweight, needed for board shell)
  const tLists0 = performance.now();
  const [{ data: listsData }, { data: labelsData }] = await Promise.all([
    supabase.from('lists').select('*').eq('board_id', board.id).order('position'),
    supabase.from('labels').select('*').eq('board_id', board.id),
  ]);
  const listsLabelsMs = performance.now() - tLists0;

  // SSR shell: board + empty lists (no cards) -- cards load client-side via useBoard
  const initialBoard: BoardWithLists = {
    ...board,
    lists: (listsData || []).map((list: any) => ({ ...list, cards: [] })),
    labels: labelsData || [],
  };

  const ssrTotal = performance.now() - ssrStart;

  const initialTimings: BoardProfilingData = {
    phases: [
      { name: 'Auth check', ms: authMs },
      { name: 'Board + Role + Sidebar', ms: parallelMs },
      { name: 'Lists + Labels', ms: listsLabelsMs },
    ],
    totalMs: ssrTotal,
    cardCount: 0,
    coverCount: 0,
    cachedCovers: 0,
    source: 'ssr',
    boardName: board.name,
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar initialBoards={allBoards || []} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <BoardView boardId={board.id} boardName={board.name} initialBoard={initialBoard} initialTimings={initialTimings} />
      </main>
    </div>
  );
}
