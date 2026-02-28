import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import PageForgeBuildDetail from '@/components/pageforge/PageForgeBuildDetail';

export const metadata = { title: 'Build Detail - PageForge' };

export default async function PageForgeBuildPage({ params }: { params: { buildId: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Build Detail" />
        <div className="flex-1 overflow-y-auto">
          <PageForgeBuildDetail buildId={params.buildId} />
        </div>
      </main>
    </div>
  );
}
