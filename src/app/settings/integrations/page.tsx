import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import IntegrationList from '@/components/integrations/IntegrationList';

export default async function IntegrationsSettingsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Integrations" backHref="/settings" />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="mb-6">
              <h2 className="text-lg font-bold text-navy font-heading">Integrations</h2>
              <p className="text-sm text-navy/50 font-body mt-1">
                Connect Slack, GitHub, and Figma to streamline your workflow.
              </p>
            </div>
            <IntegrationList />
          </div>
        </div>
      </main>
    </div>
  );
}
