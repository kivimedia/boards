import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import ManageClientUpdatesContent from './ManageClientUpdatesContent';

export default async function ManageClientUpdatesPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const canManage =
    profile?.role === 'admin' || (user.email || '').toLowerCase() === 'devi@dailycookie.co';

  const { data: managerRows } = await supabase
    .from('pk_client_updates')
    .select('account_manager_name')
    .order('account_manager_name', { ascending: true })
    .limit(5000);

  const initialAmNames = Array.from(
    new Set(
      (managerRows || [])
        .map((row: { account_manager_name: string | null }) => (row.account_manager_name || '').trim())
        .filter(Boolean)
    )
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Manage Client Updates" backHref="/performance" />
        <ManageClientUpdatesContent
          initialAmNames={initialAmNames}
          canManage={canManage}
        />
      </main>
    </div>
  );
}
