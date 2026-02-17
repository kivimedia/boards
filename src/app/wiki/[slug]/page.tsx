import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getWikiPage } from '@/lib/wiki';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import WikiPageView from '@/components/wiki/WikiPageView';

interface Props {
  params: { slug: string };
}

export default async function WikiPageDetailPage({ params }: Props) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const page = await getWikiPage(supabase, params.slug);

  if (!page) {
    notFound();
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title={page.title} />
        <WikiPageView page={page} />
      </main>
    </div>
  );
}
