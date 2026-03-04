import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ChangePasswordForm from '@/components/settings/ChangePasswordForm';

export default async function AccountSettingsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const { data: boards } = await supabase
    .from('boards')
    .select('*')
    .order('created_at', { ascending: true });

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar initialBoards={boards || []} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="My Account" />
        <div className="flex-1 overflow-y-auto bg-cream dark:bg-dark-bg p-4 sm:p-6">
          <div className="max-w-4xl mx-auto space-y-8">
            {/* Profile Info */}
            <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
              <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base mb-4">
                Profile
              </h3>
              <div className="space-y-2 text-sm font-body text-navy/60 dark:text-slate-400">
                <p><span className="font-medium text-navy dark:text-slate-200">Name:</span> {profile?.display_name || 'Not set'}</p>
                <p><span className="font-medium text-navy dark:text-slate-200">Email:</span> {user.email}</p>
                <p><span className="font-medium text-navy dark:text-slate-200">Role:</span> {profile?.user_role || profile?.role || 'member'}</p>
              </div>
            </div>

            {/* Change Password */}
            <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
              <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base mb-4">
                Change Password
              </h3>
              <ChangePasswordForm />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
