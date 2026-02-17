import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import BoardMaintenanceContent from '@/components/settings/BoardMaintenanceContent';

export default async function BoardMaintenancePage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch all non-archived boards for the selector
  const { data: boards } = await supabase
    .from('boards')
    .select('id, name, is_archived')
    .order('name');

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Board Maintenance" />
        <div className="flex-1 overflow-y-auto bg-cream dark:bg-dark-bg p-6">
          <div className="max-w-5xl mx-auto">
            <p className="text-navy/60 dark:text-slate-400 font-body text-sm mb-8">
              Scan boards for duplicate cards and clean them up. Select specific boards or run across all boards at once.
            </p>
            <BoardMaintenanceContent boards={boards || []} />
          </div>
        </div>
      </main>
    </div>
  );
}
