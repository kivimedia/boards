import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import RevisionPageContent from './RevisionPageContent';

export default async function RevisionsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch boards for the selector
  const { data: boards } = await supabase
    .from('boards')
    .select('id, name, type')
    .order('name', { ascending: true });

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Revision Analysis" />
        <RevisionPageContent boards={boards ?? []} />
      </main>
    </div>
  );
}
