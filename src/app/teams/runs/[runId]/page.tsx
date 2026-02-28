import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import TeamRunDetail from '@/components/teams/TeamRunDetail';

export default async function TeamRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { runId } = await params;

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Team Run" />
        <div className="flex-1 overflow-y-auto">
          <TeamRunDetail runId={runId} />
        </div>
      </main>
    </div>
  );
}
