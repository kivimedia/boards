import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import PodcastIntegrationSettings from '@/components/podcast/PodcastIntegrationSettings';

export default async function PodcastSettingsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Podcast Integrations" backHref="/settings" />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="mb-6">
              <h2 className="text-lg font-bold text-navy dark:text-slate-100 font-heading">
                Podcast Integrations
              </h2>
              <p className="text-sm text-navy/50 dark:text-slate-400 font-body mt-1">
                Configure external services for email sending, discovery, and scheduling.
              </p>
            </div>
            <PodcastIntegrationSettings />
          </div>
        </div>
      </main>
    </div>
  );
}
