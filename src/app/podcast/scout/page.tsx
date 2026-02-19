import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import ScoutWizard from '@/components/podcast/ScoutWizard';

export default async function ScoutPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="LinkedIn Scout Pipeline" />
        <div className="flex-1 overflow-auto p-6 bg-cream dark:bg-slate-900">
          <ScoutWizard />
        </div>
      </main>
    </div>
  );
}
