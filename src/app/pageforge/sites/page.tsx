import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import PageForgeSiteProfile from '@/components/pageforge/PageForgeSiteProfile';

export const metadata = { title: 'Site Profiles - PageForge' };

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
        <Header title="Site Profiles" />
        <div className="flex-1 overflow-y-auto">
          <PageForgeSiteProfile />
        </div>
      </main>
    </div>
  );
}
