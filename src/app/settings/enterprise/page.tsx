import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import EnterpriseSettings from '@/components/enterprise/EnterpriseSettings';

export default async function EnterpriseSettingsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Enterprise Settings" backHref="/settings" />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-5xl mx-auto">
            <div className="mb-6">
              <h2 className="text-lg font-bold text-navy font-heading">Enterprise Security &amp; AI</h2>
              <p className="text-sm text-navy/50 font-body mt-1">
                Configure SSO, IP whitelisting, audit logging, and AI accuracy tracking.
              </p>
            </div>
            <EnterpriseSettings />
          </div>
        </div>
      </main>
    </div>
  );
}
