import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getWikiPage } from '@/lib/wiki';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import WikiEditContent from '@/components/wiki/WikiEditContent';

interface Props {
  params: { slug: string };
}

export default async function WikiEditPage({ params }: Props) {
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
        <Header title={`Edit: ${page.title}`} />
        <WikiEditContent page={page} />
      </main>
    </div>
  );
}
