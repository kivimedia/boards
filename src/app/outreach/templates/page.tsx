import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import TemplateEditor from '@/components/outreach/TemplateEditor';

export const metadata = { title: 'Message Templates - LinkedIn Outreach - KM Boards' };

export default async function TemplatesPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Message Templates" />
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <TemplateEditor />
        </div>
      </main>
    </div>
  );
}
