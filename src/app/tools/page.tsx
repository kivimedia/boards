import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import Link from 'next/link';

const TOOLS = [
  {
    title: 'Fathom Meetings',
    description: 'View meeting recordings, manage participant identities, analyze summaries, and track client engagement.',
    href: '/meetings',
    icon: '🎥',
  },
  {
    title: 'Client Offboarding',
    description: 'Generate a comprehensive handoff report with all Figma, Canva, Dropbox, Drive links, credentials, and project history.',
    href: '/tools/offboarding',
    icon: '📦',
  },
];

export default async function ToolsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Tools" />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            <p className="text-navy/60 dark:text-slate-400 font-body mb-8">
              Automation tools to save time on recurring tasks.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {TOOLS.map(tool => (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-cream-dark dark:border-slate-700 hover:border-brand dark:hover:border-brand transition-all group"
                >
                  <div className="text-3xl mb-3">{tool.icon}</div>
                  <h2 className="text-lg font-bold text-navy dark:text-white font-heading group-hover:text-brand transition-colors">
                    {tool.title}
                  </h2>
                  <p className="text-sm text-navy/60 dark:text-slate-400 font-body mt-1">
                    {tool.description}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
