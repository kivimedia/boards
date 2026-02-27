import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import SeoRunDetail from '@/components/seo/SeoRunDetail';

interface Params {
  params: { runId: string };
}

export default async function SeoRunPage({ params }: Params) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { runId } = params;

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="SEO Run Detail" backHref="/seo" />
        <div className="flex-1 overflow-y-auto">
          <SeoRunDetail runId={runId} />
        </div>
      </main>
    </div>
  );
}
