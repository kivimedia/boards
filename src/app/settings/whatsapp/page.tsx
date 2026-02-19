import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import PhoneLinkForm from '@/components/whatsapp/PhoneLinkForm';
import WhatsAppSettings from '@/components/whatsapp/WhatsAppSettings';
import WhatsAppConfigForm from '@/components/whatsapp/WhatsAppConfigForm';
import QuickActionManager from '@/components/whatsapp/QuickActionManager';
import DigestConfigForm from '@/components/whatsapp/DigestConfigForm';
import MessageLog from '@/components/whatsapp/MessageLog';
import CustomActionBuilder from '@/components/whatsapp/CustomActionBuilder';
import DigestTemplateEditor from '@/components/whatsapp/DigestTemplateEditor';

export default async function WhatsAppSettingsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Check if user is admin for showing Business API config
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="WhatsApp Integration" backHref="/settings" />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="mb-6">
              <h2 className="text-lg font-bold text-navy dark:text-white font-heading">WhatsApp Integration</h2>
              <p className="text-sm text-navy/50 dark:text-slate-400 font-body mt-1">
                Link your WhatsApp number, configure notifications, quick actions, and daily digests.
              </p>
            </div>

            {/* Admin: WhatsApp Business API Config */}
            {isAdmin && (
              <div className="mb-6 rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5">
                <WhatsAppConfigForm />
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left column */}
              <div className="space-y-6">
                <PhoneLinkForm />
                <WhatsAppSettings />
                <DigestConfigForm />
              </div>

              {/* Right column */}
              <div className="space-y-6">
                <QuickActionManager />
                <MessageLog />
              </div>
            </div>

            {/* Advanced: Custom Actions & Digest Templates (full width) */}
            <div className="mt-8 space-y-8">
              <div className="rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5">
                <CustomActionBuilder />
              </div>
              <div className="rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5">
                <DigestTemplateEditor />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
