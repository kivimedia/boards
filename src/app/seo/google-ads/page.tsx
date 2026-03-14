import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import GoogleAdsDashboard from '@/components/seo/GoogleAdsDashboard';

export default async function GoogleAdsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Google Ads Intelligence" />
        <div className="flex-1 overflow-y-auto">
          <GoogleAdsDashboard />
        </div>
      </main>
    </div>
  );
}
