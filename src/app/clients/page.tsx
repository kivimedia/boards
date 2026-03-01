import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ClientsListView from '@/components/clients/ClientsListView';

export default async function ClientsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Pre-fetch boards for sidebar
  const { data: boards } = await supabase
    .from('boards')
    .select('*')
    .order('created_at', { ascending: true });

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar initialBoards={boards || []} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Clients" />
        <div className="flex items-center justify-end px-4 pt-3 gap-2">
          <Link
            href="/pageforge/sites"
            className="px-3 py-1.5 text-xs font-semibold text-electric border border-electric rounded-lg hover:bg-electric/5 dark:hover:bg-electric/10 transition-colors font-heading"
          >
            PageForge Sites
          </Link>
        </div>
        <ClientsListView />
      </main>
    </div>
  );
}
