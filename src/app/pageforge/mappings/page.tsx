import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import PageForgeMappingsAdmin from '@/components/pageforge/PageForgeMappingsAdmin';

export const metadata = { title: 'Divi 5 Mappings - PageForge' };

export default async function PageForgeMappingsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch site profiles for the filter dropdown
  const { data: sites } = await supabase
    .from('pageforge_site_profiles')
    .select('id, name')
    .order('name');

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Divi 5 Mappings" backHref="/pageforge" />
        <div className="flex-1 overflow-y-auto bg-cream dark:bg-dark-bg p-4 sm:p-6">
          <div className="max-w-5xl mx-auto">
            <PageForgeMappingsAdmin sites={sites || []} />
          </div>
        </div>
      </main>
    </div>
  );
}
