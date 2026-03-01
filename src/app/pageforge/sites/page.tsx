import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import PageForgeSitesList from '@/components/pageforge/PageForgeSitesList';

export const metadata = { title: 'Manage Sites - PageForge' };

export default async function PageForgeSitesPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Manage Sites" />
        <div className="flex-1 overflow-y-auto">
          <PageForgeSitesList />
        </div>
      </main>
    </div>
  );
}
