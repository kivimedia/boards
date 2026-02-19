import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import UserManagement from '@/components/settings/UserManagement';
import { isAdmin } from '@/lib/permissions';
import { UserRole } from '@/lib/types';

export default async function UsersSettingsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const userRole = (currentProfile?.user_role || currentProfile?.role || 'member') as UserRole;

  if (!isAdmin(userRole)) {
    redirect('/settings');
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .order('display_name', { ascending: true });

  const profilesWithRole = (profiles || []).map((p) => ({
    ...p,
    user_role: (p.user_role || 'member') as UserRole,
  }));

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="User Management" backHref="/settings" />
        <UserManagement initialProfiles={profilesWithRole} currentUserId={user.id} />
      </main>
    </div>
  );
}
